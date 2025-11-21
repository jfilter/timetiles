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
import "@/tests/mocks/services/path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { schemaDetectionJob } from "@/lib/jobs/handlers/schema-detection-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import {
  createMockContext,
  createMockImportFile,
  createMockImportJob,
  createMockPayload,
  TEST_FILENAMES,
  TEST_IDS,
} from "@/tests/setup/factories";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    readBatchFromFile: vi.fn(),
    ProgressiveSchemaBuilder: vi.fn(),
    updateJobProgress: vi.fn(),
    getSchemaBuilderState: vi.fn(),
  };
});

// Mock external dependencies
vi.mock("@/lib/utils/file-readers", () => ({
  readBatchFromFile: mocks.readBatchFromFile,
}));

vi.mock("@/lib/services/schema-builder", () => ({
  ProgressiveSchemaBuilder: mocks.ProgressiveSchemaBuilder,
}));

vi.mock("@/lib/services/progress-tracking", () => ({
  ProgressTrackingService: {
    updateJobProgress: mocks.updateJobProgress,
  },
}));

vi.mock("@/lib/types/schema-detection", () => ({
  getSchemaBuilderState: mocks.getSchemaBuilderState,
}));

describe.sequential("SchemaDetectionJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;
  let mockSchemaBuilderInstance: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create standard mock payload and context using factories
    mockPayload = createMockPayload();
    mockContext = createMockContext(mockPayload, {
      importJobId: TEST_IDS.IMPORT_JOB,
      batchNumber: 0,
    });

    // Mock schema builder instance (job-specific)
    mockSchemaBuilderInstance = {
      processBatch: vi.fn(),
      getState: vi.fn(),
      getSchema: vi.fn(),
    };

    // Setup ProgressiveSchemaBuilder mock
    mocks.ProgressiveSchemaBuilder.mockImplementation(() => mockSchemaBuilderInstance);
  });

  describe("Success Cases", () => {
    it("should analyze batch data and detect schema successfully", async () => {
      // Create mock data using factories
      const mockImportJob = createMockImportJob();
      const mockImportFile = createMockImportFile();

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

      // Setup mocks
      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(mockImportFile);

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData);
      mocks.getSchemaBuilderState.mockReturnValueOnce(null);

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockState);

      mocks.updateJobProgress.mockResolvedValueOnce(undefined);

      // Execute job
      const result = await schemaDetectionJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          batchNumber: 0,
          rowsProcessed: 3,
          hasMore: false,
        },
      });

      // Verify file reading
      expect(mocks.readBatchFromFile).toHaveBeenCalledWith("/mock/import-files/test.csv", {
        sheetIndex: 0,
        startRow: 0,
        limit: expect.any(Number),
      });

      // Verify schema builder was called with non-duplicate rows
      expect(mockSchemaBuilderInstance.processBatch).toHaveBeenCalledWith(mockFileData);

      // Verify progress tracking was called
      expect(mocks.updateJobProgress).toHaveBeenCalledWith(
        mockPayload,
        "import-123",
        "schema_detection",
        3,
        mockImportJob,
        {
          schema: mockSchema,
          schemaBuilderState: mockState,
        }
      );
    });

    it("should detect geocoding fields via schema builder", async () => {
      // Create mock data using factories
      const mockImportJob = createMockImportJob();
      const mockImportFile = createMockImportFile();

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
          id: { occurrences: 2, uniqueValues: 2 },
          address: { occurrences: 2, uniqueValues: 2 },
          latitude: { occurrences: 2, uniqueValues: 2 },
          longitude: { occurrences: 2, uniqueValues: 2 },
        },
        recordCount: 2,
        detectedGeoFields: {
          addressField: "address",
          latitude: "latitude",
          longitude: "longitude",
          confidence: 1,
        },
      };

      // Setup mocks
      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(mockImportFile);

      mocks.readBatchFromFile.mockReturnValueOnce(mockData);
      mocks.getSchemaBuilderState.mockReturnValueOnce(null);

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockState);

      mocks.updateJobProgress.mockResolvedValueOnce(undefined);

      // Execute job
      const result = await schemaDetectionJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          batchNumber: 0,
          rowsProcessed: 2,
          hasMore: false,
        },
      });

      // Verify geocoding fields are in schema builder state (not separate geocodingCandidates)
      expect(mocks.updateJobProgress).toHaveBeenCalledWith(
        mockPayload,
        "import-123",
        "schema_detection",
        2,
        mockImportJob,
        {
          schema: mockSchema,
          schemaBuilderState: mockState,
        }
      );

      // Verify detectedGeoFields are in the state
      const callArgs = mocks.updateJobProgress.mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![5].schemaBuilderState.detectedGeoFields).toEqual({
        addressField: "address",
        latitude: "latitude",
        longitude: "longitude",
        confidence: 1,
      });
    });

    it("should queue next batch when more data exists", async () => {
      // Create mock data using factories
      const mockImportJob = createMockImportJob();
      const mockImportFile = createMockImportFile();

      // Mock a full batch (10000 rows) to trigger hasMore = true
      const fullBatch = Array.from({ length: 10000 }, (_, i) => ({
        id: `${i + 1}`,
        title: `Event ${i + 1}`,
      }));

      // Mock schema and state
      const mockSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
        },
      };

      const mockState = {
        fieldStats: {
          id: { occurrences: 10000, uniqueValues: 10000 },
          title: { occurrences: 10000, uniqueValues: 10000 },
        },
        recordCount: 10000,
      };

      // Setup mocks
      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(mockImportFile);

      mocks.readBatchFromFile.mockReturnValueOnce(fullBatch);
      mocks.getSchemaBuilderState.mockReturnValueOnce(null);

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockState);

      mocks.updateJobProgress.mockResolvedValueOnce(undefined);

      // Execute job
      const result = await schemaDetectionJob.handler(mockContext);

      // Verify result indicates more data
      expect(result).toEqual({
        output: {
          batchNumber: 0,
          rowsProcessed: 10000,
          hasMore: true,
        },
      });

      // Verify next batch was queued
      expect(mockPayload.jobs.queue).toHaveBeenCalledWith({
        task: "detect-schema",
        input: {
          importJobId: "import-123",
          batchNumber: 1,
        },
      });
    });

    it("should handle empty batch and move to validation stage", async () => {
      // Create mock data using factories
      const mockImportJob = createMockImportJob();
      const mockImportFile = createMockImportFile(TEST_IDS.IMPORT_FILE, TEST_FILENAMES.EMPTY);

      // Setup mocks
      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(mockImportFile);

      // Mock empty batch (no more data)
      mocks.readBatchFromFile.mockReturnValueOnce([]);

      // Execute job
      const result = await schemaDetectionJob.handler(mockContext);

      // Verify result indicates completion
      expect(result).toEqual({
        output: {
          completed: true,
          batchNumber: 0,
          rowsProcessed: 0,
          hasMore: false,
        },
      });

      // Verify stage transition to validation
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "validate-schema",
        },
      });

      // Should not queue next batch or call schema builder
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
      expect(mockSchemaBuilderInstance.processBatch).not.toHaveBeenCalled();
    });

    it("should skip duplicate rows during schema building", async () => {
      // Create mock data using factories (with duplicates)
      const mockImportJob = createMockImportJob({ hasDuplicates: true });
      const mockImportFile = createMockImportFile();

      // Mock file data (3 rows, but 2 are duplicates)
      const mockFileData = [
        { id: "1", title: "Event 1" }, // Will be processed
        { id: "2", title: "Event 2" }, // Internal duplicate - skip
        { id: "3", title: "Event 3" }, // External duplicate - skip
      ];

      // Mock schema and state
      const mockSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
        },
      };

      const mockState = {
        fieldStats: {
          id: { occurrences: 1, uniqueValues: 1, typeDistribution: { string: 1 } },
          title: { occurrences: 1, uniqueValues: 1, typeDistribution: { string: 1 } },
        },
        recordCount: 1,
      };

      // Setup mocks
      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(mockImportFile);

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData);
      mocks.getSchemaBuilderState.mockReturnValueOnce(null);

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockState);

      mocks.updateJobProgress.mockResolvedValueOnce(undefined);

      // Execute job
      const result = await schemaDetectionJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          batchNumber: 0,
          rowsProcessed: 3, // Total rows read
          hasMore: false,
        },
      });

      // Verify schema builder was called with filtered non-duplicate rows
      expect(mockSchemaBuilderInstance.processBatch).toHaveBeenCalledWith(
        [{ id: "1", title: "Event 1" }] // Only non-duplicate row
      );

      // Verify progress tracking was called with correct count
      expect(mocks.updateJobProgress).toHaveBeenCalledWith(
        mockPayload,
        "import-123",
        "schema_detection",
        1, // Only 1 non-duplicate row processed
        mockImportJob,
        {
          schema: mockSchema,
          schemaBuilderState: mockState,
        }
      );
    });
  });

  describe("Error Handling", () => {
    it("should throw error when import job not found", async () => {
      mockPayload.findByID.mockResolvedValueOnce(null);

      await expect(schemaDetectionJob.handler(mockContext)).rejects.toThrow("Import job not found: import-123");
    });

    it("should throw error when import file not found", async () => {
      const mockImportJob = createMockImportJob();

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(null); // Import file not found

      await expect(schemaDetectionJob.handler(mockContext)).rejects.toThrow("Import file not found");
    });

    it("should handle file reading errors", async () => {
      const mockImportJob = createMockImportJob();
      const mockImportFile = createMockImportFile();

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(mockImportFile);

      mocks.readBatchFromFile.mockImplementationOnce(() => {
        throw new Error("File not found");
      });

      await expect(schemaDetectionJob.handler(mockContext)).rejects.toThrow("File not found");

      // Verify error handling updated job status
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "failed",
          errors: [
            {
              row: 0, // batchNumber * 10000
              error: "File not found",
            },
          ],
        },
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle existing schema builder state", async () => {
      // Create mock data using factories
      const mockImportJob = createMockImportJob();
      const mockImportFile = createMockImportFile();

      // Mock file data
      const mockFileData = [{ id: "1", title: "Event 1" }];

      // Mock existing schema builder state
      const existingState = {
        fieldStats: {
          id: { occurrences: 10, uniqueValues: 10, typeDistribution: { string: 10 } },
        },
        recordCount: 10,
      };

      // Mock updated schema and state
      const mockSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
        },
      };

      const mockState = {
        fieldStats: {
          id: { occurrences: 11, uniqueValues: 11, typeDistribution: { string: 11 } },
          title: { occurrences: 1, uniqueValues: 1, typeDistribution: { string: 1 } },
        },
        recordCount: 11,
      };

      // Setup mocks
      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(mockImportFile);

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData);
      mocks.getSchemaBuilderState.mockReturnValueOnce(existingState);

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockState);

      mocks.updateJobProgress.mockResolvedValueOnce(undefined);

      // Execute job
      const result = await schemaDetectionJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          batchNumber: 0,
          rowsProcessed: 1,
          hasMore: false,
        },
      });

      // Verify ProgressiveSchemaBuilder was initialized with existing state
      expect(mocks.ProgressiveSchemaBuilder).toHaveBeenCalledWith(existingState);
    });
  });
});
