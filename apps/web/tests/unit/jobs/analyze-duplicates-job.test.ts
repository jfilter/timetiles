/**
 * @module
 */
// Import centralized mocks FIRST (before anything that uses them)
import "@/tests/mocks/services/logger";

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
  },
  shouldReviewHighDuplicates: vi.fn().mockReturnValue({ needsReview: false }),
  checkQuotaForSheet: vi.fn().mockResolvedValue({ allowed: true }),
  setNeedsReview: vi.fn().mockResolvedValue(undefined),
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
      input: { ingestJobId: "import-123" } as any,
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
        { type: "external", externalIdPath: "id" }
      );

      // Verify external duplicate check via Drizzle typed API
      expect(drizzleMock.select).toHaveBeenCalledTimes(1);
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

      // Use mockImplementation to handle all findByID calls (initial + progress refetch + error-path reload)
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

      // Verify sidecar cleanup was called
      expect(mocks.cleanupSidecarFiles).toHaveBeenCalledWith(
        expect.stringContaining("test.csv"),
        1 // sheetIndex from mockIngestJob
      );
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
});
