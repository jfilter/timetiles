/**
 * Unit tests for the geocode batch job handler.
 *
 * Tests unique location geocoding during import processing,
 * including deduplication and error handling.
 *
 * @module
 * @category Tests
 */
// Import centralized logger mock FIRST (before anything that uses @/lib/logger)
// eslint-disable-next-line simple-import-sort/imports -- mock side-effect must load before handler
import { mockLogger } from "@/tests/mocks/services/logger";

import { JobCancelledError } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { geocodeBatchJob } from "@/lib/jobs/handlers/geocode-batch-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { createMockDataset, createMockIngestJob, createMockPayload } from "@/tests/setup/factories";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  const geocode = vi.fn();
  const MockGeocodingService = class {
    geocode = geocode;
  };
  return {
    streamBatchesFromFile: vi.fn(),
    cleanupSidecarFiles: vi.fn(),
    cleanupSidecarsForJob: vi.fn(),
    geocode,
    MockGeocodingService,
    getIngestFilePath: vi.fn().mockReturnValue("/app/uploads/test-import.csv"),
  };
});

// Mock external dependencies
vi.mock("@/lib/services/geocoding", () => ({
  GeocodingService: class MockGeocodingService {
    geocode = mocks.geocode;
  },
  createGeocodingService: () => ({
    geocode: mocks.geocode,
    /**
     * Mock batchGeocode that delegates to the mocked geocode function,
     * mirroring the real GeocodingOperations.batchGeocode behavior.
     */
    batchGeocode: async (addresses: string[], _batchSize: number = 10) => {
      const results = new Map();
      const summary = { total: addresses.length, successful: 0, failed: 0, cached: 0 };

      for (const address of addresses) {
        try {
          const result = await mocks.geocode(address);
          results.set(address, result);
          summary.successful++;
        } catch (error) {
          results.set(address, error);
          summary.failed++;
        }
      }

      return { results, summary };
    },
  }),
}));

vi.mock("@/lib/ingest/file-readers", () => ({
  streamBatchesFromFile: mocks.streamBatchesFromFile,
  cleanupSidecarFiles: mocks.cleanupSidecarFiles,
}));

vi.mock("@/lib/jobs/utils/upload-path", () => ({ getIngestFilePath: mocks.getIngestFilePath }));

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
    FILE_TOO_LARGE: "file-too-large",
  },
  shouldReviewGeocodingPartial: vi.fn().mockReturnValue({ needsReview: false }),
  setNeedsReview: vi.fn().mockResolvedValue(undefined),
  parseReviewChecksConfig: vi.fn().mockReturnValue({ config: undefined }),
}));

