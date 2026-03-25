/**
 * Unit tests for the schema detection job handler.
 *
 * Tests automatic schema detection from imported data,
 * including field type inference and data structure analysis.
 *
 * @module
 * @category Tests
 */
// Import centralized mocks FIRST (before anything that uses them)
import "@/tests/mocks/services/logger";

import { JobCancelledError } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { schemaDetectionJob } from "@/lib/jobs/handlers/schema-detection-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import {
  createMockContext,
  createMockIngestFile,
  createMockIngestJob,
  createMockPayload,
  TEST_IDS,
} from "@/tests/setup/factories";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    streamBatchesFromFile: vi.fn(),
    cleanupSidecarFiles: vi.fn(),
    cleanupSidecarsForJob: vi.fn(),
    ProgressiveSchemaBuilder: vi.fn(),
    startStage: vi.fn(),
    completeStage: vi.fn(),
    updateAndCompleteBatch: vi.fn(),
  };
});

// Mock external dependencies
vi.mock("@/lib/ingest/file-readers", () => ({
  streamBatchesFromFile: mocks.streamBatchesFromFile,
  cleanupSidecarFiles: mocks.cleanupSidecarFiles,
}));

vi.mock("@/lib/services/schema-builder", () => ({ ProgressiveSchemaBuilder: mocks.ProgressiveSchemaBuilder }));

vi.mock("@/lib/ingest/progress-tracking", () => ({
  ProgressTrackingService: {
    startStage: mocks.startStage,
    completeStage: mocks.completeStage,
    updateAndCompleteBatch: mocks.updateAndCompleteBatch,
  },
}));

vi.mock("@/lib/types/schema-detection", () => ({ getSchemaBuilderState: vi.fn().mockReturnValue(null) }));

vi.mock("@/lib/jobs/utils/upload-path", () => ({
  getIngestFilePath: vi.fn((filename: string) => `/mock/ingest-files/${filename}`),
}));

// Mock cleanupSidecarsForJob directly — with isolate: false, the mock of file-readers
// doesn't propagate to resource-loading.ts's cached import of cleanupSidecarFiles
vi.mock("@/lib/jobs/utils/resource-loading", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, cleanupSidecarsForJob: mocks.cleanupSidecarsForJob };
});

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
  },
  shouldReviewHighEmptyRows: vi.fn().mockReturnValue({ needsReview: false }),
  shouldReviewNoTimestamp: vi.fn().mockReturnValue({ needsReview: false }),
  shouldReviewNoLocation: vi.fn().mockReturnValue({ needsReview: false }),
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

