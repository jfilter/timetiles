/**
 * Unit tests for the validate schema job handler.
 *
 * Tests schema validation and comparison during import processing,
 * including breaking change detection and approval workflows.
 *
 * @module
 * @category Tests
 */
// Import centralized mocks FIRST (before anything that uses them)
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateSchemaJob } from "@/lib/jobs/handlers/validate-schema-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import type { ImportJob } from "@/payload-types";
import {
  createMockContext,
  createMockDataset,
  createMockImportFile,
  createMockImportJob,
  createMockPayload,
} from "@/tests/setup/factories";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    readBatchFromFile: vi.fn(),
    ProgressiveSchemaBuilder: vi.fn(),
    createSchemaVersion: vi.fn(),
    linkImportToSchemaVersion: vi.fn(),
    getSchemaBuilderState: vi.fn(),
    startStage: vi.fn(),
    completeStage: vi.fn(),
  };
});

// Mock external dependencies
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

vi.mock("@/lib/services/progress-tracking", () => ({
  ProgressTrackingService: {
    startStage: mocks.startStage,
    completeStage: mocks.completeStage,
  },
}));

vi.mock("@/lib/types/schema-detection", () => ({
  getSchemaBuilderState: mocks.getSchemaBuilderState,
}));

describe.sequential("ValidateSchemaJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;
  let mockSchemaBuilderInstance: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create standard mock payload and context using factories
    mockPayload = createMockPayload();
    mockContext = createMockContext(mockPayload, {
      importJobId: "123",
    });

    // Mock schema builder instance (job-specific)
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
      // Create mock data using factories
      const mockImportJob = createMockImportJob({
        id: 123,
        progress: { total: 100 },
      });
      const mockDataset = createMockDataset();
      const mockImportFile = createMockImportFile();

      // Mock file data

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

      // Mock schema builder state (cached from schema detection stage)
      const mockSchemaBuilderState = {
        fieldStats: {
          id: { occurrences: 100, uniqueValues: 100 },
          title: { occurrences: 100, uniqueValues: 95 },
          newField: { occurrences: 100, uniqueValues: 30 },
        },
        recordCount: 100,
      };

      // Add schema builder state to import job
      (mockImportJob as unknown as ImportJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Mock current schema lookup
      mockPayload.find.mockResolvedValueOnce({
        docs: [{ schema: mockCurrentSchema }],
      });

      // Mock getSchemaBuilderState to return cached state (no file reading needed)
      mocks.getSchemaBuilderState.mockReturnValueOnce(mockSchemaBuilderState);

      // Mock schema generation from cached state (no batch processing needed)
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
            transformSuggestions: [],
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

      // Mock schema builder state (cached from schema detection stage)
      const mockSchemaBuilderState = {
        fieldStats: {
          id: { occurrences: 100, uniqueValues: 100 },
          title: { occurrences: 100, uniqueValues: 95 },
        },
        recordCount: 100,
      };

      // Add schema builder state to import job
      (mockImportJob as unknown as ImportJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Mock current schema lookup
      mockPayload.find.mockResolvedValueOnce({
        docs: [{ schema: mockCurrentSchema }],
      });

      // Mock getSchemaBuilderState to return cached state (no file reading needed)
      mocks.getSchemaBuilderState.mockReturnValueOnce(mockSchemaBuilderState);

      // Mock schema generation from cached state (no batch processing needed)
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
                description: "Field 'id' type changed from string to number",
                oldType: "string",
                newType: "number",
              },
            ],
            newFields: [],
            requiresApproval: true,
            approvalReason: "Breaking schema changes detected",
            transformSuggestions: [],
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

      // Mock schema builder state (cached from schema detection stage)
      const mockSchemaBuilderState = {
        fieldStats: {},
        recordCount: 100,
      };

      // Add schema builder state to import job
      (mockImportJob as unknown as ImportJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Mock current schema lookup
      mockPayload.find.mockResolvedValueOnce({
        docs: [{ schema: mockCurrentSchema }],
      });

      // Mock getSchemaBuilderState to return cached state (no file reading needed)
      mocks.getSchemaBuilderState.mockReturnValueOnce(mockSchemaBuilderState);

      // Mock schema generation from cached state (no batch processing needed)
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockDetectedSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockSchemaBuilderState);

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
            transformSuggestions: [],
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

    it("should throw error when schema builder state is missing", async () => {
      const mockImportJob = {
        id: 123,
        dataset: "dataset-456",
        importFile: "file-789",
        // No schemaBuilderState - this should cause an error
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

      // Mock getSchemaBuilderState to return null (missing state)
      mocks.getSchemaBuilderState.mockReturnValueOnce(null);

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow(
        "Schema builder state not found. Schema detection stage must run first."
      );

      // Verify error handling updated job status
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: {
          stage: "failed",
          errors: [
            {
              row: 0,
              error: "Schema builder state not found. Schema detection stage must run first.",
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

      // Mock detected schema (same as current)
      const mockSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
        },
        required: ["id", "title"],
      };

      // Mock schema builder state (cached from schema detection stage)
      const mockSchemaBuilderState = {
        fieldStats: {},
        recordCount: 100,
      };

      // Add schema builder state to import job
      (mockImportJob as unknown as ImportJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Mock current schema lookup (same as detected)
      mockPayload.find.mockResolvedValueOnce({
        docs: [{ schema: mockSchema }],
      });

      // Mock getSchemaBuilderState to return cached state (no file reading needed)
      mocks.getSchemaBuilderState.mockReturnValueOnce(mockSchemaBuilderState);

      // Mock schema generation from cached state (no batch processing needed)
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockSchemaBuilderState);

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
            transformSuggestions: [],
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

      // Mock schema
      const mockSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
        },
        required: ["id", "title"],
      };

      // Mock schema builder state (cached from schema detection stage)
      const mockSchemaBuilderState = {
        fieldStats: {},
        recordCount: 1, // Only 1 non-duplicate row processed
      };

      // Add schema builder state to import job
      (mockImportJob as unknown as ImportJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      mockPayload.find.mockResolvedValueOnce({
        docs: [{ schema: mockSchema }],
      });

      // Mock getSchemaBuilderState to return cached state (no file reading needed)
      mocks.getSchemaBuilderState.mockReturnValueOnce(mockSchemaBuilderState);

      // Mock schema generation from cached state (no batch processing needed)
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockSchemaBuilderState);

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      await validateSchemaJob.handler(mockContext);

      // Verify schema builder was created with cached state (no batch processing)
      // The duplicate filtering happened during schema detection stage, not here
      expect(mockSchemaBuilderInstance.processBatch).not.toHaveBeenCalled();
    });
  });
});
