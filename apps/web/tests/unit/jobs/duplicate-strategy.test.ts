/**
 * Unit tests for the "update" duplicate strategy in extractDuplicateRows and processEventBatch.
 *
 * Verifies that:
 * - extractDuplicateRows correctly routes duplicates to skipRows vs updateRows based on strategy
 * - processEventBatch calls payload.update() for update-strategy rows and bulk-inserts new rows
 *
 * @module
 * @category Tests
 */
// Import centralized mocks FIRST (before anything that uses them)
import "@/tests/mocks/services/logger";

// vi.hoisted for values needed in vi.mock factories
const mocks = vi.hoisted(() => ({
  getIngestGeocodingResults: vi.fn(),
  bulkInsertEvents: vi.fn(),
  extractDenormalizedAccessFields: vi.fn(),
}));

// Mock external dependencies used by process-batch
vi.mock("@/lib/ingest/types/geocoding", () => ({ getIngestGeocodingResults: mocks.getIngestGeocodingResults }));

vi.mock("@/lib/jobs/utils/bulk-event-insert", () => ({ bulkInsertEvents: mocks.bulkInsertEvents }));

vi.mock("@/lib/collections/catalog-ownership", () => ({
  extractDenormalizedAccessFields: mocks.extractDenormalizedAccessFields,
}));

vi.mock("@/lib/ingest/transforms", () => ({ applyTransforms: vi.fn((row: Record<string, unknown>) => row) }));

vi.mock("@/lib/services/id-generation", () => ({ generateUniqueId: vi.fn(() => "mock-unique-id") }));

