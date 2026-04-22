/**
 * @module
 */
// Import centralized mocks FIRST (before anything that uses them)
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEventsBatchJob } from "@/lib/jobs/handlers/create-events-batch-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { createMockContext, createMockIngestFile } from "@/tests/setup/factories";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    streamBatchesFromFile: vi.fn(),
    cleanupSidecarFiles: vi.fn(),
    generateUniqueId: vi.fn(),
    getIngestGeocodingResults: vi.fn(),
    getGeocodingResultForRow: vi.fn(),
    startStage: vi.fn(),
    updateStageProgress: vi.fn(),
    updateAndCompleteBatch: vi.fn(),
    completeBatch: vi.fn(),
    completeStage: vi.fn(),
    bulkInsertEvents: vi.fn(),
    extractDenormalizedAccessFields: vi.fn(),
  };
});

// Mock external dependencies
vi.mock("@/lib/ingest/file-readers", () => ({
  streamBatchesFromFile: mocks.streamBatchesFromFile,
  cleanupSidecarFiles: mocks.cleanupSidecarFiles,
}));

vi.mock("@/lib/services/id-generation", () => ({ generateUniqueId: mocks.generateUniqueId }));

vi.mock("@/lib/ingest/types/geocoding", () => ({
  getIngestGeocodingResults: mocks.getIngestGeocodingResults,
  getGeocodingResultForRow: mocks.getGeocodingResultForRow,
}));

vi.mock("@/lib/ingest/progress-tracking", () => ({
  ProgressTrackingService: {
    startStage: mocks.startStage,
    updateStageProgress: mocks.updateStageProgress,
    updateAndCompleteBatch: mocks.updateAndCompleteBatch,
    completeBatch: mocks.completeBatch,
    completeStage: mocks.completeStage,
  },
}));

vi.mock("@/lib/jobs/utils/upload-path", () => ({
  getIngestFilePath: vi.fn((filename: string) => `/mock/ingest-files/${filename}`),
}));

