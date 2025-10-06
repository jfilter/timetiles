/**
 * Unit tests for the validate schema job handler.
 *
 * Tests schema validation and comparison during import processing,
 * including breaking change detection and approval workflows.
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateSchemaJob } from "@/lib/jobs/handlers/validate-schema-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    readBatchFromFile: vi.fn(),
    ProgressiveSchemaBuilder: vi.fn(),
    createSchemaVersion: vi.fn(),
    linkImportToSchemaVersion: vi.fn(),
    getSchemaBuilderState: vi.fn(),
  };
});

// Mock external dependencies
vi.mock("@/lib/logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  createJobLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  logError: vi.fn(),
  logPerformance: vi.fn(),
}));

vi.mock("@/lib/utils/file-readers", () => ({
  readBatchFromFile: mocks.readBatchFromFile,
}));

vi.mock("@/lib/services/schema-builder", () => ({
  ProgressiveSchemaBuilder: mocks.ProgressiveSchemaBuilder,
}));

vi.mock("@/lib/services/schema-versioning", () => ({
  SchemaVersioningService: {
    createSchemaVersion: mocks.createSchemaVersion,
    linkImportToSchemaVersion: mocks.linkImportToSchemaVersion,
  },
}));

vi.mock("@/lib/types/schema-detection", () => ({
  getSchemaBuilderState: mocks.getSchemaBuilderState,
}));

vi.mock("path", () => ({
  default: {
    resolve: vi.fn(() => "/mock/import-files"),
    join: vi.fn((dir, filename) => `${dir}/${filename}`),
  },
}));

describe.sequential("ValidateSchemaJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;
  let mockSchemaBuilderInstance: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock payload with required methods
    mockPayload = {
      findByID: vi.fn(),
      find: vi.fn(),
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
        importJobId: "123",
      } as any,
    };

    // Mock schema builder instance
    mockSchemaBuilderInstance = {
      processBatch: vi.fn(),
      getSchema: vi.fn(),
      getState: vi.fn(),
    };

    // Setup ProgressiveSchemaBuilder mock
    mocks.ProgressiveSchemaBuilder.mockImplementation(() => mockSchemaBuilderInstance);
  });

  describe("Success Cases", () => {
    it("should auto-approve schema with only non-breaking changes", async () => {
      // Mock import job
      const mockImportJob = {
        id: 123,
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: [],
          external: [],
        },
        progress: {
          total: 100,
        },
      };

      // Mock dataset with auto-approve configuration
      const mockDataset = {
        id: "dataset-456",
        schemaConfig: {
          autoGrow: true,
          autoApproveNonBreaking: true,
          locked: false,
        },
      };

      // Mock import file
      const mockImportFile = {
        id: "file-789",
        filename: "test.csv",
      };

      // Mock file data
      const mockFileData = [
        { id: "1", title: "Event 1", newField: "optional" },
        { id: "2", title: "Event 2", newField: "optional" },
      ];

      // Mock detected schema with new optional field
      const mockDetectedSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          newField: { type: "string" },
        },
        required: ["id", "title"],
      };

      // Mock current schema without the new field
      const mockCurrentSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
        },
        required: ["id", "title"],
      };

      // Mock schema builder state
      const mockSchemaBuilderState = {
        fieldStats: {
          id: { occurrences: 100, uniqueValues: 100 },
          title: { occurrences: 100, uniqueValues: 95 },
          newField: { occurrences: 100, uniqueValues: 30 },
        },
        recordCount: 100,
      };

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Mock current schema lookup
      mockPayload.find.mockResolvedValueOnce({
        docs: [{ schema: mockCurrentSchema }],
      });

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData).mockReturnValueOnce([]); // End of file

      mocks.getSchemaBuilderState.mockReturnValueOnce(null);

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockDetectedSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockSchemaBuilderState);

      mocks.createSchemaVersion.mockResolvedValueOnce({ id: "version-123" });
      mocks.linkImportToSchemaVersion.mockResolvedValueOnce(undefined);

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await validateSchemaJob.handler(mockContext);

      // Verify result
      expect(result).toEqual({
        output: {
          requiresApproval: false,
          hasBreakingChanges: false,
          newFields: 1,
        },
      });

      // Verify schema version was created (auto-approved)
      expect(mocks.createSchemaVersion).toHaveBeenCalledWith(mockPayload, {
        dataset: "dataset-456",
        schema: mockDetectedSchema,
        fieldMetadata: mockSchemaBuilderState.fieldStats,
        autoApproved: true,
        approvedBy: null, // No user for auto-approval
        importSources: [],
      });

      // Verify job was updated to proceed to geocoding
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: {
          schema: mockDetectedSchema,
          schemaValidation: {
            isCompatible: true,
            breakingChanges: [],
            newFields: [
              {
                field: "newField",
                type: "string",
                optional: true,
              },
            ],
            requiresApproval: false,
            approvalReason: "Manual approval required by dataset configuration",
          },
          stage: "geocode-batch",
        },
      });
    });

    it("should require approval for breaking changes", async () => {
      // Mock import job
      const mockImportJob = {
        id: 123,
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: [],
          external: [],
        },
        progress: {
          total: 100,
        },
      };

      // Mock dataset without auto-approval for breaking changes
      const mockDataset = {
        id: "dataset-456",
        schemaConfig: {
          autoGrow: false,
          autoApproveNonBreaking: false,
          locked: false,
        },
      };

      // Mock import file
      const mockImportFile = {
        id: "file-789",
        filename: "test.csv",
      };

      // Mock file data
      const mockFileData = [
        { id: 123, title: "Event 1" }, // id is now number instead of string
        { id: 456, title: "Event 2" },
      ];

      // Mock detected schema with breaking change (id: number)
      const mockDetectedSchema = {
        type: "object",
        properties: {
          id: { type: "number" }, // Breaking change from string
          title: { type: "string" },
        },
        required: ["id", "title"],
      };

      // Mock current schema with id as string
      const mockCurrentSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
        },
        required: ["id", "title"],
      };

      // Mock schema builder state
      const mockSchemaBuilderState = {
        fieldStats: {
          id: { occurrences: 100, uniqueValues: 100 },
          title: { occurrences: 100, uniqueValues: 95 },
        },
        recordCount: 100,
      };

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Mock current schema lookup
      mockPayload.find.mockResolvedValueOnce({
        docs: [{ schema: mockCurrentSchema }],
      });

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData).mockReturnValueOnce([]); // End of file

      mocks.getSchemaBuilderState.mockReturnValueOnce(null);

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockDetectedSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockSchemaBuilderState);

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await validateSchemaJob.handler(mockContext);

      // Verify result requires approval due to breaking changes
      expect(result).toEqual({
        output: {
          requiresApproval: true,
          hasBreakingChanges: true,
          newFields: 0,
        },
      });

      // Verify no schema version was created (needs approval)
      expect(mocks.createSchemaVersion).not.toHaveBeenCalled();

      // Verify job was updated to await approval
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: {
          schema: mockDetectedSchema,
          schemaValidation: {
            isCompatible: false,
            breakingChanges: [
              {
                field: "id",
                change: "type_change",
                from: "string",
                to: "number",
              },
            ],
            newFields: [],
            requiresApproval: true,
            approvalReason: "Breaking schema changes detected",
          },
          stage: "await-approval",
        },
      });
    });

    it("should handle locked schema configuration", async () => {
      // Mock import job
      const mockImportJob = {
        id: 123,
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: [],
          external: [],
        },
        progress: {
          total: 100,
        },
      };

      // Mock dataset with locked schema
      const mockDataset = {
        id: "dataset-456",
        schemaConfig: {
          autoGrow: true,
          autoApproveNonBreaking: true,
          locked: true, // Schema is locked
        },
      };

      // Mock import file
      const mockImportFile = {
        id: "file-789",
        filename: "test.csv",
      };

      // Mock file data with new field
      const mockFileData = [
        { id: "1", title: "Event 1", newField: "value" },
        { id: "2", title: "Event 2", newField: "value" },
      ];

      // Mock detected schema with new field
      const mockDetectedSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          newField: { type: "string" },
        },
        required: ["id", "title"],
      };

      // Mock current schema without the new field
      const mockCurrentSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
        },
        required: ["id", "title"],
      };

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Mock current schema lookup
      mockPayload.find.mockResolvedValueOnce({
        docs: [{ schema: mockCurrentSchema }],
      });

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData).mockReturnValueOnce([]); // End of file

      mocks.getSchemaBuilderState.mockReturnValueOnce(null);

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockDetectedSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce({
        fieldStats: {},
        recordCount: 100,
      });

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await validateSchemaJob.handler(mockContext);

      // Verify result requires approval due to locked schema
      expect(result).toEqual({
        output: {
          requiresApproval: true,
          hasBreakingChanges: false,
          newFields: 1,
        },
      });

      // Verify job was updated to await approval
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: {
          schema: mockDetectedSchema,
          schemaValidation: {
            isCompatible: true,
            breakingChanges: [],
            newFields: [
              {
                field: "newField",
                type: "string",
                optional: true,
              },
            ],
            requiresApproval: true,
            approvalReason: "Manual approval required by dataset configuration",
          },
          stage: "await-approval",
        },
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw error when import job not found", async () => {
      mockPayload.findByID.mockResolvedValueOnce(null);

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("Import job not found: 123");
    });

    it("should throw error when dataset not found", async () => {
      const mockImportJob = {
        id: 123,
        dataset: "dataset-456",
      };

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(null); // Dataset not found

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("Dataset not found");
    });

    it("should throw error when import file not found", async () => {
      const mockImportJob = {
        id: 123,
        dataset: "dataset-456",
        importFile: "file-789",
      };

      const mockDataset = {
        id: "dataset-456",
        schemaConfig: {},
      };

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(null); // Import file not found

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("Import file not found");
    });

    it("should handle file reading errors", async () => {
      const mockImportJob = {
        id: 123,
        dataset: "dataset-456",
        importFile: "file-789",
      };

      const mockDataset = {
        id: "dataset-456",
        schemaConfig: {},
      };

      const mockImportFile = {
        id: "file-789",
        filename: "test.csv",
      };

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      mocks.getSchemaBuilderState.mockReturnValueOnce(null);
      mocks.readBatchFromFile.mockImplementation(() => {
        throw new Error("File not found");
      });

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("File not found");

      // Verify error handling updated job status
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: {
          stage: "failed",
          errors: [
            {
              row: 0,
              error: "File not found",
            },
          ],
        },
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle no schema changes", async () => {
      // Mock import job
      const mockImportJob = {
        id: 123,
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: [],
          external: [],
        },
        progress: {
          total: 100,
        },
      };

      // Mock dataset
      const mockDataset = {
        id: "dataset-456",
        schemaConfig: {
          autoGrow: true,
          autoApproveNonBreaking: true,
          locked: false,
        },
      };

      // Mock import file
      const mockImportFile = {
        id: "file-789",
        filename: "test.csv",
      };

      // Mock file data
      const mockFileData = [
        { id: "1", title: "Event 1" },
        { id: "2", title: "Event 2" },
      ];

      // Mock detected schema (same as current)
      const mockSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
        },
        required: ["id", "title"],
      };

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Mock current schema lookup (same as detected)
      mockPayload.find.mockResolvedValueOnce({
        docs: [{ schema: mockSchema }],
      });

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData).mockReturnValueOnce([]); // End of file

      mocks.getSchemaBuilderState.mockReturnValueOnce(null);

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce({
        fieldStats: {},
        recordCount: 100,
      });

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await validateSchemaJob.handler(mockContext);

      // Verify result - no approval needed, no changes
      expect(result).toEqual({
        output: {
          requiresApproval: false,
          hasBreakingChanges: false,
          newFields: 0,
        },
      });

      // Verify no schema version was created (no changes)
      expect(mocks.createSchemaVersion).not.toHaveBeenCalled();

      // Verify job was updated to proceed to geocoding
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: {
          schema: mockSchema,
          schemaValidation: {
            isCompatible: true,
            breakingChanges: [],
            newFields: [],
            requiresApproval: false,
            approvalReason: "Manual approval required by dataset configuration",
          },
          stage: "geocode-batch",
        },
      });
    });

    it("should skip duplicate rows during schema validation", async () => {
      // Mock import job with duplicates
      const mockImportJob = {
        id: 123,
        dataset: "dataset-456",
        importFile: "file-789",
        sheetIndex: 0,
        duplicates: {
          internal: [{ rowNumber: 1 }],
          external: [{ rowNumber: 2 }],
        },
        progress: {
          total: 100,
        },
      };

      // Mock dataset
      const mockDataset = {
        id: "dataset-456",
        schemaConfig: {
          autoGrow: true,
          autoApproveNonBreaking: true,
          locked: false,
        },
      };

      // Mock import file
      const mockImportFile = {
        id: "file-789",
        filename: "test.csv",
      };

      // Mock file data (3 rows, but 2 are duplicates)
      const mockFileData = [
        { id: "1", title: "Event 1" }, // Will be processed
        { id: "2", title: "Event 2" }, // Internal duplicate - skip
        { id: "3", title: "Event 3" }, // External duplicate - skip
      ];

      // Mock schema
      const mockSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
        },
        required: ["id", "title"],
      };

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      mockPayload.find.mockResolvedValueOnce({
        docs: [{ schema: mockSchema }],
      });

      mocks.readBatchFromFile.mockReturnValueOnce(mockFileData).mockReturnValueOnce([]); // End of file

      mocks.getSchemaBuilderState.mockReturnValueOnce(null);

      mockSchemaBuilderInstance.processBatch.mockResolvedValueOnce(undefined);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce({
        fieldStats: {},
        recordCount: 1, // Only 1 non-duplicate row processed
      });

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      await validateSchemaJob.handler(mockContext);

      // Verify schema builder was called with filtered non-duplicate rows
      expect(mockSchemaBuilderInstance.processBatch).toHaveBeenCalledWith(
        [{ id: "1", title: "Event 1" }] // Only non-duplicate row
      );
    });
  });
});