vi.mock("@/lib/jobs/utils/upload-path", () => ({
  getIngestFilePath: vi.fn((filename: string) => `/mock/ingest-files/${filename}`),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcessBatchContext } from "@/lib/jobs/handlers/create-events-batch/process-batch";
import { processEventBatch } from "@/lib/jobs/handlers/create-events-batch/process-batch";
import { extractDuplicateRows } from "@/lib/jobs/utils/resource-loading";
import type { IngestJob } from "@/payload-types";
import { createMockLogger } from "@/tests/mocks/services/logger";

// ---------------------------------------------------------------------------
// extractDuplicateRows
// ---------------------------------------------------------------------------

describe("extractDuplicateRows", () => {
  const buildJob = (duplicates: unknown): IngestJob => ({ duplicates }) as unknown as IngestJob;

  describe("with no duplicates", () => {
    it("returns empty skipRows and updateRows when duplicates is undefined", () => {
      const job = buildJob(undefined);
      const { skipRows, updateRows } = extractDuplicateRows(job);

      expect(skipRows.size).toBe(0);
      expect(updateRows.size).toBe(0);
    });

    it("returns empty skipRows and updateRows when duplicates has empty arrays", () => {
      const job = buildJob({ internal: [], external: [] });
      const { skipRows, updateRows } = extractDuplicateRows(job, "skip");

      expect(skipRows.size).toBe(0);
      expect(updateRows.size).toBe(0);
    });
  });

  describe('with strategy "skip"', () => {
    it("puts all internal and external duplicates into skipRows", () => {
      const job = buildJob({
        internal: [{ rowNumber: 1 }, { rowNumber: 3 }],
        external: [
          { rowNumber: 5, existingEventId: "evt-100" },
          { rowNumber: 7, existingEventId: "evt-200" },
        ],
      });

      const { skipRows, updateRows } = extractDuplicateRows(job, "skip");

      expect(skipRows).toEqual(new Set([1, 3, 5, 7]));
      expect(updateRows.size).toBe(0);
    });

    it("defaults to skip when no strategy is provided", () => {
      const job = buildJob({ internal: [], external: [{ rowNumber: 2, existingEventId: "evt-50" }] });

      const { skipRows, updateRows } = extractDuplicateRows(job);

      expect(skipRows).toEqual(new Set([2]));
      expect(updateRows.size).toBe(0);
    });
  });

  describe('with strategy "update"', () => {
    it("puts internal dupes into skipRows and external dupes into updateRows", () => {
      const job = buildJob({
        internal: [{ rowNumber: 0 }, { rowNumber: 4 }],
        external: [
          { rowNumber: 2, existingEventId: "evt-10" },
          { rowNumber: 6, existingEventId: 42 },
        ],
      });

      const { skipRows, updateRows } = extractDuplicateRows(job, "update");

      // Internal dupes are always skipped
      expect(skipRows).toEqual(new Set([0, 4]));

      // External dupes with existingEventId go to updateRows
      expect(updateRows.size).toBe(2);
      expect(updateRows.get(2)).toBe("evt-10");
      expect(updateRows.get(6)).toBe(42);
    });

    it("falls back to skipRows when existingEventId is missing", () => {
      const job = buildJob({
        internal: [],
        external: [
          { rowNumber: 1, existingEventId: "evt-10" },
          { rowNumber: 3 }, // no existingEventId
          { rowNumber: 5, existingEventId: undefined },
        ],
      });

      const { skipRows, updateRows } = extractDuplicateRows(job, "update");

      // Row 1 has an existingEventId → updateRows
      expect(updateRows.get(1)).toBe("evt-10");
      expect(updateRows.size).toBe(1);

      // Rows 3 and 5 have no existingEventId → skipRows
      expect(skipRows).toEqual(new Set([3, 5]));
    });
  });

  describe("edge cases", () => {
    it("handles non-object duplicates gracefully", () => {
      const job = buildJob("not-an-object");
      const { skipRows, updateRows } = extractDuplicateRows(job, "update");

      expect(skipRows.size).toBe(0);
      expect(updateRows.size).toBe(0);
    });

    it("handles array duplicates gracefully", () => {
      const job = buildJob([1, 2, 3]);
      const { skipRows, updateRows } = extractDuplicateRows(job, "update");

      expect(skipRows.size).toBe(0);
      expect(updateRows.size).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// processEventBatch
// ---------------------------------------------------------------------------

/** Get the events array from the Nth call to bulkInsertEvents (0-indexed). */
const getBulkInsertedEvents = (callIndex = 0): unknown[] => {
  const call = mocks.bulkInsertEvents.mock.calls[callIndex] as [unknown, unknown[]];
  return call[1];
};

describe.sequential("processEventBatch", () => {
  let mockPayload: any;
  let baseCtx: ProcessBatchContext;

  /** Build a minimal IngestJob-like object with configurable duplicates and strategy. */
  const buildIngestJob = (opts: { duplicateStrategy?: string; duplicates?: unknown }): IngestJob => {
    const configSnapshot = opts.duplicateStrategy
      ? { idStrategy: { duplicateStrategy: opts.duplicateStrategy } }
      : undefined;
    return {
      id: "import-123",
      dataset: "dataset-456",
      ingestFile: "file-789",
      sheetIndex: 0,
      duplicates: opts.duplicates ?? { internal: [], external: [] },
      configSnapshot,
    } as unknown as IngestJob;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: bulkInsertEvents returns the count of events passed in
    // eslint-disable-next-line @typescript-eslint/require-await
    mocks.bulkInsertEvents.mockImplementation(async (_p: unknown, events: unknown[]) => events.length);

    mocks.getIngestGeocodingResults.mockReturnValue({});

    // Stub `db.drizzle.select(...).from(...).where(...)` used by
    // validateUpdateIdsInDataset. By default returns any id Number()-coerced
    // from `updateRows` so existing expectations (all updates allowed) hold.
    const datasetIdAllowlist = new Set<number>();
    const drizzleWhere = vi.fn().mockImplementation(() => Array.from(datasetIdAllowlist).map((id) => ({ id })));
    mockPayload = {
      findByID: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
      jobs: { queue: vi.fn().mockResolvedValue({}) },
      db: { drizzle: { select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: drizzleWhere }) }) } },
    };
    // Tests call `allowDatasetIds([...])` inside their setup to seed which
    // event ids this mock says belong to the dataset.
    (mockPayload as unknown as { __allowDatasetIds: (ids: Array<number | string>) => void }).__allowDatasetIds = (
      ids
    ) => {
      datasetIdAllowlist.clear();
      for (const id of ids) {
        const n = Number(id);
        if (Number.isInteger(n)) datasetIdAllowlist.add(n);
      }
    };

    const mockDataset: any = { id: 456, idStrategy: { type: "external", externalIdPath: "id" } };

    baseCtx = {
      payload: mockPayload,
      job: buildIngestJob({}),
      dataset: mockDataset,
      ingestJobId: "import-123",
      accessFields: { datasetIsPublic: false, catalogOwnerId: undefined },
      logger: createMockLogger(),
    };
  });

  describe('strategy "skip" (default)', () => {
    it("skips external duplicates and inserts non-duplicates", async () => {
      const job = buildIngestJob({ duplicates: { internal: [], external: [{ rowNumber: 1, existingEventId: 9001 }] } });

      const ctx: ProcessBatchContext = { ...baseCtx, job };

      const rows = [
        { id: "a", title: "New Event" },
        { id: "b", title: "Duplicate Event" },
      ];

      const result = await processEventBatch(ctx, rows, 0);

      // Row 1 is an external duplicate → skipped
      expect(result.eventsSkipped).toBe(1);
      expect(result.eventsUpdated).toBe(0);

      // Row 0 is new → bulk inserted
      expect(mocks.bulkInsertEvents).toHaveBeenCalledTimes(1);
      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents).toHaveLength(1);

      // payload.update should NOT be called with collection "events"
      expect(mockPayload.update).not.toHaveBeenCalled();
    });
  });

  describe('strategy "update"', () => {
    it("updates external duplicates via payload.update() instead of skipping", async () => {
      mockPayload.__allowDatasetIds([42]);
      const job = buildIngestJob({
        duplicateStrategy: "update",
        duplicates: { internal: [], external: [{ rowNumber: 0, existingEventId: 42 }] },
      });

      const ctx: ProcessBatchContext = { ...baseCtx, job };

      const rows = [{ id: "a", title: "Updated Event" }];

      const result = await processEventBatch(ctx, rows, 0);

      expect(result.eventsUpdated).toBe(1);
      expect(result.eventsSkipped).toBe(0);

      // Verify payload.update was called with the correct arguments
      expect(mockPayload.update).toHaveBeenCalledTimes(1);
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "events",
          id: 42,
          overrideAccess: true,
          data: expect.objectContaining({
            transformedData: expect.objectContaining({ id: "a", title: "Updated Event" }),
            sourceData: expect.objectContaining({ id: "a", title: "Updated Event" }),
          }),
        })
      );

      // No bulk insert for updated rows
      expect(mocks.bulkInsertEvents).not.toHaveBeenCalled();
    });

    it("passes correct data fields to payload.update()", async () => {
      mockPayload.__allowDatasetIds([99]);
      const job = buildIngestJob({
        duplicateStrategy: "update",
        duplicates: { internal: [], external: [{ rowNumber: 0, existingEventId: 99 }] },
      });

      const ctx: ProcessBatchContext = {
        ...baseCtx,
        job: {
          ...job,
          datasetSchemaVersion: 7,
          detectedFieldMappings: { locationPath: "location", locationNamePath: "venue" },
        },
        dataset: {
          ...baseCtx.dataset,
          ingestTransforms: [{ id: "rename-title", type: "rename", active: true, autoDetected: false, from: "title", to: "eventTitle" }],
        },
      };

      mocks.getIngestGeocodingResults.mockReturnValue({
        berlin: {
          coordinates: { lat: 52.52, lng: 13.405 },
          confidence: 0.9,
          formattedAddress: "Berlin, Germany",
        },
      });

      const rows = [{ id: "x", title: "My Event", location: "Berlin", venue: "Tempelhof" }];

      await processEventBatch(ctx, rows, 0);

      const updateCall = (mockPayload.update.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
      expect(updateCall.collection).toBe("events");
      expect(updateCall.id).toBe(99);
      expect(updateCall.overrideAccess).toBe(true);

      // Verify the data shape matches the expected update payload
      const { data } = updateCall;
      expect(data).toHaveProperty("transformedData");
      expect(data).toHaveProperty("sourceData");
      expect(data).toHaveProperty("dataset", 456);
      expect(data).toHaveProperty("datasetIsPublic", false);
      expect(data).toHaveProperty("catalogOwnerId", undefined);
      expect(data).toHaveProperty("uniqueId", "mock-unique-id");
      expect(data).toHaveProperty("ingestJob");
      expect(data).toHaveProperty("locationName", "Tempelhof");
      expect(data).toHaveProperty("coordinateSource");
      expect(data).toHaveProperty("validationStatus", "transformed");
      expect(data).toHaveProperty("transformations");
      expect(data).toHaveProperty("schemaVersionNumber", 7);
      // eventTimestamp and eventEndTimestamp are included (may be null/undefined)
      expect(data).toHaveProperty("eventTimestamp");
      expect(data).toMatchObject({
        location: { latitude: 52.52, longitude: 13.405 },
        coordinateSource: {
          type: "geocoded",
          confidence: 0.9,
          normalizedAddress: "Berlin, Germany",
        },
      });
    });

    it("returns eventsUpdated count for updated rows", async () => {
      mockPayload.__allowDatasetIds([101, 102]);
      const job = buildIngestJob({
        duplicateStrategy: "update",
        duplicates: {
          internal: [],
          external: [
            { rowNumber: 0, existingEventId: 101 },
            { rowNumber: 2, existingEventId: 102 },
          ],
        },
      });

      const ctx: ProcessBatchContext = { ...baseCtx, job };

      const rows = [
        { id: "a", title: "Update 1" },
        { id: "b", title: "New Event" },
        { id: "c", title: "Update 2" },
      ];

      const result = await processEventBatch(ctx, rows, 0);

      expect(result.eventsUpdated).toBe(2);
      // eventsCreated includes updated events (eventsCreated = inserted + updated)
      expect(result.eventsCreated).toBe(3); // 1 inserted + 2 updated
      expect(result.eventsSkipped).toBe(0);
    });

    it("refuses to update an event that doesn't belong to the dataset", async () => {
      // Simulate tampered `duplicates.external` pointing at an event id that
      // is NOT in the current dataset (the allowlist is empty).
      mockPayload.__allowDatasetIds([]);
      const job = buildIngestJob({
        duplicateStrategy: "update",
        duplicates: { internal: [], external: [{ rowNumber: 0, existingEventId: 9999 }] },
      });

      const ctx: ProcessBatchContext = { ...baseCtx, job };

      const rows = [{ id: "a", title: "Cross-dataset attempt" }];

      const result = await processEventBatch(ctx, rows, 0);

      // No update, no bulk insert — row was recorded as an error.
      expect(mockPayload.update).not.toHaveBeenCalled();
      expect(mocks.bulkInsertEvents).not.toHaveBeenCalled();
      expect(result.eventsUpdated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toMatch(/update blocked/);
    });

    it("still skips internal duplicates", async () => {
      mockPayload.__allowDatasetIds([777]);
      const job = buildIngestJob({
        duplicateStrategy: "update",
        duplicates: { internal: [{ rowNumber: 1 }], external: [{ rowNumber: 2, existingEventId: 777 }] },
      });

      const ctx: ProcessBatchContext = { ...baseCtx, job };

      const rows = [
        { id: "a", title: "New" },
        { id: "b", title: "Internal Dup" },
        { id: "c", title: "External Dup" },
      ];

      const result = await processEventBatch(ctx, rows, 0);

      // Internal duplicate at row 1 → skipped
      expect(result.eventsSkipped).toBe(1);
      // External duplicate at row 2 → updated
      expect(result.eventsUpdated).toBe(1);
      // New row at row 0 → bulk inserted
      expect(mocks.bulkInsertEvents).toHaveBeenCalledTimes(1);
      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents).toHaveLength(1);
    });
  });

  describe("mixed batch: new rows + updates", () => {
    it("bulk-inserts new rows and updates existing ones in the same batch", async () => {
      mockPayload.__allowDatasetIds([501, 502]);
      const job = buildIngestJob({
        duplicateStrategy: "update",
        duplicates: {
          internal: [],
          external: [
            { rowNumber: 1, existingEventId: 501 },
            { rowNumber: 3, existingEventId: 502 },
          ],
        },
      });

      const ctx: ProcessBatchContext = { ...baseCtx, job };

      const rows = [
        { id: "new-1", title: "Brand New 1" },
        { id: "old-1", title: "Existing 1" },
        { id: "new-2", title: "Brand New 2" },
        { id: "old-2", title: "Existing 2" },
      ];

      const result = await processEventBatch(ctx, rows, 0);

      // 2 updates via payload.update
      expect(mockPayload.update).toHaveBeenCalledTimes(2);
      expect(result.eventsUpdated).toBe(2);

      // 2 new rows via bulk insert
      expect(mocks.bulkInsertEvents).toHaveBeenCalledTimes(1);
      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents).toHaveLength(2);

      // Total: 4 created (2 inserted + 2 updated), 0 skipped
      expect(result.eventsCreated).toBe(4);
      expect(result.eventsSkipped).toBe(0);
    });
  });

  describe("globalRowOffset", () => {
    it("applies offset when matching duplicate row numbers", async () => {
      mockPayload.__allowDatasetIds([301]);
      const job = buildIngestJob({
        duplicateStrategy: "update",
        duplicates: { internal: [], external: [{ rowNumber: 50, existingEventId: 301 }] },
      });

      const ctx: ProcessBatchContext = { ...baseCtx, job };

      // This batch starts at globalRowOffset=48, so index 2 → row 50
      const rows = [
        { id: "a", title: "Row 48" },
        { id: "b", title: "Row 49" },
        { id: "c", title: "Row 50 (update)" },
      ];

      const result = await processEventBatch(ctx, rows, 48);

      // Row 50 should be updated
      expect(result.eventsUpdated).toBe(1);
      expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({ collection: "events", id: 301 }));

      // Rows 48 and 49 should be bulk-inserted
      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents).toHaveLength(2);
    });
  });
});
