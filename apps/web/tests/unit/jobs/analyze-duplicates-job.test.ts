/**
 * @module
 */
// Import centralized mocks FIRST (before anything that uses @/lib/logger)
// eslint-disable-next-line simple-import-sort/imports -- mock side-effect must load before handler
import { mockLogger } from "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeDuplicatesJob } from "@/lib/jobs/handlers/analyze-duplicates-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { createMockIngestFile } from "@/tests/setup/factories";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    getFileRowCount: vi.fn(),
    streamBatchesFromFile: vi.fn(),
    cleanupSidecarFiles: vi.fn(),
    cleanupSidecarsForJob: vi.fn(),
    generateUniqueId: vi.fn(),
  };
});

// Mock external dependencies
vi.mock("@/lib/ingest/progress-tracking", () => ({
  ProgressTrackingService: {
    initializeStageProgress: vi.fn().mockResolvedValue(undefined),
    updateStageProgress: vi.fn().mockResolvedValue(undefined),
    completeBatch: vi.fn().mockResolvedValue(undefined),
    startStage: vi.fn().mockResolvedValue(undefined),
    completeStage: vi.fn().mockResolvedValue(undefined),
    updatePostDeduplicationTotals: vi.fn().mockResolvedValue(undefined),
    skipStage: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/ingest/file-readers", () => ({
  getFileRowCount: mocks.getFileRowCount,
  streamBatchesFromFile: mocks.streamBatchesFromFile,
  cleanupSidecarFiles: mocks.cleanupSidecarFiles,
}));

vi.mock("@/lib/services/id-generation", () => ({ generateUniqueId: mocks.generateUniqueId }));

// Mock cleanupSidecarsForJob directly — with isolate: false, the mock of file-readers
// doesn't propagate to resource-loading.ts's cached import of cleanupSidecarFiles
vi.mock("@/lib/jobs/utils/resource-loading", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, cleanupSidecarsForJob: mocks.cleanupSidecarsForJob };
});

vi.mock("@/lib/jobs/utils/upload-path", () => ({
  getIngestFilePath: vi.fn((filename: string) => `/mock/ingest-files/${filename}`),
}));

// Mock review checks — default: no review needed, quota allowed
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
  shouldReviewHighDuplicates: vi.fn().mockReturnValue({ needsReview: false }),
  checkQuotaForSheet: vi.fn().mockResolvedValue({ allowed: true }),
  setNeedsReview: vi.fn().mockResolvedValue(undefined),
  parseReviewChecksConfig: vi.fn().mockReturnValue({ config: undefined }),
}));

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

describe.sequential("AnalyzeDuplicatesJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;
  let drizzleMock: ReturnType<typeof createDrizzleMock>;

  beforeEach(() => {
    // Reset all mocks (clearAllMocks resets call history/return values;
    // do NOT use restoreAllMocks as it undoes vi.mock module-level mocks)
    vi.clearAllMocks();

    drizzleMock = createDrizzleMock();

    // Mock payload
    mockPayload = {
      findByID: vi.fn(),
      update: vi.fn(),
      find: vi.fn(),
      db: { drizzle: drizzleMock },
      jobs: { queue: vi.fn().mockResolvedValue({}) },
    };

    // Mock context
    mockContext = {
      req: { payload: mockPayload },
      job: { id: "test-job-1", taskStatus: "running" } as any,
      input: { ingestJobId: "import-123" },
    };
  });

  describe("Success Cases", () => {
    it("should skip analysis when deduplication is disabled", async () => {
      // Mock import job
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Mock dataset with deduplication disabled
      const mockDataset = { id: "dataset-456", deduplicationConfig: { enabled: false } };

      // Mock import file
      const mockIngestFile = createMockIngestFile();

      // Setup payload mock responses
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob) // First call returns import job
        .mockResolvedValueOnce(mockDataset) // Second call returns dataset
        .mockResolvedValueOnce(mockIngestFile) // Third call returns import file
        .mockResolvedValueOnce(mockIngestJob); // Fourth call refetches import job after progress init

      // Mock getFileRowCount for total rows
      mocks.getFileRowCount.mockResolvedValueOnce(100);

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await analyzeDuplicatesJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({ output: { skipped: true } });

      // Verify payload calls - includes refetch after progress initialization
      expect(mockPayload.findByID).toHaveBeenCalledTimes(4);
      expect(mockPayload.findByID).toHaveBeenNthCalledWith(1, { collection: "ingest-jobs", id: "import-123" });
      expect(mockPayload.findByID).toHaveBeenNthCalledWith(2, { collection: "datasets", id: "dataset-456" });
      expect(mockPayload.findByID).toHaveBeenNthCalledWith(3, { collection: "ingest-files", id: "file-789" });
      expect(mockPayload.findByID).toHaveBeenNthCalledWith(4, { collection: "ingest-jobs", id: "import-123" });

      // Verify update call — no stage transition
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: "import-123",
        data: {
          duplicates: {
            strategy: "disabled",
            internal: [],
            external: [],
            summary: { totalRows: 100, uniqueRows: 100, internalDuplicates: 0, externalDuplicates: 0 },
          },
        },
      });
    });

    it("should process file with no duplicates", async () => {
      // Mock import job
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456", // Reference to dataset
        ingestFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Mock dataset with deduplication enabled - note the nested structure
      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: {
          enabled: true, // This must be true for analysis to run
        },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      // Mock import file
      const mockIngestFile = createMockIngestFile();

      // Mock file data - no duplicates
      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
        { id: "3", title: "Event 3" },
      ];

      // Setup mocks — when dedup is enabled, progress init passes 0 and refetches the job (4th findByID call)
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile)
        .mockResolvedValueOnce(mockIngestJob); // Refetch after initializeStageProgress

      // No getFileRowCount call when dedup is enabled — totalRows derived from streaming

      // Mock streaming - yields one batch then ends
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mocks.generateUniqueId
        .mockReturnValueOnce("dataset-456:ext:1")
        .mockReturnValueOnce("dataset-456:ext:2")
        .mockReturnValueOnce("dataset-456:ext:3");

      // Mock no existing events (no external duplicates) — Drizzle chain resolves to []
      drizzleMock._enqueue([]);

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await analyzeDuplicatesJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({ output: { totalRows: 3, uniqueRows: 3, internalDuplicates: 0, externalDuplicates: 0 } });

      // Verify getFileRowCount was NOT called (dedup enabled skips pre-scan)
      expect(mocks.getFileRowCount).not.toHaveBeenCalled();

      // Verify streaming was called
      expect(mocks.streamBatchesFromFile).toHaveBeenCalledWith(
        expect.stringContaining("test.csv"),
        expect.objectContaining({ batchSize: expect.any(Number) })
      );

      // Verify unique ID generation
      expect(mocks.generateUniqueId).toHaveBeenCalledTimes(3);
      expect(mocks.generateUniqueId).toHaveBeenCalledWith(
        { id: "1", title: "Event 1" },
        expect.objectContaining({ idStrategy: { type: "external", externalIdPath: "id" } })
      );

      // Verify external duplicate check via Drizzle typed API
      expect(drizzleMock.select).toHaveBeenCalledTimes(1);
    });

    it("should apply the full transform chain for content-hash ids so normalized rows hash identically", async () => {
      // Regression: prior to commit 0496522e, content-hash dedup hashed the RAW
      // row and missed duplicates that only collapse after lowercase/trim
      // transforms. The handler now uses buildTransformsFromDataset() for
      // content-hash strategies, feeding the fully transformed row to
      // generateUniqueId — mirroring what create-events-batch-job does.
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Content-hash strategy + a lowercase transform on a field that
      // differs by case between the two rows.
      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: { enabled: true },
        idStrategy: { type: "content-hash" },
        ingestTransforms: [
          {
            id: "transform-1",
            type: "string-op",
            from: "title",
            operation: "lowercase",
            active: true,
            autoDetected: false,
          },
        ],
      };

      const mockIngestFile = createMockIngestFile();
      // Two rows differ only by case on `title` — after the lowercase
      // transform, both rows become structurally identical.
      const mockFileData = [{ title: "Concert Tonight" }, { title: "CONCERT TONIGHT" }];

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile)
        .mockResolvedValueOnce(mockIngestJob);

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      // Because the handler now applies the full transform chain before
      // calling generateUniqueId, both rows will be lower-cased to the same
      // value. Returning the SAME uniqueId for both calls simulates a real
      // content-hash collision on the normalized data — i.e. the fix lets
      // the second row be flagged as an internal duplicate.
      mocks.generateUniqueId
        .mockReturnValueOnce("dataset-456:hash:abc123")
        .mockReturnValueOnce("dataset-456:hash:abc123");
      drizzleMock._enqueue([]);
      mockPayload.update.mockResolvedValueOnce({});

      const result = await analyzeDuplicatesJob.handler(mockContext);

      // Both rows processed, second flagged as internal duplicate.
      expect(result).toEqual({ output: { totalRows: 2, uniqueRows: 1, internalDuplicates: 1, externalDuplicates: 0 } });
      expect(mocks.generateUniqueId).toHaveBeenCalledTimes(2);

      // Critical assertion: each invocation received the TRANSFORMED row
      // (title already lower-cased), not the raw row. If the handler fell
      // back to `[]` transforms (pre-fix behavior), it would have passed
      // the raw differing values and the rows would have hashed differently.
      const firstCallRow = mocks.generateUniqueId.mock.calls[0]?.[0] as Record<string, unknown>;
      const secondCallRow = mocks.generateUniqueId.mock.calls[1]?.[0] as Record<string, unknown>;
      expect(firstCallRow).toEqual({ title: "concert tonight" });
      expect(secondCallRow).toEqual({ title: "concert tonight" });
    });

    it("should replay the full transform chain needed to produce an external id", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: { enabled: true },
        idStrategy: { type: "external", externalIdPath: "id" },
        ingestTransforms: [
          {
            id: "transform-1",
            type: "rename",
            from: "user.name",
            to: "metadata.raw",
            active: true,
            autoDetected: false,
          },
          {
            id: "transform-2",
            type: "string-op",
            from: "metadata.raw",
            to: "id",
            operation: "lowercase",
            active: true,
            autoDetected: false,
          },
          { id: "transform-3", type: "rename", from: "title", to: "unused", active: true, autoDetected: false },
        ],
      };

      const mockIngestFile = createMockIngestFile();
      const mockFileData = [{ "user.name": "ALPHA-123", title: "Event 1" }];

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile)
        .mockResolvedValueOnce(mockIngestJob);

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));
      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:alpha-123");
      drizzleMock._enqueue([]);
      mockPayload.update.mockResolvedValueOnce({});

      const result = await analyzeDuplicatesJob.handler(mockContext);

      expect(result).toEqual({ output: { totalRows: 1, uniqueRows: 1, internalDuplicates: 0, externalDuplicates: 0 } });
      expect(mocks.generateUniqueId).toHaveBeenCalledTimes(1);

      const transformedRow = mocks.generateUniqueId.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(transformedRow).toMatchObject({ id: "alpha-123", title: "Event 1" });
      expect(transformedRow).not.toHaveProperty("user.name");
      expect(transformedRow).not.toHaveProperty("unused");
    });

    it("should identify internal duplicates", async () => {
      // Mock import job
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Mock dataset with deduplication enabled
      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: {
          enabled: true, // This must be true for analysis to run
        },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      // Mock import file
      const mockIngestFile = createMockIngestFile();

      // Mock file data with internal duplicate
      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
        { id: "1", title: "Event 1 Again" }, // Duplicate of first row
      ];

      // Setup mocks — when dedup is enabled, progress init passes 0 and refetches the job
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile)
        .mockResolvedValueOnce(mockIngestJob); // Refetch after initializeStageProgress

      // No getFileRowCount call when dedup is enabled
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mocks.generateUniqueId
        .mockReturnValueOnce("dataset-456:ext:1")
        .mockReturnValueOnce("dataset-456:ext:2")
        .mockReturnValueOnce("dataset-456:ext:1"); // Same as first

      // Mock no existing events (no external duplicates) — Drizzle chain resolves to []
      drizzleMock._enqueue([]);
      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await analyzeDuplicatesJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          totalRows: 3,
          uniqueRows: 2, // uniqueIdMap.size = 2 (distinct unique IDs: id:1, id:2)
          internalDuplicates: 1,
          externalDuplicates: 0,
        },
      });
    });

    it("should identify external duplicates", async () => {
      // Mock import job
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Mock dataset with deduplication enabled
      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: {
          enabled: true, // This must be true for analysis to run
        },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      // Mock import file
      const mockIngestFile = createMockIngestFile();

      // Mock file data
      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
      ];

      // Setup mocks — when dedup is enabled, progress init passes 0 and refetches the job
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile)
        .mockResolvedValueOnce(mockIngestJob); // Refetch after initializeStageProgress

      // No getFileRowCount call when dedup is enabled
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1").mockReturnValueOnce("dataset-456:ext:2");

      // Mock existing event found via Drizzle typed API — resolves to array of matching rows
      drizzleMock._enqueue([{ id: 123, uniqueId: "dataset-456:ext:1" }]);
      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await analyzeDuplicatesJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          totalRows: 2,
          uniqueRows: 1, // 2 unique IDs minus 1 external duplicate
          internalDuplicates: 0,
          externalDuplicates: 1,
        },
      });
    });

    it('counts external duplicates in uniqueRows when duplicateStrategy is "update"', async () => {
      // Regression: under "update" strategy, external duplicates are re-written
      // (as updates), so they must count toward uniqueRows and the quota pre-check
      // rather than being subtracted. Mirrors the test above but with the
      // "update" strategy configured on the dataset.
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: { enabled: true },
        idStrategy: { type: "external", externalIdPath: "id", duplicateStrategy: "update" },
      };

      const mockIngestFile = createMockIngestFile();

      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
      ];

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile)
        .mockResolvedValueOnce(mockIngestJob);

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mocks.generateUniqueId.mockReturnValueOnce("dataset-456:ext:1").mockReturnValueOnce("dataset-456:ext:2");

      // One external duplicate found
      drizzleMock._enqueue([{ id: 123, uniqueId: "dataset-456:ext:1" }]);
      mockPayload.update.mockResolvedValueOnce({});

      const result = await analyzeDuplicatesJob.handler(mockContext);

      expect(result).toEqual({
        output: {
          totalRows: 2,
          // 2 unique IDs; external dupes are NOT subtracted under "update" strategy
          uniqueRows: 2,
          internalDuplicates: 0,
          externalDuplicates: 1,
        },
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw Error when ingest job not found (onFail handles failure marking)", async () => {
      mockPayload.findByID.mockResolvedValue(null);
      mockPayload.update.mockResolvedValue({});

      const error = await analyzeDuplicatesJob.handler(mockContext).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Ingest job not found: import-123");
      expect(mockPayload.findByID).toHaveBeenCalledWith({ collection: "ingest-jobs", id: "import-123" });
    });

    it("should throw Error when dataset not found (onFail handles failure marking)", async () => {
      const mockIngestJob = { id: "import-123", dataset: "dataset-456", ingestFile: "file-789" };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestJob).mockResolvedValueOnce(null); // Dataset not found
      mockPayload.update.mockResolvedValue({});

      await expect(analyzeDuplicatesJob.handler(mockContext)).rejects.toThrow("Dataset not found");
    });

    it("should throw Error when ingest file not found (onFail handles failure marking)", async () => {
      const mockIngestJob = { id: "import-123", dataset: "dataset-456", ingestFile: "file-789" };

      const mockDataset = { id: "dataset-456", deduplicationConfig: { enabled: true } };

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(null); // Ingest file not found
      mockPayload.update.mockResolvedValue({});

      await expect(analyzeDuplicatesJob.handler(mockContext)).rejects.toThrow("Ingest file not found");
    });

    it("should clean up sidecar files on error", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 1,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: { enabled: true },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      const mockIngestFile = createMockIngestFile();

      // Use mockImplementation to handle all findByID calls (initial + progress refetch)
      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      // No getFileRowCount call when dedup is enabled — totalRows derived from streaming

      // Mock streaming that throws
      mocks.streamBatchesFromFile.mockReturnValueOnce({
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            await Promise.resolve();
            throw new Error("Corrupt Excel file");
          },
        }),
      });

      await expect(analyzeDuplicatesJob.handler(mockContext)).rejects.toThrow("Corrupt Excel file");

      // Verify sidecar cleanup was called (asserts on cleanupSidecarsForJob, not the
      // low-level cleanupSidecarFiles, because with isolate:false the file-readers
      // mock doesn't propagate to resource-loading.ts's cached import)
      expect(mocks.cleanupSidecarsForJob).toHaveBeenCalledWith(mockPayload, "import-123");
    });
  });

  describe("File Pre-scan Optimization", () => {
    it("should not pre-scan file when deduplication is enabled", async () => {
      // Mock import job
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      // Mock dataset with deduplication enabled
      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: { enabled: true },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      // Mock import file
      const mockIngestFile = createMockIngestFile();

      // Mock file data - 3 rows
      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
        { id: "3", title: "Event 3" },
      ];

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile)
        .mockResolvedValueOnce(mockIngestJob); // Refetch after initializeStageProgress

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mocks.generateUniqueId
        .mockReturnValueOnce("dataset-456:ext:1")
        .mockReturnValueOnce("dataset-456:ext:2")
        .mockReturnValueOnce("dataset-456:ext:3");

      // Mock no existing events — Drizzle chain resolves to []
      drizzleMock._enqueue([]);
      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await analyzeDuplicatesJob.handler(mockContext);

      // Verify getFileRowCount was NOT called (dedup enabled skips pre-scan)
      expect(mocks.getFileRowCount).not.toHaveBeenCalled();

      // Verify totalRows was derived from streaming (3 rows processed)
      expect(result).toEqual({ output: { totalRows: 3, uniqueRows: 3, internalDuplicates: 0, externalDuplicates: 0 } });
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty file", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: { enabled: true },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      const mockIngestFile = createMockIngestFile();

      // Setup mocks — when dedup is enabled, progress init passes 0 and refetches the job
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile)
        .mockResolvedValueOnce(mockIngestJob); // Refetch after initializeStageProgress

      // No getFileRowCount call when dedup is enabled
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([]));

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await analyzeDuplicatesJob.handler(mockContext);

      // Verify result for empty file
      expect(result).toEqual({ output: { totalRows: 0, uniqueRows: 0, internalDuplicates: 0, externalDuplicates: 0 } });

      // Verify no external duplicate check was made (Drizzle select not called for empty file)
      expect(drizzleMock.select).not.toHaveBeenCalled();
    });
  });

  describe("onFail Callback", () => {
    it("should mark ingest job as failed when ingestJobId is a string", async () => {
      const mockArgs = {
        input: { ingestJobId: "import-999" },
        req: { payload: mockPayload },
        job: { error: "Some task failure" },
      };

      mockPayload.update.mockResolvedValueOnce({});

      await analyzeDuplicatesJob.onFail(mockArgs as any);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: "import-999",
        data: { stage: "failed", errorLog: { lastError: "Some task failure", context: "analyze-duplicates" } },
      });
    });

    it("should mark ingest job as failed when ingestJobId is a number", async () => {
      const mockArgs = { input: { ingestJobId: 123 }, req: { payload: mockPayload }, job: { error: "Task error" } };

      mockPayload.update.mockResolvedValueOnce({});

      await analyzeDuplicatesJob.onFail(mockArgs as any);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: 123,
        data: { stage: "failed", errorLog: { lastError: "Task error", context: "analyze-duplicates" } },
      });
    });

    it("should use fallback message when job.error is not a string", async () => {
      const mockArgs = {
        input: { ingestJobId: "import-999" },
        req: { payload: mockPayload },
        job: { error: { complex: "object" } },
      };

      mockPayload.update.mockResolvedValueOnce({});

      await analyzeDuplicatesJob.onFail(mockArgs as any);

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            errorLog: { lastError: "Task failed after all retries", context: "analyze-duplicates" },
          }),
        })
      );
    });

    it("should skip when ingestJobId is not a string or number", async () => {
      const mockArgs = { input: { ingestJobId: undefined }, req: { payload: mockPayload }, job: { error: "error" } };

      await analyzeDuplicatesJob.onFail(mockArgs as any);

      expect(mockPayload.update).not.toHaveBeenCalled();
    });

    it("should log and swallow the error when update fails in onFail", async () => {
      const mockArgs = { input: { ingestJobId: "import-999" }, req: { payload: mockPayload }, job: { error: "error" } };
      const dbError = new Error("DB error");

      mockPayload.update.mockRejectedValueOnce(dbError);

      await analyzeDuplicatesJob.onFail(mockArgs as any);

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ collection: "ingest-jobs", id: "import-999" })
      );
      expect(mockLogger.logError).toHaveBeenCalledWith(
        dbError,
        "Failed to mark ingest job as failed in onFail",
        expect.objectContaining({ context: "analyze-duplicates", ingestJobId: "import-999" })
      );
    });
  });

  describe("Review checks", () => {
    it("should trigger needsReview when high duplicate rate detected", async () => {
      const { shouldReviewHighDuplicates } = await import("@/lib/jobs/workflows/review-checks");
      (shouldReviewHighDuplicates as any).mockReturnValueOnce({ needsReview: true, duplicateRate: 0.85 });

      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: { enabled: true },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      const mockIngestFile = createMockIngestFile();

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile)
        .mockResolvedValueOnce(mockIngestJob);

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([[{ id: "1" }]]));
      mocks.generateUniqueId.mockReturnValueOnce("uid-1");
      drizzleMock._enqueue([]);
      mockPayload.update.mockResolvedValue({});

      const result = await analyzeDuplicatesJob.handler(mockContext);

      expect(result.output).toEqual(expect.objectContaining({ needsReview: true }));
    });

    it("should trigger needsReview when quota exceeded", async () => {
      const { checkQuotaForSheet } = await import("@/lib/jobs/workflows/review-checks");
      (checkQuotaForSheet as any).mockResolvedValueOnce({ allowed: false, current: 100, limit: 50 });

      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        ingestFile: "file-789",
        sheetIndex: 0,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      };

      const mockDataset = {
        id: "dataset-456",
        deduplicationConfig: { enabled: true },
        idStrategy: { type: "external", externalIdPath: "id" },
      };

      const mockIngestFile = createMockIngestFile();

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile)
        .mockResolvedValueOnce(mockIngestJob);

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([[{ id: "1" }]]));
      mocks.generateUniqueId.mockReturnValueOnce("uid-1");
      drizzleMock._enqueue([]);
      mockPayload.update.mockResolvedValue({});

      const result = await analyzeDuplicatesJob.handler(mockContext);

      expect(result.output).toEqual(expect.objectContaining({ needsReview: true }));
    });
  });
});
