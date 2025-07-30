import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSchemaVersionJob } from "@/lib/jobs/handlers/create-schema-version-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    createSchemaVersion: vi.fn(),
    getFieldStats: vi.fn(),
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
}));

vi.mock("@/lib/services/schema-versioning", () => ({
  SchemaVersioningService: {
    createSchemaVersion: mocks.createSchemaVersion,
  },
}));

vi.mock("@/lib/types/schema-detection", () => ({
  getFieldStats: mocks.getFieldStats,
}));

vi.mock("@/lib/constants/import-constants", () => ({
  JOB_TYPES: {
    CREATE_SCHEMA_VERSION: "create-schema-version",
  },
  PROCESSING_STAGE: {
    GEOCODE_BATCH: "geocode-batch",
    FAILED: "failed",
  },
}));

describe.sequential("CreateSchemaVersionJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock payload
    mockPayload = {
      findByID: vi.fn(),
      update: vi.fn(),
    };

    // Mock context
    mockContext = {
      payload: mockPayload,
      job: {
        id: "test-job-1",
        taskStatus: "running",
      } as any,
      input: {
        importJobId: "import-123",
      } as any,
    };
  });

  describe("Success Cases", () => {
    it("should create schema version successfully", async () => {
      // Mock import job with approved schema
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        schemaValidation: {
          approved: true,
          approvedBy: "user-789",
        },
        schema: {
          title: { type: "string" },
          date: { type: "date" },
        },
      };

      // Mock dataset
      const mockDataset = {
        id: "dataset-456",
        name: "Test Dataset",
      };

      // Mock field stats
      const mockFieldStats = {
        title: { uniqueCount: 100, nullCount: 0 },
        date: { uniqueCount: 95, nullCount: 5 },
      };

      // Mock created schema version
      const mockSchemaVersion = {
        id: "schema-version-101",
        dataset: "dataset-456",
        schema: mockImportJob.schema,
      };

      // Setup payload mock responses
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob) // First call returns import job
        .mockResolvedValueOnce(mockDataset); // Second call returns dataset

      mockPayload.update.mockResolvedValue({});

      mocks.getFieldStats.mockReturnValue(mockFieldStats);
      mocks.createSchemaVersion.mockResolvedValue(mockSchemaVersion);

      // Execute job
      const result = await createSchemaVersionJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          schemaVersionId: "schema-version-101",
        },
      });

      // Verify payload calls
      expect(mockPayload.findByID).toHaveBeenCalledTimes(2);
      expect(mockPayload.findByID).toHaveBeenNthCalledWith(1, {
        collection: "import-jobs",
        id: "import-123",
      });
      expect(mockPayload.findByID).toHaveBeenNthCalledWith(2, {
        collection: "datasets",
        id: "dataset-456",
      });

      // Verify schema version creation
      expect(mocks.createSchemaVersion).toHaveBeenCalledWith(mockPayload, {
        dataset: "dataset-456",
        schema: mockImportJob.schema,
        fieldMetadata: mockFieldStats,
        autoApproved: false,
        approvedBy: "user-789",
        importSources: [],
      });

      // Verify job updates
      expect(mockPayload.update).toHaveBeenCalledTimes(2);
      expect(mockPayload.update).toHaveBeenNthCalledWith(1, {
        collection: "import-jobs",
        id: "import-123",
        data: {
          datasetSchemaVersion: "schema-version-101",
        },
      });
      expect(mockPayload.update).toHaveBeenNthCalledWith(2, {
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "geocode-batch",
        },
      });
    });

    it("should skip when schema version already exists", async () => {
      // Mock import job with existing schema version
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        datasetSchemaVersion: "existing-schema-version-123",
        schemaValidation: {
          approved: true,
          approvedBy: "user-789",
        },
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob);

      // Execute job
      const result = await createSchemaVersionJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          skipped: true,
        },
      });

      // Verify no schema version creation was attempted
      expect(mocks.createSchemaVersion).not.toHaveBeenCalled();
      expect(mockPayload.update).not.toHaveBeenCalled();
    });

    it("should skip when schema is not approved", async () => {
      // Mock import job without approval
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        schemaValidation: {
          approved: false,
        },
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob);

      // Execute job
      const result = await createSchemaVersionJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          skipped: true,
        },
      });

      // Verify no schema version creation was attempted
      expect(mocks.createSchemaVersion).not.toHaveBeenCalled();
    });

    it("should handle dataset as object reference", async () => {
      // Mock import job with dataset as object
      const mockDataset = {
        id: "dataset-456",
        name: "Test Dataset",
      };

      const mockImportJob = {
        id: "import-123",
        dataset: mockDataset, // Dataset as object instead of ID
        schemaValidation: {
          approved: true,
          approvedBy: "user-789",
        },
        schema: {
          title: { type: "string" },
        },
      };

      const mockSchemaVersion = {
        id: "schema-version-101",
        dataset: "dataset-456",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob);
      mockPayload.update.mockResolvedValue({});
      mocks.getFieldStats.mockReturnValue({});
      mocks.createSchemaVersion.mockResolvedValue(mockSchemaVersion);

      // Execute job
      const result = await createSchemaVersionJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          schemaVersionId: "schema-version-101",
        },
      });

      // Verify only one findByID call (no separate dataset fetch needed)
      expect(mockPayload.findByID).toHaveBeenCalledTimes(1);
    });

    it("should handle approvedBy as object reference", async () => {
      // Mock import job with approvedBy as object
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        schemaValidation: {
          approved: true,
          approvedBy: {
            id: "user-789",
            name: "Test User",
          },
        },
        schema: {
          title: { type: "string" },
        },
      };

      const mockDataset = {
        id: "dataset-456",
        name: "Test Dataset",
      };

      const mockSchemaVersion = {
        id: "schema-version-101",
        dataset: "dataset-456",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(mockDataset);
      mockPayload.update.mockResolvedValue({});
      mocks.getFieldStats.mockReturnValue({});
      mocks.createSchemaVersion.mockResolvedValue(mockSchemaVersion);

      // Execute job
      await createSchemaVersionJob.handler(mockContext);

      // Verify schema version creation with correct approvedBy ID
      expect(mocks.createSchemaVersion).toHaveBeenCalledWith(mockPayload, {
        dataset: "dataset-456",
        schema: mockImportJob.schema,
        fieldMetadata: {},
        autoApproved: false,
        approvedBy: "user-789", // Should extract ID from object
        importSources: [],
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw error when import job not found", async () => {
      mockPayload.findByID.mockResolvedValueOnce(null);

      await expect(createSchemaVersionJob.handler(mockContext)).rejects.toThrow("Import job not found: import-123");

      expect(mockPayload.findByID).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
      });
    });

    it("should throw error when dataset not found", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        schemaValidation: {
          approved: true,
        },
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(null); // Dataset not found

      await expect(createSchemaVersionJob.handler(mockContext)).rejects.toThrow("Dataset not found");
    });

    it("should handle schema version creation error and update job to failed", async () => {
      const mockImportJob = {
        id: "import-123",
        dataset: "dataset-456",
        schemaValidation: {
          approved: true,
          approvedBy: "user-789",
        },
        schema: {
          title: { type: "string" },
        },
      };

      const mockDataset = {
        id: "dataset-456",
        name: "Test Dataset",
      };

      const mockError = new Error("Schema version creation failed");

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(mockDataset);
      mockPayload.update.mockResolvedValue({});
      mocks.getFieldStats.mockReturnValue({});
      mocks.createSchemaVersion.mockRejectedValue(mockError);

      // Execute job and expect error
      await expect(createSchemaVersionJob.handler(mockContext)).rejects.toThrow("Schema version creation failed");

      // Verify job was updated to failed state
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: "import-123",
        data: {
          stage: "failed",
          errorLog: {
            error: "Schema version creation failed",
            context: "schema version creation",
            timestamp: expect.any(String),
          },
        },
      });
    });
  });

  describe("Job Configuration", () => {
    it("should have correct job slug", () => {
      expect(createSchemaVersionJob.slug).toBe("create-schema-version");
    });
  });
});