describe.sequential("SchemaDetectionJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;
  let mockSchemaBuilderInstance: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create standard mock payload and context using factories
    mockPayload = createMockPayload();
    mockContext = createMockContext(mockPayload, { ingestJobId: TEST_IDS.IMPORT_JOB });

    // Mock schema builder instance (job-specific)
    mockSchemaBuilderInstance = {
      processBatch: vi.fn(),
      detectEnumFields: vi.fn(),
      getState: vi.fn(),
      getSchema: vi.fn(),
    };

    // Setup ProgressiveSchemaBuilder mock
    // eslint-disable-next-line prefer-arrow-functions/prefer-arrow-functions -- regular function required: arrow functions cannot be constructors (vitest 4)
    mocks.ProgressiveSchemaBuilder.mockImplementation(function () {
      return mockSchemaBuilderInstance;
    });
  });

  describe("Success Cases", () => {
    it("should analyze batch data and detect schema successfully", async () => {
      // Create mock data using factories
      const mockIngestJob = createMockIngestJob();
      const mockIngestFile = createMockIngestFile();

      // Mock file data
      const mockFileData = [
        { id: "1", title: "Event 1", date: "2024-01-01", status: "active" },
        { id: "2", title: "Event 2", date: "2024-01-02", status: "pending" },
        { id: "3", title: "Event 3", date: "2024-01-03", status: "active" },
      ];

      // Mock schema and state
      const mockSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          date: { type: "string", format: "date" },
          status: { type: "string", enum: ["active", "pending"] },
        },
        required: ["id", "title", "date"],
      };

      const mockState = {
        fieldStats: {
          id: { occurrences: 3, uniqueValues: 3, typeDistribution: { string: 3 } },
          title: { occurrences: 3, uniqueValues: 3, typeDistribution: { string: 3 } },
          date: { occurrences: 3, uniqueValues: 3, typeDistribution: { string: 3 } },
          status: {
            occurrences: 3,
            uniqueValues: 2,
            enumValues: ["active", "pending"],
            typeDistribution: { string: 3 },
          },
        },
        recordCount: 3,
      };

      // Setup mocks — use mockImplementation to handle multiple findByID calls (initial + post-processing review checks)
      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValue(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValue(mockState);

      mocks.startStage.mockResolvedValueOnce(undefined);
      mocks.updateAndCompleteBatch.mockResolvedValueOnce(undefined);

      // Execute job
      const result = await schemaDetectionJob.handler(mockContext);

      // Verify result — new output format
      expect(result).toEqual({ output: { totalBatches: 1, totalRowsProcessed: 3 } });

      // Verify streaming was used
      expect(mocks.streamBatchesFromFile).toHaveBeenCalledWith(expect.stringContaining("test.csv"), {
        sheetIndex: 0,
        batchSize: expect.any(Number),
      });

      // Verify schema builder was called with non-duplicate rows
      expect(mockSchemaBuilderInstance.processBatch).toHaveBeenCalledWith(mockFileData);

      // Verify progress tracking was called
      expect(mocks.startStage).toHaveBeenCalledWith(
        mockPayload,
        "import-123",
        "detect-schema",
        expect.any(Number) // totalRows from duplicates.summary
      );
      expect(mocks.updateAndCompleteBatch).toHaveBeenCalled();
    });

    it("should detect geocoding fields via schema builder", async () => {
      // Create mock data using factories
      const mockIngestJob = createMockIngestJob();
      const mockIngestFile = createMockIngestFile();

      // Mock file data with geocoding fields
      const mockData = [
        { id: "1", address: "123 Main St", latitude: "40.7128", longitude: "-74.0060" },
        { id: "2", address: "456 Oak Ave", latitude: "34.0522", longitude: "-118.2437" },
      ];

      // Mock schema and state with detected geo fields
      const mockSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          address: { type: "string" },
          latitude: { type: "string" },
          longitude: { type: "string" },
        },
      };

      const mockState = {
        fieldStats: {
          id: {
            path: "id",
            occurrences: 2,
            uniqueValues: 2,
            typeDistribution: { string: 2 },
            uniqueSamples: ["1", "2"],
          },
          address: {
            path: "address",
            occurrences: 2,
            uniqueValues: 2,
            typeDistribution: { string: 2 },
            uniqueSamples: ["123 Main St", "456 Oak Ave"],
          },
          latitude: {
            path: "latitude",
            occurrences: 2,
            uniqueValues: 2,
            typeDistribution: { string: 2 },
            uniqueSamples: ["40.7128", "34.0522"],
            numericStats: { min: 34.0522, max: 40.7128, avg: 37.3825 },
          },
          longitude: {
            path: "longitude",
            occurrences: 2,
            uniqueValues: 2,
            typeDistribution: { string: 2 },
            uniqueSamples: ["-74.0060", "-118.2437"],
            numericStats: { min: -118.2437, max: -74.006, avg: -96.12485 },
          },
        },
        recordCount: 2,
        typeConflicts: [],
      };

      // Setup mocks — use mockImplementation to handle multiple findByID calls (initial + post-processing review checks)
      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockData]));

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValue(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValue(mockState);

      mocks.startStage.mockResolvedValueOnce(undefined);
      mocks.updateAndCompleteBatch.mockResolvedValueOnce(undefined);

      // Execute job
      const result = await schemaDetectionJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({ output: { totalBatches: 1, totalRowsProcessed: 2 } });

      // Verify progress tracking was called
      expect(mocks.startStage).toHaveBeenCalled();
      expect(mocks.updateAndCompleteBatch).toHaveBeenCalled();

      // Schema and state are saved to the import job via payload.update
      // (verified by the fact that the handler completes successfully)
    });

    it("should process multiple batches in single job", async () => {
      // Create mock data using factories
      const mockIngestJob = createMockIngestJob();
      const mockIngestFile = createMockIngestFile();

      // Mock two batches of data
      const batch1 = Array.from({ length: 3 }, (_, i) => ({ id: `${i + 1}`, title: `Event ${i + 1}` }));
      const batch2 = Array.from({ length: 2 }, (_, i) => ({ id: `${i + 4}`, title: `Event ${i + 4}` }));

      // Mock schema and state
      const mockSchema = { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } };

      const mockState1 = {
        fieldStats: {
          id: { occurrences: 3, uniqueValues: 3, typeDistribution: { string: 3 } },
          title: { occurrences: 3, uniqueValues: 3, typeDistribution: { string: 3 } },
        },
        recordCount: 3,
      };

      const mockState2 = {
        fieldStats: {
          id: { occurrences: 5, uniqueValues: 5, typeDistribution: { string: 5 } },
          title: { occurrences: 5, uniqueValues: 5, typeDistribution: { string: 5 } },
        },
        recordCount: 5,
      };

      // Setup mocks — use mockImplementation to handle multiple findByID calls (initial + post-processing review checks)
      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      // Stream yields two batches
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([batch1, batch2]));

      mockSchemaBuilderInstance.processBatch.mockResolvedValue(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValue(mockSchema);
      // getState called 3 times: once per batch in loop + once in finalizeSchemaDetection
      mockSchemaBuilderInstance.getState
        .mockReturnValueOnce(mockState1)
        .mockReturnValueOnce(mockState2)
        .mockReturnValueOnce(mockState2);

      mocks.startStage.mockResolvedValue(undefined);
      mocks.updateAndCompleteBatch.mockResolvedValue(undefined);

      // Execute job
      const result = await schemaDetectionJob.handler(mockContext);

      // Verify result shows both batches
      expect(result).toEqual({ output: { totalBatches: 2, totalRowsProcessed: 5 } });

      // Verify schema builder was called for each batch
      expect(mockSchemaBuilderInstance.processBatch).toHaveBeenCalledTimes(2);

      // Verify no next batch was queued (single job handles all batches)
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
    });

    it("should handle empty file and move to validation stage", async () => {
      // Create mock data using factories
      const mockIngestJob = createMockIngestJob();
      const mockIngestFile = createMockIngestFile();

      // Setup mocks — use mockImplementation to handle multiple findByID calls (initial + post-processing review checks)
      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      // Mock empty stream (no batches)
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([]));

      // Execute job
      const result = await schemaDetectionJob.handler(mockContext);

      // Verify result indicates zero work
      expect(result).toEqual({ output: { totalBatches: 0, totalRowsProcessed: 0 } });

      // Verify stage tracking at handler start (workflow controls sequencing)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: "import-123",
        data: { stage: "detect-schema" },
      });

      // Should not queue any jobs
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
      expect(mockSchemaBuilderInstance.processBatch).not.toHaveBeenCalled();
    });

    it("should skip duplicate rows during schema building", async () => {
      // Create mock data using factories (with duplicates)
      const mockIngestJob = createMockIngestJob({ hasDuplicates: true });
      const mockIngestFile = createMockIngestFile();

      // Mock file data (3 rows, but 2 are duplicates)
      const mockFileData = [
        { id: "1", title: "Event 1" }, // Will be processed
        { id: "2", title: "Event 2" }, // Internal duplicate - skip
        { id: "3", title: "Event 3" }, // External duplicate - skip
      ];

      // Mock schema and state
      const mockSchema = { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } };

      const mockState = {
        fieldStats: {
          id: { occurrences: 1, uniqueValues: 1, typeDistribution: { string: 1 } },
          title: { occurrences: 1, uniqueValues: 1, typeDistribution: { string: 1 } },
        },
        recordCount: 1,
      };

      // Setup mocks — use mockImplementation to handle multiple findByID calls (initial + post-processing review checks)
      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValue(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValue(mockState);

      mocks.startStage.mockResolvedValueOnce(undefined);
      mocks.updateAndCompleteBatch.mockResolvedValueOnce(undefined);

      // Execute job
      const result = await schemaDetectionJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({ output: { totalBatches: 1, totalRowsProcessed: 3 } });

      // Verify schema builder was called with filtered non-duplicate rows
      expect(mockSchemaBuilderInstance.processBatch).toHaveBeenCalledWith(
        [{ id: "1", title: "Event 1" }] // Only non-duplicate row
      );

      // Verify progress tracking was called
      expect(mocks.startStage).toHaveBeenCalled();
      expect(mocks.updateAndCompleteBatch).toHaveBeenCalled();
    });
  });

  describe("Progress Tracking", () => {
    it("should pass totalRows (not uniqueRows) to startStage when duplicates exist", async () => {
      // When hasDuplicates=true, factory sets totalRows=3, uniqueRows=1
      const mockIngestJob = createMockIngestJob({ hasDuplicates: true });
      const mockIngestFile = createMockIngestFile();

      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
        { id: "3", title: "Event 3" },
      ];

      const mockSchema = { type: "object", properties: { id: { type: "string" } } };
      const mockState = {
        fieldStats: { id: { occurrences: 1, uniqueValues: 1, typeDistribution: { string: 1 } } },
        recordCount: 1,
      };

      // Use mockImplementation to handle multiple findByID calls (initial + post-processing review checks)
      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });
      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValue(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValue(mockState);

      mocks.startStage.mockResolvedValueOnce(undefined);
      mocks.updateAndCompleteBatch.mockResolvedValueOnce(undefined);

      await schemaDetectionJob.handler(mockContext);

      // Must use totalRows (3), not uniqueRows (1), because the stream iterates all rows
      expect(mocks.startStage).toHaveBeenCalledWith(
        mockPayload,
        TEST_IDS.IMPORT_JOB,
        "detect-schema",
        3 // totalRows from duplicates.summary, NOT uniqueRows
      );
    });
  });

  describe("Error Handling", () => {
    it("should throw Error when ingest job not found (onFail handles failure marking)", async () => {
      mockPayload.findByID.mockResolvedValue(null);
      mockPayload.update.mockResolvedValue({});

      await expect(schemaDetectionJob.handler(mockContext)).rejects.toThrow("Ingest job not found");
    });

    it("should throw Error when ingest file not found (onFail handles failure marking)", async () => {
      const mockIngestJob = createMockIngestJob();

      mockPayload.findByID.mockResolvedValueOnce(mockIngestJob).mockResolvedValueOnce(null); // Ingest file not found
      mockPayload.update.mockResolvedValue({});

      await expect(schemaDetectionJob.handler(mockContext)).rejects.toThrow("Ingest file not found");
    });

    it("should re-throw streaming errors for Payload to retry (onFail handles failure marking)", async () => {
      const mockIngestJob = createMockIngestJob();
      const mockIngestFile = createMockIngestFile();
      const mockDataset = { id: TEST_IDS.DATASET };

      // Use mockImplementation to handle all findByID calls (initial + error-path reload)
      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        return Promise.resolve(null);
      });
      mockPayload.update.mockResolvedValue({});

      // Mock streaming that throws an error
      mocks.streamBatchesFromFile.mockReturnValueOnce({
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            await Promise.resolve();
            throw new Error("File not found");
          },
        }),
      });

      // Error is re-thrown for Payload to retry; onFail marks job as failed after retries exhaust
      await expect(schemaDetectionJob.handler(mockContext)).rejects.toThrow("File not found");
    });

    it("should re-throw transient errors for Payload to retry", async () => {
      const mockIngestJob = createMockIngestJob();
      const mockIngestFile = createMockIngestFile();
      const mockDataset = { id: TEST_IDS.DATASET };

      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        if (collection === "datasets") return Promise.resolve(mockDataset);
        return Promise.resolve(null);
      });

      // Mock streaming that throws a transient error (matches transient patterns)
      mocks.streamBatchesFromFile.mockReturnValueOnce({
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            await Promise.resolve();
            throw new Error("Connection timeout");
          },
        }),
      });

      // Transient error: re-throws original error for Payload to retry (not JobCancelledError)
      const error = await schemaDetectionJob.handler(mockContext).catch((e: unknown) => e);

      expect(error).not.toBeInstanceOf(JobCancelledError);
      expect((error as Error).message).toBe("Connection timeout");

      // Verify sidecar cleanup was called (asserts on cleanupSidecarsForJob, not the
      // low-level cleanupSidecarFiles, because with isolate:false the file-readers
      // mock doesn't propagate to resource-loading.ts's cached import)
      expect(mocks.cleanupSidecarsForJob).toHaveBeenCalledWith(mockPayload, TEST_IDS.IMPORT_JOB);
    });
  });

  describe("Edge Cases", () => {
    it("should not seed schema builder from persisted state on retry", async () => {
      // Simulate a retry: import job has persisted schemaBuilderState from a previous attempt
      const mockIngestJob = createMockIngestJob();
      // Add persisted state simulating a partial prior run
      (mockIngestJob as any).schemaBuilderState = {
        fieldStats: { id: { occurrences: 10, uniqueValues: 10, typeDistribution: { string: 10 } } },
        recordCount: 10,
      };

      const mockIngestFile = createMockIngestFile();

      const mockFileData = [{ id: "1", title: "Event 1" }];

      const mockSchema = { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } };

      const mockState = {
        fieldStats: {
          id: { occurrences: 1, uniqueValues: 1, typeDistribution: { string: 1 } },
          title: { occurrences: 1, uniqueValues: 1, typeDistribution: { string: 1 } },
        },
        recordCount: 1,
      };

      // Use mockImplementation to handle multiple findByID calls (initial + post-processing review checks)
      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "ingest-files") return Promise.resolve(mockIngestFile);
        return Promise.resolve(null);
      });

      mocks.streamBatchesFromFile.mockReturnValueOnce(mockAsyncGenerator([mockFileData]));

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValue(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValue(mockState);

      mocks.startStage.mockResolvedValueOnce(undefined);
      mocks.updateAndCompleteBatch.mockResolvedValueOnce(undefined);

      const result = await schemaDetectionJob.handler(mockContext);

      expect(result).toEqual({ output: { totalBatches: 1, totalRowsProcessed: 1 } });

      // ProgressiveSchemaBuilder must be constructed with undefined (from null),
      // NOT with the persisted state — single-job pattern always starts fresh
      expect(mocks.ProgressiveSchemaBuilder).toHaveBeenCalledWith(undefined);
    });
  });
});
