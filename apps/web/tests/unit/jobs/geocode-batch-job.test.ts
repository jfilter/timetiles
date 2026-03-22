/**
 * Unit tests for the geocode batch job handler.
 *
 * Tests unique location geocoding during import processing,
 * including deduplication and error handling.
 *
 * @module
 * @category Tests
 */
// Import centralized logger mock
import "@/tests/mocks/services/logger";

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

// Mock review checks — default: no review needed
vi.mock("@/lib/jobs/workflows/review-checks", () => ({
  REVIEW_REASONS: {
    SCHEMA_DRIFT: "schema-drift",
    QUOTA_EXCEEDED: "quota-exceeded",
    HIGH_DUPLICATE_RATE: "high-duplicates",
    GEOCODING_PARTIAL: "geocoding-partial",
  },
  shouldReviewGeocodingPartial: vi.fn().mockReturnValue({ needsReview: false }),
  setNeedsReview: vi.fn().mockResolvedValue(undefined),
}));

// Don't mock @/lib/types/geocoding - use real implementation

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

      // Should store empty results (no stage transition)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: 123,
        data: { geocodingResults: {} },
      });

      expect(result.output).toEqual({ geocoded: 0, failed: 0, skipped: 0, uniqueLocations: 0 });
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

      // Mock findByID to return the job for all calls (including error cleanup re-load)
      mockPayload.findByID.mockResolvedValue(mockIngestJob);
      mockPayload.update.mockResolvedValue({});

      // Make streamBatchesFromFile throw an error (permanent, not matching transient patterns)
      mocks.streamBatchesFromFile.mockImplementation(function* () {
        yield []; // eslint requires at least one yield in generators
        throw new Error("File read error");
      });

      await expect(geocodeBatchJob.handler(mockContext)).rejects.toThrow("File read error");

      // Should clean up sidecar files (best-effort)
      expect(mocks.cleanupSidecarFiles).toHaveBeenCalledTimes(1);
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
});
