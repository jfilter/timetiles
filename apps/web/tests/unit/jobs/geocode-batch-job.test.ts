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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { geocodeBatchJob } from "@/lib/jobs/handlers/geocode-batch-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { createMockDataset, createMockImportJob, createMockPayload } from "@/tests/setup/factories";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    readAllRowsFromFile: vi.fn(),
    geocodeAddress: vi.fn(),
    initializeGeocoding: vi.fn(),
    getFileRowCount: vi.fn(),
  };
});

// Mock external dependencies
vi.mock("@/lib/services/geocoding", () => ({
  geocodeAddress: mocks.geocodeAddress,
  initializeGeocoding: mocks.initializeGeocoding,
}));

vi.mock("@/lib/utils/file-readers", () => ({
  readAllRowsFromFile: mocks.readAllRowsFromFile,
  getFileRowCount: mocks.getFileRowCount,
}));

// Don't mock @/lib/types/geocoding - use real implementation

describe.sequential("GeocodeBatchJob Handler", () => {
  let mockPayload: ReturnType<typeof createMockPayload>;
  let mockContext: JobHandlerContext;

  beforeEach(() => {
    vi.clearAllMocks();
    // Explicitly reset hoisted mocks to clear both call history AND implementations
    mocks.readAllRowsFromFile.mockReset();
    mocks.geocodeAddress.mockReset();
    mocks.initializeGeocoding.mockReset();
    mocks.getFileRowCount.mockReset();
    mockPayload = createMockPayload();
    mockContext = {
      payload: mockPayload,
      input: { importJobId: "import-123" },
    } as unknown as JobHandlerContext;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Success Cases", () => {
    it("should geocode unique locations successfully", async () => {
      const mockImportJob = {
        ...createMockImportJob(),
        id: "import-123",
        dataset: "dataset-123",
        importFile: "file-123",
        sheetIndex: 0,
        detectedFieldMappings: {
          locationPath: "address",
        },
      };

      // Mock file with duplicate locations
      mocks.readAllRowsFromFile.mockReturnValue([
        { id: "1", title: "Event 1", address: "123 Main St" },
        { id: "2", title: "Event 2", address: "456 Oak Ave" },
        { id: "3", title: "Event 3", address: "123 Main St" }, // Duplicate
      ]);

      // Mock findByID to return the job for the initial call and for ProgressTrackingService calls
      mockPayload.findByID.mockResolvedValue(mockImportJob);

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

      const result = await geocodeBatchJob.handler(mockContext);

      // Should only geocode unique locations (2 unique, not 3 total)
      expect(mocks.geocodeAddress).toHaveBeenCalledTimes(2);
      expect(mocks.geocodeAddress).toHaveBeenCalledWith("123 Main St");
      expect(mocks.geocodeAddress).toHaveBeenCalledWith("456 Oak Ave");

      // Should store results as location → coordinates map
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          geocodingResults: {
            "123 Main St": {
              coordinates: { lat: 40.7128, lng: -74.006 },
              confidence: 0.9,
              formattedAddress: "123 Main St, New York, NY",
            },
            "456 Oak Ave": {
              coordinates: { lat: 34.0522, lng: -118.2437 },
              confidence: 0.8,
              formattedAddress: "456 Oak Ave, Los Angeles, CA",
            },
          },
          stage: "create-events",
        },
      });

      // Should return correct output
      expect(result.output).toEqual({
        totalRows: 3,
        uniqueLocations: 2,
        geocodedCount: 2,
        failedCount: 0,
      });
    });

    it("should skip rows without location values", async () => {
      const mockImportJob = {
        ...createMockImportJob(),
        id: "import-123",
        detectedFieldMappings: {
          locationPath: "address",
        },
      };

      // Mock file with missing/empty locations
      mocks.readAllRowsFromFile.mockReturnValue([
        { id: "1", title: "Event 1", address: "123 Main St" },
        { id: "2", title: "Event 2" }, // No address field
        { id: "3", title: "Event 3", address: "" }, // Empty address
        { id: "4", title: "Event 4", address: "   " }, // Whitespace only
      ]);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockImportJob);

      mocks.geocodeAddress.mockResolvedValueOnce({
        latitude: 40.7128,
        longitude: -74.006,
        confidence: 0.9,
        normalizedAddress: "123 Main St, New York, NY",
      });

      const result = await geocodeBatchJob.handler(mockContext);

      // Should only geocode the one valid location
      expect(mocks.geocodeAddress).toHaveBeenCalledTimes(1);
      expect(mocks.geocodeAddress).toHaveBeenCalledWith("123 Main St");

      expect(result.output).toEqual({
        totalRows: 4,
        uniqueLocations: 1,
        geocodedCount: 1,
        failedCount: 0,
      });
    });

    it("should handle geocoding failures gracefully", async () => {
      const mockImportJob = {
        ...createMockImportJob(),
        id: "import-123",
        detectedFieldMappings: {
          locationPath: "address",
        },
      };

      mocks.readAllRowsFromFile.mockReturnValue([
        { id: "1", title: "Event 1", address: "123 Main St" },
        { id: "2", title: "Event 2", address: "Invalid Address XYZ" },
      ]);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockImportJob);

      mocks.geocodeAddress
        .mockResolvedValueOnce({
          latitude: 40.7128,
          longitude: -74.006,
          confidence: 0.9,
          normalizedAddress: "123 Main St, New York, NY",
        })
        .mockRejectedValueOnce(new Error("Geocoding failed"));

      const result = await geocodeBatchJob.handler(mockContext);

      // Should geocode both, but only one succeeds
      expect(mocks.geocodeAddress).toHaveBeenCalledTimes(2);

      expect(result.output).toEqual({
        totalRows: 2,
        uniqueLocations: 2,
        geocodedCount: 1,
        failedCount: 1,
      });

      // Should still store the successful result
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            geocodingResults: {
              "123 Main St": expect.objectContaining({
                coordinates: { lat: 40.7128, lng: -74.006 },
              }),
            },
          }),
        })
      );
    });

    it("should skip geocoding when no location field detected", async () => {
      const mockImportJob = {
        ...createMockImportJob(),
        id: "import-123",
        detectedFieldMappings: {
          // No locationPath
        },
      };

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockImportJob);

      const result = await geocodeBatchJob.handler(mockContext);

      // Should not read file or geocode anything
      expect(mocks.readAllRowsFromFile).not.toHaveBeenCalled();
      expect(mocks.geocodeAddress).not.toHaveBeenCalled();

      // Should transition directly to CREATE_EVENTS
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: { stage: "create-events" },
      });

      expect(result.output).toEqual({ skipped: true });
    });

    it("should handle empty file gracefully", async () => {
      const mockImportJob = {
        ...createMockImportJob(),
        id: "import-123",
        detectedFieldMappings: {
          locationPath: "address",
        },
      };

      mocks.readAllRowsFromFile.mockReturnValue([]);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockImportJob);

      const result = await geocodeBatchJob.handler(mockContext);

      // Should not call geocoding
      expect(mocks.geocodeAddress).not.toHaveBeenCalled();

      // Should store empty results
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          geocodingResults: {},
          stage: "create-events",
        },
      });

      expect(result.output).toEqual({
        totalRows: 0,
        uniqueLocations: 0,
        geocodedCount: 0,
        failedCount: 0,
      });
    });

    it("should trim whitespace from locations", async () => {
      const mockImportJob = {
        ...createMockImportJob(),
        id: "import-123",
        detectedFieldMappings: {
          locationPath: "address",
        },
      };

      mocks.readAllRowsFromFile.mockReturnValue([
        { id: "1", address: "  123 Main St  " },
        { id: "2", address: "123 Main St" }, // Should be treated as same location
      ]);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockImportJob);

      mocks.geocodeAddress.mockResolvedValueOnce({
        latitude: 40.7128,
        longitude: -74.006,
        confidence: 0.9,
        normalizedAddress: "123 Main St, New York, NY",
      });

      const result = await geocodeBatchJob.handler(mockContext);

      // Should only geocode once (trimmed values are identical)
      expect(mocks.geocodeAddress).toHaveBeenCalledTimes(1);
      expect(mocks.geocodeAddress).toHaveBeenCalledWith("123 Main St");

      expect(result.output).toEqual({
        totalRows: 2,
        uniqueLocations: 1,
        geocodedCount: 1,
        failedCount: 0,
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle missing import job", async () => {
      mockPayload.findByID.mockResolvedValueOnce(null);

      await expect(geocodeBatchJob.handler(mockContext)).rejects.toThrow("Import job not found");
    });

    it("should handle missing import file", async () => {
      const mockDataset = createMockDataset();
      const mockImportJob = {
        ...createMockImportJob(),
        id: "import-123",
        dataset: mockDataset, // Use object to avoid lookup
        importFile: "file-123", // Use string so it needs to be looked up
      };

      // First call returns the job, second call for import file lookup returns null
      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(null); // Import file not found

      await expect(geocodeBatchJob.handler(mockContext)).rejects.toThrow("Import file not found");
    });

    it("should set job to FAILED stage on error", async () => {
      const mockImportJob = {
        ...createMockImportJob(),
        id: "import-123",
        detectedFieldMappings: {
          locationPath: "address",
        },
      };

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockImportJob);

      // Make readAllRowsFromFile throw an error
      mocks.readAllRowsFromFile.mockImplementation(() => {
        throw new Error("File read error");
      });

      await expect(geocodeBatchJob.handler(mockContext)).rejects.toThrow("File read error");

      // Should update job to FAILED stage with error details
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "failed",
          errorLog: {
            error: "File read error",
            context: "geocode-batch",
          },
        },
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-string location values", async () => {
      const mockImportJob = {
        ...createMockImportJob(),
        id: "import-123",
        detectedFieldMappings: {
          locationPath: "address",
        },
      };

      mocks.readAllRowsFromFile.mockReturnValue([
        { id: "1", address: "123 Main St" },
        { id: "2", address: 123 }, // Number
        { id: "3", address: null }, // Null
        { id: "4", address: { street: "456 Oak" } }, // Object
      ]);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockImportJob);

      mocks.geocodeAddress.mockResolvedValueOnce({
        latitude: 40.7128,
        longitude: -74.006,
        confidence: 0.9,
        normalizedAddress: "123 Main St, New York, NY",
      });

      const result = await geocodeBatchJob.handler(mockContext);

      // Should only geocode the valid string location
      expect(mocks.geocodeAddress).toHaveBeenCalledTimes(1);
      expect(mocks.geocodeAddress).toHaveBeenCalledWith("123 Main St");

      expect(result.output).toEqual({
        totalRows: 4,
        uniqueLocations: 1,
        geocodedCount: 1,
        failedCount: 0,
      });
    });

    it("should fail the job when all geocoding fails", async () => {
      const mockImportJob = {
        ...createMockImportJob(),
        id: "import-123",
        importFile: { id: "file-123", filename: "test.csv" },
        detectedFieldMappings: {
          locationPath: "address",
        },
      };

      mocks.readAllRowsFromFile.mockReturnValue([
        { id: "1", address: "Invalid 1" },
        { id: "2", address: "Invalid 2" },
      ]);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockImportJob);

      mocks.geocodeAddress.mockRejectedValue(new Error("Geocoding failed"));

      const result = await geocodeBatchJob.handler(mockContext);

      // Should return failure output
      expect(result.output).toEqual({
        failed: true,
        reason: "All geocoding failed",
        totalLocations: 2,
        failedCount: 2,
      });

      // Should update import job to FAILED stage with error message and failure details
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "failed",
          errorLog: {
            error: expect.stringContaining("Geocoding failed for all 2 locations"),
            context: "geocode-batch",
            failedLocations: 2,
            failures: expect.arrayContaining([
              expect.objectContaining({ location: "Invalid 1", error: expect.any(String) }),
              expect.objectContaining({ location: "Invalid 2", error: expect.any(String) }),
            ]),
          },
        },
      });

      // Should also update import file status to failed with detailed error
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-files",
        id: "file-123",
        data: {
          status: "failed",
          errorLog: expect.stringMatching(/Geocoding failed for all 2 locations.*Failed locations/s),
        },
      });
    });

    it("should handle large number of unique locations", async () => {
      const mockImportJob = {
        ...createMockImportJob(),
        id: "import-123",
        detectedFieldMappings: {
          locationPath: "address",
        },
      };

      // Generate 100 rows with 50 unique locations (each location appears twice)
      const rows = [];
      for (let i = 0; i < 50; i++) {
        rows.push({ id: `${i * 2}`, address: `Address ${i}` });
        rows.push({ id: `${i * 2 + 1}`, address: `Address ${i}` });
      }
      mocks.readAllRowsFromFile.mockReturnValue(rows);

      // Mock findByID to return the job for all calls
      mockPayload.findByID.mockResolvedValue(mockImportJob);

      // Mock successful geocoding for all
      mocks.geocodeAddress.mockResolvedValue({
        latitude: 40.7128,
        longitude: -74.006,
        confidence: 0.9,
        normalizedAddress: "Test Address",
      });

      const result = await geocodeBatchJob.handler(mockContext);

      // Should geocode exactly 50 unique locations, not 100
      expect(mocks.geocodeAddress).toHaveBeenCalledTimes(50);

      expect(result.output).toEqual({
        totalRows: 100,
        uniqueLocations: 50,
        geocodedCount: 50,
        failedCount: 0,
      });
    });
  });
});
