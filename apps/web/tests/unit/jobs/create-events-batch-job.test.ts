/**
 * @module
 */
// Import centralized mocks FIRST (before anything that uses them)
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEventsBatchJob } from "@/lib/jobs/handlers/create-events-batch-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { createMockContext, createMockImportFile } from "@/tests/setup/factories";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    streamBatchesFromFile: vi.fn(),
    cleanupSidecarFiles: vi.fn(),
    generateUniqueId: vi.fn(),
    getImportGeocodingResults: vi.fn(),
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
vi.mock("@/lib/import/file-readers", () => ({
  streamBatchesFromFile: mocks.streamBatchesFromFile,
  cleanupSidecarFiles: mocks.cleanupSidecarFiles,
}));

vi.mock("@/lib/services/id-generation", () => ({ generateUniqueId: mocks.generateUniqueId }));

vi.mock("@/lib/types/geocoding", () => ({
  getImportGeocodingResults: mocks.getImportGeocodingResults,
  getGeocodingResultForRow: mocks.getGeocodingResultForRow,
}));

vi.mock("@/lib/import/progress-tracking", () => ({
  ProgressTrackingService: {
    startStage: mocks.startStage,
    updateStageProgress: mocks.updateStageProgress,
    updateAndCompleteBatch: mocks.updateAndCompleteBatch,
    completeBatch: mocks.completeBatch,
    completeStage: mocks.completeStage,
  },
}));