// Spy on progress tracking so tests can assert updateStageProgress arguments
const progressSpies = vi.hoisted(() => ({
  updateStageProgress: vi.fn().mockResolvedValue(undefined),
  startStage: vi.fn().mockResolvedValue(undefined),
  completeStage: vi.fn().mockResolvedValue(undefined),
  initializeStageProgress: vi.fn().mockResolvedValue(undefined),
  updatePostDeduplicationTotals: vi.fn().mockResolvedValue(undefined),
  completeBatch: vi.fn().mockResolvedValue(undefined),
  skipStage: vi.fn().mockResolvedValue(undefined),
  updateAndCompleteBatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ingest/progress-tracking", () => ({ ProgressTrackingService: progressSpies }));

// Don't mock @/lib/ingest/types/geocoding - use real implementation

/** Helper to mock streamBatchesFromFile as an async generator yielding one batch. */
const mockStreamBatches = (rows: Record<string, unknown>[]) => {
  mocks.streamBatchesFromFile.mockImplementation(function* () {
    if (rows.length > 0) yield rows;
  });
};

describe.sequential("GeocodeBatchJob Handler", () => {
  let mockPayload: ReturnType<typeof createMockPayload>;
  let mockContext: JobHandlerContext;

  beforeEach(() => {
    vi.clearAllMocks();
    // Explicitly reset hoisted mocks to clear both call history AND implementations
    mocks.streamBatchesFromFile.mockReset();
    mocks.cleanupSidecarFiles.mockReset();
    mocks.cleanupSidecarsForJob.mockReset();
    mocks.geocode.mockReset();
    mocks.getIngestFilePath.mockReset();
    mocks.getIngestFilePath.mockReturnValue("/app/uploads/test-import.csv");
    mockPayload = createMockPayload();
    mockContext = { req: { payload: mockPayload }, input: { ingestJobId: 123 } } as unknown as JobHandlerContext;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Success Cases", () => {
    it("should geocode unique locations successfully", async () => {
      const mockIngestJob = {
        ...createMockIngestJob(),
        id: 123,
        dataset: 456,
        ingestFile: 789,
        sheetIndex: 0,
        detectedFieldMappings: { locationPath: "address" },
      };

      // Mock file with duplicate locations
      mockStreamBatches([
        { id: "1", title: "Event 1", address: "123 Main St" },
        { id: "2", title: "Event 2", address: "456 Oak Ave" },
        { id: "3", title: "Event 3", address: "123 Main St" }, // Duplicate
      ]);

      // Mock findByID to return the job for the initial call and for ProgressTrackingService calls
      mockPayload.findByID.mockResolvedValue(mockIngestJob);

      mocks.geocode
        .mockResolvedValueOnce({
          latitude: 40.7128,
          longitude: -74.006,
          confidence: 0.9,
          normalizedAddress: "123 Main St, New York, NY",
        })
        .mockResolvedValueOnce({
          latitude: 34.0522,
          longitude: -118.2437,
          confidence: 0.8,
          normalizedAddress: "456 Oak Ave, Los Angeles, CA",
        });

      const result = await geocodeBatchJob.handler(mockContext);

      // Should only geocode unique locations (2 unique, not 3 total)
      expect(mocks.geocode).toHaveBeenCalledTimes(2);
      expect(mocks.geocode).toHaveBeenCalledWith("123 main st");
      expect(mocks.geocode).toHaveBeenCalledWith("456 oak ave");

      // Should store results (no stage transition — workflow controls sequencing)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: 123,
        data: {
          geocodingResults: {
            "123 main st": {
              coordinates: { lat: 40.7128, lng: -74.006 },
              confidence: 0.9,
              formattedAddress: "123 Main St, New York, NY",
            },
            "456 oak ave": {
              coordinates: { lat: 34.0522, lng: -118.2437 },
              confidence: 0.8,
              formattedAddress: "456 Oak Ave, Los Angeles, CA",
            },
          },
        },
      });

      // Should return correct output
      expect(result.output).toEqual({ geocoded: 2, failed: 0, skipped: 0, uniqueLocations: 2 });
    });

    it("should skip rows without location values", async () => {
      const mockIngestJob = { ...createMockIngestJob(), id: 123, detectedFieldMappings: { locationPath: "address" } };

      // Mock file with missing/empty locations
      mockStreamBatches([
        { id: "1", title: "Event 1", address: "123 Main St" },
        { id: "2", title: "Event 2" }, // No address field
        { id: "3", title: "Event 3", address: "" }, // Empty address
        { id: "4", title: "Event 4", address: "   " }, // Whitespace only
      ]);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockIngestJob);

      mocks.geocode.mockResolvedValueOnce({
        latitude: 40.7128,
        longitude: -74.006,
        confidence: 0.9,
        normalizedAddress: "123 Main St, New York, NY",
      });

      const result = await geocodeBatchJob.handler(mockContext);

      // Should only geocode the one valid location
      expect(mocks.geocode).toHaveBeenCalledTimes(1);
      expect(mocks.geocode).toHaveBeenCalledWith("123 main st");

      expect(result.output).toEqual({ geocoded: 1, failed: 0, skipped: 0, uniqueLocations: 1 });
    });

    it("should handle geocoding failures gracefully", async () => {
      const mockIngestJob = { ...createMockIngestJob(), id: 123, detectedFieldMappings: { locationPath: "address" } };

      mockStreamBatches([
        { id: "1", title: "Event 1", address: "123 Main St" },
        { id: "2", title: "Event 2", address: "Invalid Address XYZ" },
      ]);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockIngestJob);

      mocks.geocode
        .mockResolvedValueOnce({
          latitude: 40.7128,
          longitude: -74.006,
          confidence: 0.9,
          normalizedAddress: "123 Main St, New York, NY",
        })
        .mockRejectedValueOnce(new Error("Geocoding failed"));

      const result = await geocodeBatchJob.handler(mockContext);

      // Should geocode both, but only one succeeds
      expect(mocks.geocode).toHaveBeenCalledTimes(2);

      expect(result.output).toEqual({ geocoded: 1, failed: 1, skipped: 0, uniqueLocations: 2 });

      // Should still store the successful result
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            geocodingResults: {
              "123 main st": expect.objectContaining({ coordinates: { lat: 40.7128, lng: -74.006 } }),
            },
          }),
        })
      );
    });

    it("should skip geocoding when no location field detected", async () => {
      const mockIngestJob = {
        ...createMockIngestJob(),
        id: 123,
        detectedFieldMappings: {
          // No locationPath
        },
      };

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockIngestJob);

      const result = await geocodeBatchJob.handler(mockContext);

      // Should not stream file or geocode anything
      expect(mocks.streamBatchesFromFile).not.toHaveBeenCalled();
      expect(mocks.geocode).not.toHaveBeenCalled();

      // Should set stage for UI tracking (no stage transition to next stage)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: 123,
        data: { stage: "geocode-batch" },
      });

      expect(result.output).toEqual({ skipped: true });
    });

    it("should handle empty file gracefully", async () => {
      const mockIngestJob = { ...createMockIngestJob(), id: 123, detectedFieldMappings: { locationPath: "address" } };

      mockStreamBatches([]);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockIngestJob);

      const result = await geocodeBatchJob.handler(mockContext);

      // Should not call geocoding
      expect(mocks.geocode).not.toHaveBeenCalled();

      // Should set stage for UI tracking
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: 123,
        data: { stage: "geocode-batch" },
      });

      // No unique locations found — skipped via prepareGeocodingLocations
      expect(result.output).toEqual({ skipped: true, skippedWithCoords: 0 });
    });

    it("reports chunk.length (not PROGRESS_CHUNK_SIZE) for partial final chunk", async () => {
      // Regression: the previous math `Math.min(CHUNK, size - processed + CHUNK)`
      // always returned CHUNK regardless of remaining work, misreporting the
      // final partial chunk's size on the progress stage.
      // PROGRESS_CHUNK_SIZE is 50 in the handler — 51 unique locations means
      // one full chunk of 50 followed by a final chunk of 1.
      const addresses = Array.from({ length: 51 }, (_, i) => `${i + 1} Main St`);
      const rows = addresses.map((address, idx) => ({ id: String(idx + 1), address }));

      const mockIngestJob = { ...createMockIngestJob(), id: 123, detectedFieldMappings: { locationPath: "address" } };
      mockStreamBatches(rows);
      mockPayload.findByID.mockResolvedValue(mockIngestJob);

      // Every geocode succeeds — shape doesn't matter for this assertion.
      mocks.geocode.mockImplementation((addr: string) =>
        Promise.resolve({ latitude: 0, longitude: 0, confidence: 0.9, normalizedAddress: addr })
      );

      await geocodeBatchJob.handler(mockContext);

      // Filter to GEOCODE_BATCH progress calls (startStage etc. may pass other stages)
      const geocodeProgressCalls = progressSpies.updateStageProgress.mock.calls.filter(
        (call) => call[2] === "geocode-batch"
      );

      // Two chunks → two progress updates.
      expect(geocodeProgressCalls).toHaveLength(2);

      // First chunk: processed=50, currentBatchRows=50 (full chunk)
      expect(geocodeProgressCalls[0]?.[3]).toBe(50);
      expect(geocodeProgressCalls[0]?.[4]).toBe(50);

      // Final chunk: processed=51, currentBatchRows=1 (NOT 50 — that was the bug)
      expect(geocodeProgressCalls[1]?.[3]).toBe(51);
      expect(geocodeProgressCalls[1]?.[4]).toBe(1);
    });

    it("should trim whitespace from locations", async () => {
      const mockIngestJob = { ...createMockIngestJob(), id: 123, detectedFieldMappings: { locationPath: "address" } };

      mockStreamBatches([
        { id: "1", address: "  123 Main St  " },
        { id: "2", address: "123 Main St" }, // Should be treated as same location
      ]);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockIngestJob);

      mocks.geocode.mockResolvedValueOnce({
        latitude: 40.7128,
        longitude: -74.006,
        confidence: 0.9,
        normalizedAddress: "123 Main St, New York, NY",
      });

      const result = await geocodeBatchJob.handler(mockContext);

      // Should only geocode once (trimmed values are identical)
      expect(mocks.geocode).toHaveBeenCalledTimes(1);
      expect(mocks.geocode).toHaveBeenCalledWith("123 main st");

      expect(result.output).toEqual({ geocoded: 1, failed: 0, skipped: 0, uniqueLocations: 1 });
    });
  });

  describe("Error Handling", () => {
    it("should throw Error when import job not found (onFail handles failure marking)", async () => {
      mockPayload.findByID.mockResolvedValue(null);
      mockPayload.update.mockResolvedValue({});

      await expect(geocodeBatchJob.handler(mockContext)).rejects.toThrow("Ingest job not found");
    });

    it("should throw Error when import file not found (onFail handles failure marking)", async () => {
      const mockDataset = createMockDataset();
      const mockIngestJob = {
        ...createMockIngestJob(),
        id: 123,
        dataset: mockDataset, // Use object to avoid lookup
        ingestFile: 789, // Use numeric so it needs to be looked up
      };

      // First call returns the job, second call for import file lookup returns null
      mockPayload.findByID.mockResolvedValueOnce(mockIngestJob).mockResolvedValueOnce(null); // Ingest file not found
      mockPayload.update.mockResolvedValue({});

      await expect(geocodeBatchJob.handler(mockContext)).rejects.toThrow("Ingest file not found");
    });

    it("should re-throw transient errors for Payload to retry", async () => {
      const mockIngestJob = { ...createMockIngestJob(), id: 123, detectedFieldMappings: { locationPath: "address" } };

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockIngestJob);

      // Make streamBatchesFromFile throw a transient error (matches transient patterns)
      mocks.streamBatchesFromFile.mockImplementation(function* () {
        yield []; // eslint requires at least one yield in generators
        throw new Error("Connection timeout");
      });

      // Transient error: re-thrown as-is (not JobCancelledError)
      const error = await geocodeBatchJob.handler(mockContext).catch((e: unknown) => e);

      expect(error).not.toBeInstanceOf(JobCancelledError);
      expect((error as Error).message).toBe("Connection timeout");

      // Transient errors do NOT call failIngestJob -- Payload handles retries
      expect(mockPayload.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stage: "failed" }) })
      );
    });

    it("should clean up sidecar files on error", async () => {
      const mockIngestJob = {
        ...createMockIngestJob(),
        id: 123,
        sheetIndex: 2,
        detectedFieldMappings: { locationPath: "address" },
      };

      // Mock findByID to return appropriate data for each collection (including error cleanup re-load)
      mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") return Promise.resolve(mockIngestJob);
        if (collection === "datasets") return Promise.resolve(createMockDataset());
        if (collection === "ingest-files") return Promise.resolve({ id: "file-1", filename: "test.csv" });
        return Promise.resolve(null);
      });
      mockPayload.update.mockResolvedValue({});

      // Make streamBatchesFromFile throw an error (permanent, not matching transient patterns)
      mocks.streamBatchesFromFile.mockImplementation(function* () {
        yield []; // eslint requires at least one yield in generators
        throw new Error("File read error");
      });

      await expect(geocodeBatchJob.handler(mockContext)).rejects.toThrow("File read error");

      // Verify sidecar cleanup was called (asserts on cleanupSidecarsForJob, not the
      // low-level cleanupSidecarFiles, because with isolate:false the file-readers
      // mock doesn't propagate to resource-loading.ts's cached import)
      expect(mocks.cleanupSidecarsForJob).toHaveBeenCalledWith(mockPayload, 123);
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-string location values", async () => {
      const mockIngestJob = { ...createMockIngestJob(), id: 123, detectedFieldMappings: { locationPath: "address" } };

      mockStreamBatches([
        { id: "1", address: "123 Main St" },
        { id: "2", address: 123 }, // Number
        { id: "3", address: null }, // Null
        { id: "4", address: { street: "456 Oak" } }, // Object
      ]);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockIngestJob);

      mocks.geocode.mockResolvedValueOnce({
        latitude: 40.7128,
        longitude: -74.006,
        confidence: 0.9,
        normalizedAddress: "123 Main St, New York, NY",
      });

      const result = await geocodeBatchJob.handler(mockContext);

      // Should only geocode the valid string location
      expect(mocks.geocode).toHaveBeenCalledTimes(1);
      expect(mocks.geocode).toHaveBeenCalledWith("123 main st");

      expect(result.output).toEqual({ geocoded: 1, failed: 0, skipped: 0, uniqueLocations: 1 });
    });

    it("should fail the job when all geocoding fails", async () => {
      const mockIngestJob = {
        ...createMockIngestJob(),
        id: 123,
        ingestFile: { id: 789, filename: "test.csv" },
        detectedFieldMappings: { locationPath: "address" },
      };

      mockStreamBatches([
        { id: "1", address: "Invalid 1" },
        { id: "2", address: "Invalid 2" },
      ]);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockIngestJob);

      mocks.geocode.mockRejectedValue(new Error("Geocoding failed"));

      // Total geocoding failure now throws — caught by processSheets markSheetFailed
      await expect(geocodeBatchJob.handler(mockContext)).rejects.toThrow("Geocoding failed for all");

      // File status update is handled by workflow handler's updateIngestFileStatus, not by the task
    });

    it("should handle large number of unique locations", async () => {
      const mockIngestJob = { ...createMockIngestJob(), id: 123, detectedFieldMappings: { locationPath: "address" } };

      // Generate 100 rows with 50 unique locations (each location appears twice)
      const rows = [];
      for (let i = 0; i < 50; i++) {
        rows.push({ id: `${i * 2}`, address: `Address ${i}` }, { id: `${i * 2 + 1}`, address: `Address ${i}` });
      }
      mockStreamBatches(rows);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockIngestJob);

      // Mock successful geocoding for all
      mocks.geocode.mockResolvedValue({
        latitude: 40.7128,
        longitude: -74.006,
        confidence: 0.9,
        normalizedAddress: "Test Address",
      });

      const result = await geocodeBatchJob.handler(mockContext);

      // Should geocode exactly 50 unique locations, not 100
      expect(mocks.geocode).toHaveBeenCalledTimes(50);

      expect(result.output).toEqual({ geocoded: 50, failed: 0, skipped: 0, uniqueLocations: 50 });
    });
  });

  describe("onFail Callback", () => {
    it("should mark ingest job as failed with string error", async () => {
      const mockArgs = {
        input: { ingestJobId: "import-999" },
        req: { payload: mockPayload },
        job: { error: "Geocoding task failed" },
      };

      mockPayload.update.mockResolvedValueOnce({});

      await geocodeBatchJob.onFail(mockArgs as any);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: "import-999",
        data: { stage: "failed", errorLog: { lastError: "Geocoding task failed", context: "geocode-batch" } },
      });
    });

    it("should use fallback message when job.error is not a string", async () => {
      const mockArgs = { input: { ingestJobId: "import-999" }, req: { payload: mockPayload }, job: { error: null } };

      mockPayload.update.mockResolvedValueOnce({});

      await geocodeBatchJob.onFail(mockArgs as any);

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            errorLog: { lastError: "Task failed after all retries", context: "geocode-batch" },
          }),
        })
      );
    });

    it("should skip when ingestJobId is missing", async () => {
      const mockArgs = { input: {}, req: { payload: mockPayload }, job: { error: "error" } };

      await geocodeBatchJob.onFail(mockArgs as any);

      expect(mockPayload.update).not.toHaveBeenCalled();
    });

    it("should log and swallow the error when update fails", async () => {
      const mockArgs = { input: { ingestJobId: 123 }, req: { payload: mockPayload }, job: { error: "error" } };
      const dbError = new Error("DB error");

      mockPayload.update.mockRejectedValueOnce(dbError);

      await geocodeBatchJob.onFail(mockArgs as any);

      expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({ collection: "ingest-jobs", id: 123 }));
      expect(mockLogger.logError).toHaveBeenCalledWith(
        dbError,
        "Failed to mark ingest job as failed in onFail",
        expect.objectContaining({ context: "geocode-batch", ingestJobId: 123 })
      );
    });
  });

  describe("Review checks", () => {
    it("should trigger needsReview when geocoding partial failure is high", async () => {
      const { shouldReviewGeocodingPartial } = await import("@/lib/jobs/workflows/review-checks");
      (shouldReviewGeocodingPartial as any).mockReturnValueOnce({ needsReview: true, failRate: 0.6 });

      const mockIngestJob = { ...createMockIngestJob(), id: 123, detectedFieldMappings: { locationPath: "address" } };

      mockStreamBatches([
        { id: "1", address: "Valid Address" },
        { id: "2", address: "Invalid Address" },
      ]);

      mockPayload.findByID.mockResolvedValue(mockIngestJob);

      mocks.geocode
        .mockResolvedValueOnce({
          latitude: 40.7128,
          longitude: -74.006,
          confidence: 0.9,
          normalizedAddress: "Valid Address, NY",
        })
        .mockRejectedValueOnce(new Error("Not found"));

      const result = await geocodeBatchJob.handler(mockContext);

      expect(result.output).toEqual(expect.objectContaining({ needsReview: true, geocoded: 1, failed: 1 }));
    });
  });
});