vi.mock("@/lib/services/quota-service", () => ({
  createQuotaService: vi.fn(() => ({
    checkQuota: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 10000, remaining: 10000 }),
    incrementUsage: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@/lib/jobs/utils/bulk-event-insert", () => ({ bulkInsertEvents: mocks.bulkInsertEvents }));

vi.mock("@/lib/collections/catalog-ownership", () => ({
  extractDenormalizedAccessFields: mocks.extractDenormalizedAccessFields,
}));

// Mock review checks — default: no review needed
vi.mock("@/lib/jobs/workflows/review-checks", () => ({
  REVIEW_REASONS: {
    SCHEMA_DRIFT: "schema-drift",
    QUOTA_EXCEEDED: "quota-exceeded",
    HIGH_DUPLICATE_RATE: "high-duplicates",
    GEOCODING_PARTIAL: "geocoding-partial",
    HIGH_ROW_ERROR_RATE: "high-row-errors",
    HIGH_EMPTY_ROW_RATE: "high-empty-rows",
    NO_TIMESTAMP_DETECTED: "no-timestamp",
    NO_LOCATION_DETECTED: "no-location",
    FILE_TOO_LARGE: "file-too-large",
  },
  shouldReviewHighRowErrors: vi.fn().mockReturnValue({ needsReview: false }),
  setNeedsReview: vi.fn().mockResolvedValue(undefined),
  parseReviewChecksConfig: vi.fn().mockReturnValue({ config: undefined }),
}));

/** Get the events array from the Nth call to bulkInsertEvents (0-indexed). */
const getBulkInsertedEvents = (callIndex = 0): unknown[] => {
  const call = mocks.bulkInsertEvents.mock.calls[callIndex] as [unknown, unknown[]];
  return call[1];
};

/** Helper to create a mock async iterable from arrays of batches. */
const mockAsyncGenerator = (batches: Record<string, unknown>[][]) => ({
  [Symbol.asyncIterator]: () => {
    let index = 0;
    return {
      next: async () => {
        await Promise.resolve();
        if (index < batches.length) {
          return { value: batches[index++], done: false as const };
        }
        return { value: undefined, done: true as const };
      },
    };
  },
});

/**
 * Creates a Drizzle-style chainable mock where every method returns the same
 * object (enabling chaining) and the object is also a thenable so `await`
 * resolves to the configured value.
 *
 * Each call to `select()` or `delete()` on the root mock creates a fresh
 * sub-chain so that sequential queries can resolve to different values.
 */
const createDrizzleMock = () => {
  /** Build a sub-chain that is both chainable and thenable. */
  const buildChain = (resolveValue: unknown = []) => {
    const chain: Record<string, any> = {};
    for (const m of ["select", "from", "where", "limit", "insert", "values", "returning", "delete"]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // oxlint-disable-next-line unicorn/no-thenable, promise/prefer-await-to-then -- intentional thenable for Drizzle mock
    chain.then = (resolve: any, reject?: any) => Promise.resolve(resolveValue).then(resolve, reject);
    return chain;
  };

  // The root mock: `select` and `delete` each create a fresh sub-chain
  // whose resolve value can be configured via the `queuedResults` array.
  const queuedResults: unknown[] = [];
  const mock: Record<string, any> = {
    /** Push a resolve value for the next `select` or `delete` chain. */
    _enqueue: (value: unknown) => {
      queuedResults.push(value);
    },
    select: vi.fn().mockImplementation(() => buildChain(queuedResults.shift() ?? [])),
    delete: vi.fn().mockImplementation(() => buildChain(queuedResults.shift() ?? [])),
    insert: vi.fn().mockImplementation(() => buildChain(queuedResults.shift() ?? [])),
  };
  return mock;
};

describe.sequential("CreateEventsBatchJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;
  let drizzleMock: ReturnType<typeof createDrizzleMock>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup ProgressTrackingService mocks to return resolved promises
    mocks.startStage.mockResolvedValue(undefined);
    mocks.updateStageProgress.mockResolvedValue(undefined);
    mocks.updateAndCompleteBatch.mockResolvedValue(undefined);
    mocks.completeBatch.mockResolvedValue(undefined);
    mocks.completeStage.mockResolvedValue(undefined);

    // Default mock for bulkInsertEvents: return the number of events passed in
    // eslint-disable-next-line @typescript-eslint/require-await
    mocks.bulkInsertEvents.mockImplementation(async (_payload: unknown, events: unknown[]) => events.length);

    // Default mock for extractDenormalizedAccessFields
    mocks.extractDenormalizedAccessFields.mockReturnValue({ datasetIsPublic: false, catalogOwnerId: undefined });

    drizzleMock = createDrizzleMock();

    // Mock payload
    mockPayload = {
      findByID: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue({ docs: [] }),
      count: vi.fn().mockResolvedValue({ totalDocs: 2 }),
      jobs: { queue: vi.fn().mockResolvedValue({}) },
      db: { drizzle: drizzleMock },
    };

    // By default, cleanupPriorAttempt finds no events (select returns [])
    // — no enqueue needed since the default is already []

    // Mock context — no batchNumber needed
    mockContext = createMockContext(mockPayload, { ingestJobId: "import-123" });
  });

  describe("Success Cases", () => {
    it("should create events successfully from streamed data", async () => {
      // Mock import job - needs to be mutable to track updates (using const with Object.assign)
      const mockIngestJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        duplicates: { internal: [], external: [], summary: { uniqueRows: 2 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Mock dataset
      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };

      // Mock import file
      const mockIngestFile = createMockIngestFile();

      // Mock file data
      const mockFileData = [
        { id: "1", title: "Event 1", address: "123 Main St" },
        { id: "2", title: "Event 2", address: "456 Oak Ave" },
      ];

      // Setup mocks - findByID will be called multiple times by ProgressTrackingService
      // update mock should update the mockIngestJob
      mockPayload.update.mockImplementation(({ collection, data }: any) => {
        if (collection === "ingest-jobs") {
          Object.assign(mockIngestJob, data);
        }
        return Promise.resolve(mockIngestJob);
      });

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1").mockReturnValueOnce("dataset-456:ext:2");

      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});

      // Mock find for updateIngestFileStatusIfAllJobsComplete - no pending jobs
      mockPayload.find.mockResolvedValue({ docs: [] });

      // Execute job
      const result = await createEventsBatchJob.handler(mockContext);

      // Verify result — workflow-compatible output format
      expect(result).toEqual({ output: { needsReview: false, eventCount: 2, duplicatesSkipped: 0 } });

      // Verify streaming was used
      expect(mocks.streamBatchesFromFile).toHaveBeenCalledWith("/mock/ingest-files/test.csv", {
        sheetIndex: 0,
        batchSize: expect.any(Number),
      });

      // Verify events were bulk-inserted (not created individually)
      expect(mocks.bulkInsertEvents).toHaveBeenCalledTimes(1);
      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents).toHaveLength(2);
      expect(insertedEvents[0]).toEqual(
        expect.objectContaining({
          dataset: "dataset-456",
          uniqueId: "dataset-456:ext:1",
          transformedData: expect.objectContaining({ id: "1", title: "Event 1", address: "123 Main St" }),
        })
      );

      // Verify progress tracking service was called (updates happen via ProgressTrackingService)
      expect(mockPayload.update).toHaveBeenCalled();

      // Verify no batch queuing (single job)
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
    });

    it("preserves string import file IDs when marking the file complete", async () => {
      const mockIngestJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };

      const mockIngestFile = createMockIngestFile("file-789");

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([[{ id: "1", title: "Event 1" }]]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      // Job handler stores results; onSuccess callback sets stage to COMPLETED.
      expect(result).toEqual({ output: { needsReview: false, eventCount: 1, duplicatesSkipped: 0 } });
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "ingest-jobs",
          id: "import-123",
          data: expect.objectContaining({ results: expect.objectContaining({ totalEvents: expect.any(Number) }) }),
        })
      );
    });

    it("should skip duplicate rows identified in previous stage", async () => {
      // Mock import job with duplicates
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: [{ rowNumber: 1, uniqueId: "dataset-456:ext:2" }],
          external: [{ rowNumber: 2, uniqueId: "dataset-456:ext:3" }],
          summary: { uniqueRows: 1 },
        },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };

      const mockIngestFile = createMockIngestFile();

      // Mock file data (3 rows, but 2 are duplicates)
      const mockFileData = [
        { id: "1", title: "Event 1" }, // Will be created
        { id: "2", title: "Event 2" }, // Internal duplicate - skip
        { id: "3", title: "Event 3" }, // External duplicate - skip
      ];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId
        .mockReturnValueOnce("dataset-456:ext:1")
        .mockReturnValueOnce("dataset-456:ext:2")
        .mockReturnValueOnce("dataset-456:ext:3");

      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});

      // Mock find for updateIngestFileStatusIfAllJobsComplete - no pending jobs
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      expect(result).toEqual({
        output: {
          needsReview: false,
          eventCount: 1, // Only first row created
          duplicatesSkipped: 2, // Second and third rows skipped
        },
      });

      // Should only bulk-insert one event (for the non-duplicate row)
      expect(mocks.bulkInsertEvents).toHaveBeenCalledTimes(1);
      expect(getBulkInsertedEvents()).toHaveLength(1);

      // Verify progress tracking service was called (updates happen via ProgressTrackingService)
      expect(mockPayload.update).toHaveBeenCalled();
    });

    it("should process multiple batches in single job", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 4 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockIngestFile = { id: "file-789", filename: "test.csv" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      // Two batches of data
      const batch1 = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
      ];
      const batch2 = [
        { id: "3", title: "Event 3" },
        { id: "4", title: "Event 4" },
      ];
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([batch1, batch2]));

      // Mock unique ID generation for all rows
      mocks.generateUniqueId.mockImplementation((row: any) => `dataset-456:ext:${row.id}`);
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      // Should indicate all batches processed
      expect(result).toEqual({ output: { needsReview: false, eventCount: 4, duplicatesSkipped: 0 } });

      // Should bulk-insert events in 2 batches (2 events each)
      expect(mocks.bulkInsertEvents).toHaveBeenCalledTimes(2);
      expect(getBulkInsertedEvents(0)).toHaveLength(2);
      expect(getBulkInsertedEvents(1)).toHaveLength(2);

      // Should NOT queue any follow-up jobs (single job handles everything)
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
    });

    it("should mark import as completed after processing all batches", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        duplicates: {
          internal: [],
          external: [],
          summary: { internalDuplicates: 1, externalDuplicates: 2, uniqueRows: 10 },
        },
        progress: {
          stages: { "create-events": { status: "in_progress", rowsProcessed: 10, rowsTotal: 10 } },
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      };

      const mockDataset = { id: "dataset-456" };
      const mockIngestFile = { id: "file-789", filename: "test.csv" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      // Mock find for updateIngestFileStatusIfAllJobsComplete - no pending jobs
      mockPayload.find.mockResolvedValue({ docs: [] });

      // Mock empty stream (no rows to process)
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([]));

      // Set up geocoding results properly
      const geocodingResultsMap = {
        "0": { rowNumber: 0, coordinates: { lat: 1, lng: 1 }, confidence: 0.9 },
        "1": { rowNumber: 1, coordinates: { lat: 2, lng: 2 }, confidence: 0.8 },
      };

      mocks.getIngestGeocodingResults.mockReturnValue(geocodingResultsMap);

      await createEventsBatchJob.handler(mockContext);

      // Should store results (stage transition moved to onSuccess callback)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: "import-123",
        data: {
          results: {
            totalEvents: 2, // From payload.count() mock
            duplicatesSkipped: 3, // 1 internal + 2 external
            geocoded: 2, // 2 geocoding results
            errors: 0,
          },
        },
      });
    });
  });

  describe("Progress Tracking", () => {
    it("should pass totalRows (not uniqueRows) to startStage when duplicates exist", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: [{ rowNumber: 1, uniqueId: "dataset-456:ext:2" }],
          external: [],
          // totalRows=5, uniqueRows=4 — stream iterates all 5 rows
          summary: { totalRows: 5, uniqueRows: 4, internalDuplicates: 1, externalDuplicates: 0 },
        },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockIngestFile = createMockIngestFile();

      const mockFileData = Array.from({ length: 5 }, (_, i) => ({ id: `${i + 1}`, title: `Event ${i + 1}` }));

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockImplementation((row: any) => `dataset-456:ext:${row.id}`);
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Must use totalRows (5), not uniqueRows (4), because the stream iterates all rows
      expect(mocks.startStage).toHaveBeenCalledWith(
        mockPayload,
        "import-123",
        "create-events",
        5 // totalRows from duplicates.summary, NOT uniqueRows
      );
    });

    it("should not double-count failed rows in batch progress", async () => {
      const mockIngestJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        duplicates: { internal: [], external: [], summary: { uniqueRows: 5 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockIngestFile = createMockIngestFile();

      // 5 rows in a single batch — the 3rd row (index 2) will fail during data building
      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
        { id: "3", title: "Event 3" },
        { id: "4", title: "Event 4" },
        { id: "5", title: "Event 5" },
      ];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      // 3rd call throws during data building (e.g. unique ID generation fails)
      mocks.generateUniqueId
        .mockReturnValueOnce("dataset-456:ext:1")
        .mockReturnValueOnce("dataset-456:ext:2")
        .mockImplementationOnce(() => {
          throw new Error("ID generation error");
        })
        .mockReturnValueOnce("dataset-456:ext:4")
        .mockReturnValueOnce("dataset-456:ext:5");
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      // 4 created (bulk inserted), 0 skipped (no duplicates), 1 error — no double-counting
      expect(result).toEqual({ output: { needsReview: false, eventCount: 4, duplicatesSkipped: 0 } });

      // Uses updateAndCompleteBatch (combined progress + batch completion in a single DB write).
      // Single batch (batchNumber=1), so the final write after the loop fires.
      expect(mocks.updateAndCompleteBatch).toHaveBeenCalledWith(
        mockPayload,
        expect.objectContaining({ id: "import-123" }),
        "create-events",
        5, // totalRowsProcessed (rows.length)
        1 // batchNumber
      );
    });
  });

  describe("Retry Idempotency", () => {
    it("should delete events from prior attempt on retry using chunked SQL", async () => {
      const mockIngestJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockIngestFile = createMockIngestFile();

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      // Simulate chunked delete: first select returns 5000 IDs, then delete versions,
      // delete events, second select returns [] (done).
      const fakeIds = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1 }));
      drizzleMock._enqueue(fakeIds); // 1st select: 5000 rows found
      drizzleMock._enqueue(undefined); // 1st delete(_events_v)
      drizzleMock._enqueue(undefined); // 1st delete(events)
      drizzleMock._enqueue([]); // 2nd select: no more rows

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([[{ id: "1", title: "Event 1" }]]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      // Verify chunked delete was called (Drizzle typed API, not payload.delete)
      // 2 selects (first finds rows, second finds none) + 2 deletes (versions + events)
      expect(drizzleMock.select).toHaveBeenCalledTimes(2);
      expect(drizzleMock.delete).toHaveBeenCalledTimes(2);

      // Verify the handler continued normally and produced a result
      expect(result).toEqual({ output: { needsReview: false, eventCount: 1, duplicatesSkipped: 0 } });
    });
  });

  describe("Error Handling", () => {
    it("should throw Error when ingest job not found (onFail handles failure marking)", async () => {
      mockPayload.findByID.mockResolvedValue(null);
      mockPayload.update.mockResolvedValue({});

      await expect(createEventsBatchJob.handler(mockContext)).rejects.toThrow("Ingest job not found");
    });

    it("should throw Error when dataset not found (onFail handles failure marking)", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestJob).mockResolvedValueOnce(null); // Dataset not found
      mockPayload.update.mockResolvedValue({});

      await expect(createEventsBatchJob.handler(mockContext)).rejects.toThrow("Dataset not found");
    });

    it("should throw Error when ingest file not found (onFail handles failure marking)", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456" };

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(null); // Ingest file not found
      mockPayload.update.mockResolvedValue({});

      await expect(createEventsBatchJob.handler(mockContext)).rejects.toThrow("Ingest file not found");
    });
  });

  describe("Quota Check", () => {
    it("should check quota against uniqueRows, not totalRows, when duplicates exist", async () => {
      // totalRows=1000, uniqueRows=50 (950 internal duplicates)
      // Quota limit is 100 — uniqueRows (50) is within limit
      const mockCheckQuota = vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 100, remaining: 50 });

      // Must mock quota-service BEFORE handler reads it; use dynamic import override
      const { createQuotaService } = await import("@/lib/services/quota-service");
      vi.mocked(createQuotaService).mockReturnValue({ checkQuota: mockCheckQuota } as any);

      const mockIngestJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: Array.from({ length: 950 }, (_, i) => ({ rowNumber: i + 50, uniqueId: `dup-${i}` })),
          external: [],
          summary: { totalRows: 1000, uniqueRows: 50, internalDuplicates: 950, externalDuplicates: 0 },
        },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockIngestFile = createMockIngestFile();
      // Add user for quota check path
      (mockIngestFile as any).user = { id: "user-1", role: "user" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        if (collection === "users") return Promise.resolve({ id: "user-1", role: "user" });
        return Promise.resolve(null);
      });

      // Stream with a single row for simplicity (actual row count doesn't matter for quota test)
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([[{ id: "1", title: "Event 1" }]]));
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      // Should succeed — quota checks uniqueRows (50), not totalRows (1000)
      await createEventsBatchJob.handler(mockContext);

      // Verify startStage was called with totalRows (1000) for progress tracking
      expect(mocks.startStage).toHaveBeenCalledWith(mockPayload, "import-123", "create-events", 1000);

      // Verify quota was checked with uniqueRows (50), not totalRows (1000)
      expect(mockCheckQuota).toHaveBeenCalledWith(
        expect.objectContaining({ id: "user-1" }),
        expect.any(String), // "EVENTS_PER_IMPORT"
        50
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty stream gracefully", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 0 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456" };
      const mockIngestFile = { id: "file-789", filename: "empty.csv" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      // Mock find for updateIngestFileStatusIfAllJobsComplete
      mockPayload.find.mockResolvedValue({ docs: [] });

      // Mock empty stream
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([]));
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());

      const result = await createEventsBatchJob.handler(mockContext);

      expect(result).toEqual({ output: { needsReview: false, eventCount: 0, duplicatesSkipped: 0 } });

      // Should store results (stage transition moved to onSuccess callback)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: "import-123",
        data: {
          results: {
            totalEvents: 2, // From payload.count() mock
            duplicatesSkipped: 0,
            geocoded: 0,
            errors: 0,
          },
        },
      });
    });
  });

  describe("Type Transformations", () => {
    it("should skip transformations when allowTransformations is false", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: false },
        ingestTransforms: [
          {
            id: "transform-age",
            type: "string-op",
            from: "age",
            operation: "expression",
            expression: "toNumber(value)",
            active: false,
          },
        ],
      };

      const mockIngestFile = createMockIngestFile();

      const mockFileData = [{ id: "1", name: "John", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Verify age is still string (transform is inactive) via bulk insert
      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents[0]).toEqual(
        expect.objectContaining({
          transformedData: expect.objectContaining({ age: "25" }),
          validationStatus: "pending",
          transformations: null,
        })
      );
    });

    it("should apply type transformations and mark event as transformed", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        ingestTransforms: [
          {
            id: "transform-age",
            type: "string-op",
            from: "age",
            operation: "expression",
            expression: "toNumber(value)",
            active: true,
          },
        ],
      };

      const mockIngestFile = createMockIngestFile();

      const mockFileData = [{ id: "1", name: "John", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Verify transformation was applied via bulk insert
      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents[0]).toEqual(
        expect.objectContaining({
          transformedData: expect.objectContaining({ age: 25 }),
          validationStatus: "transformed",
          transformations: expect.arrayContaining([expect.objectContaining({ path: "age" })]),
        })
      );
    });

    it("should handle empty transformations array", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        ingestTransforms: [],
      };

      const mockIngestFile = createMockIngestFile();

      const mockFileData = [{ id: "1", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // No transformations applied
      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents[0]).toEqual(
        expect.objectContaining({ validationStatus: "pending", transformations: null })
      );
    });

    it("should apply multiple transformations to different fields", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        ingestTransforms: [
          {
            id: "transform-age",
            type: "string-op",
            from: "age",
            operation: "expression",
            expression: "toNumber(value)",
            active: true,
          },
          {
            id: "transform-active",
            type: "string-op",
            from: "active",
            operation: "expression",
            expression: "parseBool(value)",
            active: true,
          },
        ],
      };

      const mockIngestFile = createMockIngestFile();

      const mockFileData = [{ id: "1", age: "25", active: "true" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents[0]).toEqual(
        expect.objectContaining({
          transformedData: expect.objectContaining({ age: 25, active: true }),
          transformations: expect.arrayContaining([
            expect.objectContaining({ path: "age" }),
            expect.objectContaining({ path: "active" }),
          ]),
        })
      );
    });

    it("should skip disabled transformation rules", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        ingestTransforms: [
          {
            id: "transform-age",
            type: "string-op",
            from: "age",
            operation: "expression",
            expression: "toNumber(value)",
            active: false, // Disabled
          },
        ],
      };

      const mockIngestFile = createMockIngestFile();

      const mockFileData = [{ id: "1", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents[0]).toEqual(
        expect.objectContaining({
          transformedData: expect.objectContaining({ age: "25" }), // Still string
          validationStatus: "pending",
        })
      );
    });

    it("should handle transformation errors gracefully", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        ingestTransforms: [
          {
            id: "transform-age",
            type: "string-op",
            from: "age",
            operation: "expression",
            expression: "parseNumber(value)",
            active: true,
          },
        ],
      };

      const mockIngestFile = createMockIngestFile();

      // Invalid data that will fail transformation
      const mockFileData = [{ id: "1", age: "not-a-number" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getIngestGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Event should still be created with original value preserved (transform failed)
      // But transformations array tracks what was attempted (not what succeeded)
      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents[0]).toEqual(
        expect.objectContaining({
          transformedData: expect.objectContaining({ age: "not-a-number" }), // Original value preserved
          validationStatus: "transformed", // Marks as transformed (attempted)
          transformations: expect.arrayContaining([expect.objectContaining({ path: "age" })]),
        })
      );
    });
  });
});
