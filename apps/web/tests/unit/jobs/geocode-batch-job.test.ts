import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { geocodeBatchJob } from "@/lib/jobs/handlers/geocode-batch-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    readBatchFromFile: vi.fn(),
    geocodeAddress: vi.fn(),
  };
});

// Mock external dependencies
vi.mock("@/lib/logger", () => ({
  createJobLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  logError: vi.fn(),
  logPerformance: vi.fn(),
}));

vi.mock("@/lib/services/geocoding", () => ({
  geocodeAddress: mocks.geocodeAddress,
}));

vi.mock("@/lib/utils/file-readers", () => ({
  readBatchFromFile: mocks.readBatchFromFile,
}));

vi.mock("@/lib/services/progress-tracking", () => ({
  ProgressTrackingService: {
    updateGeocodingProgress: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/types/geocoding", () => ({
  getGeocodingCandidate: vi.fn(),
  getGeocodingResults: vi.fn().mockReturnValue({}),
}));

describe.sequential("GeocodeBatchJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Set default mock implementations
    mocks.readBatchFromFile.mockResolvedValue([
      { id: "1", title: "Event 1", address: "123 Main St, NYC" },
      { id: "2", title: "Event 2", address: "456 Oak Ave, LA" },
    ]);

    mocks.geocodeAddress.mockResolvedValue({
      latitude: 40.7128,
      longitude: -74.006,
      confidence: 0.9,
      normalizedAddress: "123 Main St, New York, NY",
    });

    // Mock payload with required methods
    mockPayload = {
      findByID: vi.fn(),
      find: vi.fn(),
      update: vi.fn(),
      jobs: {
        queue: vi.fn().mockResolvedValue({}),
      },
    };

    // Mock context
    mockContext = {
      payload: mockPayload,
      job: {
        id: "test-job-1",
        taskStatus: {},
      },
      input: {
        importJobId: "import-123",
        batchNumber: 0,
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Success Cases", () => {
    it("should geocode events with addresses successfully", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        geocodingCandidates: {
          addressField: "address",
        },
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const mockDataset = {
        id: "dataset-123",
        name: "Test Dataset",
      };

      const mockImportFile = {
        id: "file-123",
        filename: "test.csv",
      };

      // Mock getGeocodingCandidate to return address field
      const { getGeocodingCandidate } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue({
        addressField: "address",
      });

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      mocks.geocodeAddress
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

      await geocodeBatchJob.handler(mockContext);

      expect(mocks.geocodeAddress).toHaveBeenCalledWith("123 Main St, NYC");
      expect(mocks.geocodeAddress).toHaveBeenCalledWith("456 Oak Ave, LA");

      // Check that ProgressTrackingService.updateGeocodingProgress was called
      const { ProgressTrackingService } = await import("@/lib/services/progress-tracking");
      expect(ProgressTrackingService.updateGeocodingProgress).toHaveBeenCalledWith(
        mockPayload,
        "import-123",
        2, // processedCount (both rows have addresses and were processed)
        mockImportJob,
        expect.any(Object), // geocoding results
      );
    });

    it("should skip events without addresses", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        geocodingCandidates: {
          addressField: "address",
        },
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const mockDataset = { id: "dataset-123" };
      const mockImportFile = { id: "file-123", filename: "test.csv" };

      // Mock getGeocodingCandidate to return address field
      const { getGeocodingCandidate } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue({
        addressField: "address",
      });

      // Mock file with no addresses
      mocks.readBatchFromFile.mockResolvedValue([
        { id: "1", title: "Event 1" }, // No address field
      ]);

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      await geocodeBatchJob.handler(mockContext);

      expect(mocks.geocodeAddress).not.toHaveBeenCalled();

      // Check that ProgressTrackingService.updateGeocodingProgress was called
      const { ProgressTrackingService } = await import("@/lib/services/progress-tracking");
      expect(ProgressTrackingService.updateGeocodingProgress).toHaveBeenCalledWith(
        mockPayload,
        "import-123",
        1, // processedCount (all rows were processed)
        mockImportJob,
        expect.any(Object),
      );
    });

    it("should handle geocoding failures gracefully", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        geocodingCandidates: {
          addressField: "address",
        },
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const mockDataset = { id: "dataset-123" };
      const mockImportFile = { id: "file-123", filename: "test.csv" };

      // Mock getGeocodingCandidate to return address field
      const { getGeocodingCandidate } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue({
        addressField: "address",
      });

      mocks.readBatchFromFile.mockResolvedValue([
        { id: "1", title: "Event 1", address: "123 Main St, NYC" },
        { id: "2", title: "Event 2", address: "Invalid Address" },
      ]);

      // Mock partial geocoding success - first succeeds, second fails
      mocks.geocodeAddress
        .mockResolvedValueOnce({
          latitude: 40.7128,
          longitude: -74.006,
          confidence: 0.9,
          normalizedAddress: "123 Main St, New York, NY",
        })
        .mockRejectedValueOnce(new Error("Geocoding failed"));

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      await geocodeBatchJob.handler(mockContext);

      // Check that ProgressTrackingService.updateGeocodingProgress was called
      const { ProgressTrackingService } = await import("@/lib/services/progress-tracking");
      expect(ProgressTrackingService.updateGeocodingProgress).toHaveBeenCalledWith(
        mockPayload,
        "import-123",
        2, // processedCount (both rows processed)
        mockImportJob,
        expect.any(Object),
      );
    });

    it("should queue next batch when more data exists", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        geocodingCandidates: {
          addressField: "address",
        },
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const mockDataset = { id: "dataset-123" };
      const mockImportFile = { id: "file-123", filename: "test.csv" };

      // Mock getGeocodingCandidate to return address field
      const { getGeocodingCandidate } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue({
        addressField: "address",
      });

      // Mock exactly BATCH_SIZES.GEOCODING (100) rows to indicate more data exists
      // The job checks if rows.length === GEOCODING_BATCH_SIZE to determine if there's more data
      const fullBatch = Array.from({ length: 100 }, (_, i) => ({
        id: String(i + 1),
        title: `Event ${i + 1}`,
        address: `${i + 1} Main St`,
      }));
      mocks.readBatchFromFile.mockResolvedValue(fullBatch);

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      await geocodeBatchJob.handler(mockContext);

      expect(mockPayload.jobs.queue).toHaveBeenCalledWith({
        task: "geocode-batch",
        input: {
          importJobId: "import-123",
          batchNumber: 1,
        },
      });
    });

    it("should transition to next stage when geocoding is complete", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        geocodingCandidates: {
          addressField: "address",
        },
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const mockDataset = { id: "dataset-123" };
      const mockImportFile = { id: "file-123", filename: "test.csv" };

      // Mock getGeocodingCandidate to return address field
      const { getGeocodingCandidate } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue({
        addressField: "address",
      });

      // Mock a small batch (less than batch size, indicating completion)
      mocks.readBatchFromFile.mockResolvedValue([
        { id: "1", title: "Event 1", address: "123 Main St" },
        { id: "2", title: "Event 2", address: "456 Oak Ave" },
      ]);

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      await geocodeBatchJob.handler(mockContext);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "create-events",
        },
      });
    });

    it("should preserve existing geocoding results", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        geocodingCandidates: {
          addressField: "address",
        },
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const existingResults = {
        "0": {
          rowNumber: 0,
          coordinates: { lat: 41.8781, lng: -87.6298 },
          confidence: 0.95,
          formattedAddress: "Previous Address",
        },
      };

      const mockDataset = { id: "dataset-123" };
      const mockImportFile = { id: "file-123", filename: "test.csv" };

      // Mock getGeocodingCandidate to return address field
      const { getGeocodingCandidate, getGeocodingResults } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue({
        addressField: "address",
      });
      vi.mocked(getGeocodingResults).mockReturnValue(existingResults);

      mocks.readBatchFromFile.mockResolvedValue([{ id: "1", title: "Event 1", address: "123 Main St, NYC" }]);

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      await geocodeBatchJob.handler(mockContext);

      // Check that ProgressTrackingService.updateGeocodingProgress was called with combined results
      const { ProgressTrackingService } = await import("@/lib/services/progress-tracking");
      expect(ProgressTrackingService.updateGeocodingProgress).toHaveBeenCalledWith(
        mockPayload,
        "import-123",
        1, // processedCount
        mockImportJob,
        expect.objectContaining({
          "0": expect.objectContaining({
            // New result added (existing results are merged)
            rowNumber: 0,
            coordinates: expect.objectContaining({
              lat: expect.any(Number),
              lng: expect.any(Number),
            }),
          }),
        }),
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle missing import job gracefully", async () => {
      mockPayload.findByID.mockResolvedValueOnce(null);

      await expect(geocodeBatchJob.handler(mockContext)).rejects.toThrow("Import job not found: import-123");
    });

    it("should handle geocoding service errors", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        geocodingCandidates: {
          addressField: "address",
        },
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const mockDataset = { id: "dataset-123" };
      const mockImportFile = { id: "file-123", filename: "test.csv" };

      // Mock getGeocodingCandidate to return address field
      const { getGeocodingCandidate } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue({
        addressField: "address",
      });

      mocks.readBatchFromFile.mockResolvedValue([{ id: "1", title: "Event 1", address: "123 Main St" }]);

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      mocks.geocodeAddress.mockRejectedValue(new Error("Geocoding service unavailable"));

      // Geocoding errors don't cause the job to fail, they're just logged
      const result = await geocodeBatchJob.handler(mockContext);

      expect(result.output.failedCount).toBe(1);
      expect(result.output.geocodedCount).toBe(0);
    });

    it("should handle file reading errors", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        geocodingCandidates: {
          addressField: "address",
        },
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const mockDataset = { id: "dataset-123" };
      const mockImportFile = { id: "file-123", filename: "test.csv" };

      // Mock getGeocodingCandidate
      const { getGeocodingCandidate } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue({
        addressField: "address",
      });

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      mocks.readBatchFromFile.mockRejectedValue(new Error("File not found"));

      await expect(geocodeBatchJob.handler(mockContext)).rejects.toThrow();
    });

    it("should handle no geocoding candidates", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const mockDataset = { id: "dataset-123" };

      // Mock getGeocodingCandidate to return null (no candidates)
      const { getGeocodingCandidate } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue(null);

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(mockDataset);

      const result = await geocodeBatchJob.handler(mockContext);

      expect(result).toEqual({ output: { skipped: true } });
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: { stage: "create-events" },
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty batch gracefully", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        geocodingCandidates: {
          addressField: "address",
        },
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const mockDataset = { id: "dataset-123" };
      const mockImportFile = { id: "file-123", filename: "empty.csv" };

      // Mock getGeocodingCandidate to return address field
      const { getGeocodingCandidate } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue({
        addressField: "address",
      });

      mocks.readBatchFromFile.mockResolvedValue([]);

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      await geocodeBatchJob.handler(mockContext);

      expect(mocks.geocodeAddress).not.toHaveBeenCalled();

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "create-events",
        },
      });
    });

    it("should handle mixed address formats", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        geocodingCandidates: {
          addressField: "address",
        },
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const mockDataset = { id: "dataset-123" };
      const mockImportFile = { id: "file-123", filename: "test.csv" };

      // Mock getGeocodingCandidate to return address field
      const { getGeocodingCandidate } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue({
        addressField: "address",
      });

      mocks.readBatchFromFile.mockResolvedValue([
        { id: "1", address: "123 Main St, NYC" },
        { id: "2", address: "" }, // Empty address
        { id: "3", address: null }, // Null address
        { id: "4", address: "   " }, // Whitespace only
      ]);

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      await geocodeBatchJob.handler(mockContext);

      // Only valid address should be geocoded
      expect(mocks.geocodeAddress).toHaveBeenCalledTimes(1);
      expect(mocks.geocodeAddress).toHaveBeenCalledWith("123 Main St, NYC");

      // Check that ProgressTrackingService.updateGeocodingProgress was called
      const { ProgressTrackingService } = await import("@/lib/services/progress-tracking");
      expect(ProgressTrackingService.updateGeocodingProgress).toHaveBeenCalledWith(
        mockPayload,
        "import-123",
        4, // processedCount (all rows processed)
        mockImportJob,
        expect.any(Object),
      );
    });

    it("should handle large batch numbers correctly", async () => {
      const largeBatchContext = {
        ...mockContext,
        input: {
          importJobId: "import-123",
          batchNumber: 10, // Large batch number
        },
      };

      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        geocodingCandidates: {
          addressField: "address",
        },
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const mockDataset = { id: "dataset-123" };
      const mockImportFile = { id: "file-123", filename: "test.csv" };

      // Mock getGeocodingCandidate to return address field
      const { getGeocodingCandidate } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue({
        addressField: "address",
      });

      // Mock a full batch to indicate more data exists
      const fullBatch = Array.from({ length: 100 }, (_, i) => ({
        id: String(i + 1),
        title: `Event ${i + 1}`,
        address: `${i + 1} Main St`,
      }));
      mocks.readBatchFromFile.mockResolvedValue(fullBatch);

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      await geocodeBatchJob.handler(largeBatchContext);

      expect(mockPayload.jobs.queue).toHaveBeenCalledWith({
        task: "geocode-batch",
        input: {
          importJobId: "import-123",
          batchNumber: 11, // Next batch
        },
      });
    });

    it("should handle rate limiting gracefully", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        geocodingCandidates: {
          addressField: "address",
        },
        duplicates: {
          internal: [],
          external: [],
        },
      };

      const mockDataset = { id: "dataset-123" };
      const mockImportFile = { id: "file-123", filename: "test.csv" };

      // Mock getGeocodingCandidate to return address field
      const { getGeocodingCandidate } = await import("@/lib/types/geocoding");
      vi.mocked(getGeocodingCandidate).mockReturnValue({
        addressField: "address",
      });

      mocks.readBatchFromFile.mockResolvedValue([{ id: "1", title: "Event 1", address: "123 Main St" }]);

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      mocks.geocodeAddress.mockRejectedValue(new Error("Rate limit exceeded"));

      // Rate limit errors don't cause the job to fail, they're just logged as failed geocoding attempts
      const result = await geocodeBatchJob.handler(mockContext);

      expect(result.output.failedCount).toBe(1);
      expect(result.output.geocodedCount).toBe(0);
    });
  });
});