vi.mock("@/lib/jobs/utils/upload-path", () => ({
  getImportFilePath: vi.fn((filename: string) => `/mock/import-files/${filename}`),
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
    // eslint-disable-next-line unicorn/no-thenable -- intentional thenable for Drizzle mock
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
    mockContext = createMockContext(mockPayload, { importJobId: "import-123" });
  });

  describe("Success Cases", () => {
    it("should create events successfully from streamed data", async () => {
      // Mock import job - needs to be mutable to track updates (using const with Object.assign)
      const mockImportJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: { internal: [], external: [], summary: { uniqueRows: 2 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Mock dataset
      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };

      // Mock import file
      const mockImportFile = createMockImportFile();

      // Mock file data
      const mockFileData = [
        { id: "1", title: "Event 1", address: "123 Main St" },
        { id: "2", title: "Event 2", address: "456 Oak Ave" },
      ];

      // Setup mocks - findByID will be called multiple times by ProgressTrackingService
      // update mock should update the mockImportJob
      mockPayload.update.mockImplementation(({ collection, data }: any) => {
        if (collection === "import-jobs") {
          Object.assign(mockImportJob, data);
        }
        return Promise.resolve(mockImportJob);
      });

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1").mockReturnValueOnce("dataset-456:ext:2");

      mocks.getImportGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});

      // Mock find for updateImportFileStatusIfAllJobsComplete - no pending jobs
      mockPayload.find.mockResolvedValue({ docs: [] });

      // Execute job
      const result = await createEventsBatchJob.handler(mockContext);

      // Verify result — new output format
      expect(result).toEqual({ output: { totalBatches: 1, eventsCreated: 2, eventsSkipped: 0, errors: 0 } });

      // Verify streaming was used
      expect(mocks.streamBatchesFromFile).toHaveBeenCalledWith("/mock/import-files/test.csv", {
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
          data: expect.objectContaining({ id: "1", title: "Event 1", address: "123 Main St" }),
        })
      );

      // Verify progress tracking service was called (updates happen via ProgressTrackingService)
      expect(mockPayload.update).toHaveBeenCalled();

      // Verify no batch queuing (single job)
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
    });

    it("preserves string import file IDs when marking the file complete", async () => {
      const mockImportJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };

      const mockImportFile = createMockImportFile("file-789");

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([[{ id: "1", title: "Event 1" }]]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getImportGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ collection: "import-files", id: "file-789", data: { status: "completed" } })
      );
    });

    it("should skip duplicate rows identified in previous stage", async () => {
      // Mock import job with duplicates
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: [{ rowNumber: 1, uniqueId: "dataset-456:ext:2" }],
          external: [{ rowNumber: 2, uniqueId: "dataset-456:ext:3" }],
          summary: { uniqueRows: 1 },
        },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };

      const mockImportFile = createMockImportFile();

      // Mock file data (3 rows, but 2 are duplicates)
      const mockFileData = [
        { id: "1", title: "Event 1" }, // Will be created
        { id: "2", title: "Event 2" }, // Internal duplicate - skip
        { id: "3", title: "Event 3" }, // External duplicate - skip
      ];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId
        .mockReturnValueOnce("dataset-456:ext:1")
        .mockReturnValueOnce("dataset-456:ext:2")
        .mockReturnValueOnce("dataset-456:ext:3");

      mocks.getImportGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});

      // Mock find for updateImportFileStatusIfAllJobsComplete - no pending jobs
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      expect(result).toEqual({
        output: {
          totalBatches: 1,
          eventsCreated: 1, // Only first row created
          eventsSkipped: 2, // Second and third rows skipped
          errors: 0,
        },
      });

      // Should only bulk-insert one event (for the non-duplicate row)
      expect(mocks.bulkInsertEvents).toHaveBeenCalledTimes(1);
      expect(getBulkInsertedEvents()).toHaveLength(1);

      // Verify progress tracking service was called (updates happen via ProgressTrackingService)
      expect(mockPayload.update).toHaveBeenCalled();
    });

    it("should process multiple batches in single job", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 4 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockImportFile = { id: "file-789", filename: "test.csv" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
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
      mocks.getImportGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      // Should indicate all batches processed
      expect(result).toEqual({ output: { totalBatches: 2, eventsCreated: 4, eventsSkipped: 0, errors: 0 } });

      // Should bulk-insert events in 2 batches (2 events each)
      expect(mocks.bulkInsertEvents).toHaveBeenCalledTimes(2);
      expect(getBulkInsertedEvents(0)).toHaveLength(2);
      expect(getBulkInsertedEvents(1)).toHaveLength(2);

      // Should NOT queue any follow-up jobs (single job handles everything)
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
    });

    it("should mark import as completed after processing all batches", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
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
      const mockImportFile = { id: "file-789", filename: "test.csv" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      // Mock find for updateImportFileStatusIfAllJobsComplete - no pending jobs
      mockPayload.find.mockResolvedValue({ docs: [] });

      // Mock empty stream (no rows to process)
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([]));

      // Set up geocoding results properly
      const geocodingResultsMap = {
        "0": { rowNumber: 0, coordinates: { lat: 1, lng: 1 }, confidence: 0.9 },
        "1": { rowNumber: 1, coordinates: { lat: 2, lng: 2 }, confidence: 0.8 },
      };

      mocks.getImportGeocodingResults.mockReturnValue(geocodingResultsMap);

      await createEventsBatchJob.handler(mockContext);

      // Should mark as completed
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "completed",
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
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
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
      const mockImportFile = createMockImportFile();

      const mockFileData = Array.from({ length: 5 }, (_, i) => ({ id: `${i + 1}`, title: `Event ${i + 1}` }));

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockImplementation((row: any) => `dataset-456:ext:${row.id}`);
      mocks.getImportGeocodingResults.mockReturnValue(new Map());
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
      const mockImportJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: { internal: [], external: [], summary: { uniqueRows: 5 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockImportFile = createMockImportFile();

      // 5 rows in a single batch — the 3rd row (index 2) will fail during data building
      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
        { id: "3", title: "Event 3" },
        { id: "4", title: "Event 4" },
        { id: "5", title: "Event 5" },
      ];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
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
      mocks.getImportGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      // 4 created (bulk inserted), 0 skipped (no duplicates), 1 error — no double-counting
      expect(result).toEqual({ output: { totalBatches: 1, eventsCreated: 4, eventsSkipped: 0, errors: 1 } });

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
      const mockImportJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockImportFile = createMockImportFile();

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
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
      mocks.getImportGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValue({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      const result = await createEventsBatchJob.handler(mockContext);

      // Verify chunked delete was called (Drizzle typed API, not payload.delete)
      // 2 selects (first finds rows, second finds none) + 2 deletes (versions + events)
      expect(drizzleMock.select).toHaveBeenCalledTimes(2);
      expect(drizzleMock.delete).toHaveBeenCalledTimes(2);

      // Verify the handler continued normally and produced a result
      expect(result).toEqual({ output: { totalBatches: 1, eventsCreated: 1, eventsSkipped: 0, errors: 0 } });
    });
  });

  describe("Error Handling", () => {
    it("should throw error when import job not found", async () => {
      mockPayload.findByID.mockResolvedValueOnce(null);

      await expect(createEventsBatchJob.handler(mockContext)).rejects.toThrow("Import job not found: import-123");
    });

    it("should throw error when dataset not found", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(null); // Dataset not found

      await expect(createEventsBatchJob.handler(mockContext)).rejects.toThrow("Dataset not found");
    });

    it("should throw error when import file not found", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456" };

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(null); // Import file not found

      await expect(createEventsBatchJob.handler(mockContext)).rejects.toThrow("Import file not found");
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

      const mockImportJob: any = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: Array.from({ length: 950 }, (_, i) => ({ rowNumber: i + 50, uniqueId: `dup-${i}` })),
          external: [],
          summary: { totalRows: 1000, uniqueRows: 50, internalDuplicates: 950, externalDuplicates: 0 },
        },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456", idStrategy: { type: "external", externalIdPath: "id" } };
      const mockImportFile = createMockImportFile();
      // Add user for quota check path
      (mockImportFile as any).user = { id: "user-1", role: "user" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        if (collection === "users") return Promise.resolve({ id: "user-1", role: "user" });
        return Promise.resolve(null);
      });

      // Stream with a single row for simplicity (actual row count doesn't matter for quota test)
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([[{ id: "1", title: "Event 1" }]]));
      mocks.getImportGeocodingResults.mockReturnValue(new Map());
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
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 0 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = { id: "dataset-456" };
      const mockImportFile = { id: "file-789", filename: "empty.csv" };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      // Mock find for updateImportFileStatusIfAllJobsComplete
      mockPayload.find.mockResolvedValue({ docs: [] });

      // Mock empty stream
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([]));
      mocks.getImportGeocodingResults.mockReturnValue(new Map());

      const result = await createEventsBatchJob.handler(mockContext);

      expect(result).toEqual({ output: { totalBatches: 0, eventsCreated: 0, eventsSkipped: 0, errors: 0 } });

      // Should mark as completed
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "completed",
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
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: false },
        importTransforms: [
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

      const mockImportFile = createMockImportFile();

      const mockFileData = [{ id: "1", name: "John", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getImportGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Verify age is still string (transform is inactive) via bulk insert
      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents[0]).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ age: "25" }),
          validationStatus: "pending",
          transformations: null,
        })
      );
    });

    it("should apply type transformations and mark event as transformed", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        importTransforms: [
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

      const mockImportFile = createMockImportFile();

      const mockFileData = [{ id: "1", name: "John", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getImportGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Verify transformation was applied via bulk insert
      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents[0]).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ age: 25 }),
          validationStatus: "transformed",
          transformations: expect.arrayContaining([expect.objectContaining({ path: "age" })]),
        })
      );
    });

    it("should handle empty transformations array", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        importTransforms: [],
      };

      const mockImportFile = createMockImportFile();

      const mockFileData = [{ id: "1", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getImportGeocodingResults.mockReturnValue(new Map());
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
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        importTransforms: [
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

      const mockImportFile = createMockImportFile();

      const mockFileData = [{ id: "1", age: "25", active: "true" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getImportGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents[0]).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ age: 25, active: true }),
          transformations: expect.arrayContaining([
            expect.objectContaining({ path: "age" }),
            expect.objectContaining({ path: "active" }),
          ]),
        })
      );
    });

    it("should skip disabled transformation rules", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        importTransforms: [
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

      const mockImportFile = createMockImportFile();

      const mockFileData = [{ id: "1", age: "25" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getImportGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents[0]).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ age: "25" }), // Still string
          validationStatus: "pending",
        })
      );
    });

    it("should handle transformation errors gracefully", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        importFile: "file-789",
        duplicates: { internal: [], external: [], summary: { uniqueRows: 1 } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        idStrategy: { type: "external", externalIdPath: "id" },
        schemaConfig: { allowTransformations: true },
        importTransforms: [
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

      const mockImportFile = createMockImportFile();

      // Invalid data that will fail transformation
      const mockFileData = [{ id: "1", age: "not-a-number" }];

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string; id: string | number }) => {
        if (collection === "import-jobs") return Promise.resolve(mockImportJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "import-files") return Promise.resolve(mockImportFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1");
      mocks.getImportGeocodingResults.mockReturnValue(new Map());
      mocks.getGeocodingResultForRow.mockReturnValue(null);

      mockPayload.update.mockResolvedValueOnce({});
      mockPayload.find.mockResolvedValue({ docs: [] });

      await createEventsBatchJob.handler(mockContext);

      // Event should still be created with original value preserved (transform failed)
      // But transformations array tracks what was attempted (not what succeeded)
      const insertedEvents = getBulkInsertedEvents();
      expect(insertedEvents[0]).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ age: "not-a-number" }), // Original value preserved
          validationStatus: "transformed", // Marks as transformed (attempted)
          transformations: expect.arrayContaining([expect.objectContaining({ path: "age" })]),
        })
      );
    });
  });
});
