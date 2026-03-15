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
    cleanupSidecarFiles: vi.fn(),
    ProgressiveSchemaBuilder: vi.fn(),
    createSchemaVersion: vi.fn(),
    linkImportToSchemaVersion: vi.fn(),
    getSchemaBuilderState: vi.fn(),
    startStage: vi.fn(),
    completeStage: vi.fn(),
    checkQuota: vi.fn(),
  };
});

// Mock external dependencies
vi.mock("@/lib/utils/file-readers", () => ({ cleanupSidecarFiles: mocks.cleanupSidecarFiles }));

vi.mock("@/lib/jobs/utils/upload-path", () => ({
  getImportFilePath: vi.fn((filename: string) => `/mock/import-files/${filename}`),
}));

vi.mock("@/lib/services/schema-builder", () => ({ ProgressiveSchemaBuilder: mocks.ProgressiveSchemaBuilder }));

vi.mock("@/lib/services/schema-versioning", () => ({
  SchemaVersioningService: {
    createSchemaVersion: mocks.createSchemaVersion,
    linkImportToSchemaVersion: mocks.linkImportToSchemaVersion,
  },
}));

vi.mock("@/lib/services/progress-tracking", () => ({
  ProgressTrackingService: { startStage: mocks.startStage, completeStage: mocks.completeStage },
}));

vi.mock("@/lib/types/schema-detection", () => ({ getSchemaBuilderState: mocks.getSchemaBuilderState }));

vi.mock("@/lib/services/quota-service", () => ({ getQuotaService: () => ({ checkQuota: mocks.checkQuota }) }));

describe.sequential("ValidateSchemaJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;
  let mockSchemaBuilderInstance: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create standard mock payload and context using factories
    mockPayload = createMockPayload();
    mockContext = createMockContext(mockPayload, { importJobId: "123" });

    // Mock schema builder instance (job-specific)
    mockSchemaBuilderInstance = { processBatch: vi.fn(), getSchema: vi.fn(), getState: vi.fn() };

    // Setup ProgressiveSchemaBuilder mock
    // eslint-disable-next-line prefer-arrow-functions/prefer-arrow-functions -- regular function required: arrow functions cannot be constructors (vitest 4)
    mocks.ProgressiveSchemaBuilder.mockImplementation(function () {
      return mockSchemaBuilderInstance;
    });

    // Default quota check: allowed
    mocks.checkQuota.mockResolvedValue({ allowed: true, current: 0, limit: 100, remaining: 100 });
  });

  describe("Success Cases", () => {
    it("should reject partially numeric import job ids before loading resources", async () => {
      mockContext = createMockContext(mockPayload, { importJobId: "123abc" });

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("Invalid import job ID");

      expect(mockPayload.findByID).not.toHaveBeenCalled();
      expect(mockPayload.update).not.toHaveBeenCalled();
    });

    it("should auto-approve schema with only non-breaking changes", async () => {
      // Create mock data using factories
      const mockImportJob = createMockImportJob({ id: 123, progress: { total: 100 } });
      const mockDataset = createMockDataset();
      const mockImportFile = createMockImportFile();

      // Mock file data

      // Mock detected schema with new optional field
      const mockDetectedSchema = {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" }, newField: { type: "string" } },
        required: ["id", "title"],
      };

      // Mock current schema without the new field
      const mockCurrentSchema = {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" } },
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
      mockPayload.find.mockResolvedValueOnce({ docs: [{ schema: mockCurrentSchema }] });

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
      expect(result).toEqual({ output: { requiresApproval: false, hasBreakingChanges: false, newFields: 1 } });

      // Schema version creation now happens in CREATE_SCHEMA_VERSION stage, not inline
      // So we should NOT expect createSchemaVersion to be called here
      expect(mocks.createSchemaVersion).not.toHaveBeenCalled();

      // Verify job was updated to proceed to CREATE_SCHEMA_VERSION (for auto-approved changes)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: {
          schema: mockDetectedSchema,
          schemaValidation: {
            isCompatible: true,
            breakingChanges: [],
            newFields: [{ field: "newField", type: "string", optional: true }],
            requiresApproval: false,
            approvalReason: "Manual approval required by dataset configuration",
            transformSuggestions: [],
          },
          stage: "create-schema-version", // Changed from geocode-batch
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
        duplicates: { internal: [], external: [] },
        progress: { total: 100 },
      };

      // Mock dataset without auto-approval for breaking changes
      const mockDataset = {
        id: "dataset-456",
        schemaConfig: { autoGrow: false, autoApproveNonBreaking: false, locked: false },
      };

      // Mock import file
      const mockImportFile = { id: "file-789", filename: "test.csv" };

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
        properties: { id: { type: "string" }, title: { type: "string" } },
        required: ["id", "title"],
      };

      // Mock schema builder state (cached from schema detection stage)
      const mockSchemaBuilderState = {
        fieldStats: { id: { occurrences: 100, uniqueValues: 100 }, title: { occurrences: 100, uniqueValues: 95 } },
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
      mockPayload.find.mockResolvedValueOnce({ docs: [{ schema: mockCurrentSchema }] });

      // Mock getSchemaBuilderState to return cached state (no file reading needed)
      mocks.getSchemaBuilderState.mockReturnValueOnce(mockSchemaBuilderState);

      // Mock schema generation from cached state (no batch processing needed)
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockDetectedSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockSchemaBuilderState);

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await validateSchemaJob.handler(mockContext);

      // Verify result requires approval due to breaking changes
      expect(result).toEqual({ output: { requiresApproval: true, hasBreakingChanges: true, newFields: 0 } });

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
        duplicates: { internal: [], external: [] },
        progress: { total: 100 },
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
      const mockImportFile = { id: "file-789", filename: "test.csv" };

      // Mock detected schema with new field
      const mockDetectedSchema = {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" }, newField: { type: "string" } },
        required: ["id", "title"],
      };

      // Mock current schema without the new field
      const mockCurrentSchema = {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" } },
        required: ["id", "title"],
      };

      // Mock schema builder state (cached from schema detection stage)
      const mockSchemaBuilderState = { fieldStats: {}, recordCount: 100 };

      // Add schema builder state to import job
      (mockImportJob as unknown as ImportJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Mock current schema lookup
      mockPayload.find.mockResolvedValueOnce({ docs: [{ schema: mockCurrentSchema }] });

      // Mock getSchemaBuilderState to return cached state (no file reading needed)
      mocks.getSchemaBuilderState.mockReturnValueOnce(mockSchemaBuilderState);

      // Mock schema generation from cached state (no batch processing needed)
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockDetectedSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockSchemaBuilderState);

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await validateSchemaJob.handler(mockContext);

      // Verify result requires approval due to locked schema
      expect(result).toEqual({ output: { requiresApproval: true, hasBreakingChanges: false, newFields: 1 } });

      // Verify job was updated to await approval
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: {
          schema: mockDetectedSchema,
          schemaValidation: {
            isCompatible: true,
            breakingChanges: [],
            newFields: [{ field: "newField", type: "string", optional: true }],
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
      const mockImportJob = { id: 123, dataset: "dataset-456" };

      mockPayload.findByID.mockResolvedValueOnce(mockImportJob).mockResolvedValueOnce(null); // Dataset not found

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("Dataset not found");
    });

    it("should throw error when import file not found", async () => {
      const mockImportJob = { id: 123, dataset: "dataset-456", importFile: "file-789" };

      const mockDataset = { id: "dataset-456", schemaConfig: {} };

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

      const mockDataset = { id: "dataset-456", schemaConfig: {} };

      const mockImportFile = { id: "file-789", filename: "test.csv" };

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
          errors: [{ row: 0, error: "Schema builder state not found. Schema detection stage must run first." }],
        },
      });
    });

    it("should clean up sidecar files on error", async () => {
      const mockImportJob = createMockImportJob({ id: 123, sheetIndex: 2 });
      const mockDataset = createMockDataset();
      const mockImportFile = createMockImportFile("file-789", "test.xlsx");

      // First loadJobResources call (in try block) — returns resources successfully
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Make getSchemaBuilderState throw to trigger the catch block
      mocks.getSchemaBuilderState.mockImplementationOnce(() => {
        throw new Error("Schema builder exploded");
      });

      // Second loadJobResources call (in catch block for cleanup)
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      mockPayload.update.mockResolvedValueOnce({});

      // Verify the handler still throws the original error
      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("Schema builder exploded");

      // Verify sidecar cleanup was called with the file path and sheetIndex
      expect(mocks.cleanupSidecarFiles).toHaveBeenCalledWith("/mock/import-files/test.xlsx", 2);

      // Verify the job was updated to FAILED stage
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: { stage: "failed", errors: [{ row: 0, error: "Schema builder exploded" }] },
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
        duplicates: { internal: [], external: [] },
        progress: { total: 100 },
      };

      // Mock dataset
      const mockDataset = {
        id: "dataset-456",
        schemaConfig: { autoGrow: true, autoApproveNonBreaking: true, locked: false },
      };

      // Mock import file
      const mockImportFile = { id: "file-789", filename: "test.csv" };

      // Mock file data

      // Mock detected schema (same as current)
      const mockSchema = {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" } },
        required: ["id", "title"],
      };

      // Mock schema builder state (cached from schema detection stage)
      const mockSchemaBuilderState = { fieldStats: {}, recordCount: 100 };

      // Add schema builder state to import job
      (mockImportJob as unknown as ImportJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // Mock current schema lookup (same as detected)
      mockPayload.find.mockResolvedValueOnce({ docs: [{ schema: mockSchema }] });

      // Mock getSchemaBuilderState to return cached state (no file reading needed)
      mocks.getSchemaBuilderState.mockReturnValueOnce(mockSchemaBuilderState);

      // Mock schema generation from cached state (no batch processing needed)
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockSchemaBuilderState);

      mockPayload.update.mockResolvedValueOnce({});

      // Execute job
      const result = await validateSchemaJob.handler(mockContext);

      // Verify result - no approval needed, no changes
      expect(result).toEqual({ output: { requiresApproval: false, hasBreakingChanges: false, newFields: 0 } });

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
        duplicates: { internal: [{ rowNumber: 1 }], external: [{ rowNumber: 2 }] },
        progress: { total: 100 },
      };

      // Mock dataset
      const mockDataset = {
        id: "dataset-456",
        schemaConfig: { autoGrow: true, autoApproveNonBreaking: true, locked: false },
      };

      // Mock import file
      const mockImportFile = { id: "file-789", filename: "test.csv" };

      // Mock schema
      const mockSchema = {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" } },
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

      mockPayload.find.mockResolvedValueOnce({ docs: [{ schema: mockSchema }] });

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

  describe("Schema Mode Validation", () => {
    /**
     * Helper to set up a standard test scenario with a given schema mode and schema pair.
     * Returns the mock objects for further assertion.
     */
    const setupSchemaModeTest = (options: {
      schemaMode: string;
      detectedSchema: Record<string, unknown>;
      currentSchema: Record<string, unknown>;
      userId?: number;
    }) => {
      const mockSchemaBuilderState = { fieldStats: {}, recordCount: 100 };

      const mockImportJob = createMockImportJob({ id: 123 });
      (mockImportJob as unknown as ImportJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      const mockDataset = createMockDataset();
      const mockImportFile = createMockImportFile();

      // Add processingOptions with schemaMode and optionally a user
      (mockImportFile as any).processingOptions = { schemaMode: options.schemaMode };
      if (options.userId) {
        (mockImportFile as any).user = { id: options.userId, email: "test@example.com", role: "user" };
      }

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      mockPayload.find.mockResolvedValueOnce({ docs: [{ schema: options.currentSchema }] });

      mocks.getSchemaBuilderState.mockReturnValueOnce(mockSchemaBuilderState);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(options.detectedSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockSchemaBuilderState);
      mockPayload.update.mockResolvedValue({});

      return { mockImportJob, mockDataset, mockImportFile };
    };

    it("should fail import in strict mode when schema has changes", async () => {
      const currentSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
      const detectedSchema = {
        type: "object",
        properties: { id: { type: "string" }, newField: { type: "string" } },
        required: ["id"],
      };

      setupSchemaModeTest({ schemaMode: "strict", detectedSchema, currentSchema });

      const result = await validateSchemaJob.handler(mockContext);

      expect(result).toEqual({
        output: {
          requiresApproval: false,
          hasBreakingChanges: false,
          newFields: 1,
          failed: true,
          failureReason: "Schema mismatch in strict mode: 1 change(s) detected",
        },
      });

      // Verify job was updated to FAILED stage
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "import-jobs",
          id: 123,
          data: expect.objectContaining({ stage: "failed" }),
        })
      );
    });

    it("should fail import in additive mode when schema has breaking changes", async () => {
      const currentSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
      const detectedSchema = { type: "object", properties: { id: { type: "number" } }, required: ["id"] };

      setupSchemaModeTest({ schemaMode: "additive", detectedSchema, currentSchema });

      const result = await validateSchemaJob.handler(mockContext);

      expect(result).toEqual({
        output: {
          requiresApproval: false,
          hasBreakingChanges: true,
          newFields: 0,
          failed: true,
          failureReason: "Breaking schema changes not allowed in additive mode",
        },
      });

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stage: "failed",
            errors: [{ row: 0, error: "Breaking schema changes not allowed in additive mode" }],
          }),
        })
      );
    });

    it("should auto-approve non-breaking changes in additive mode without transforms", async () => {
      const currentSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
      const detectedSchema = {
        type: "object",
        properties: { id: { type: "string" }, newField: { type: "string" } },
        required: ["id"],
      };

      setupSchemaModeTest({ schemaMode: "additive", detectedSchema, currentSchema });

      const result = await validateSchemaJob.handler(mockContext);

      // additive mode with non-breaking changes and no high-confidence transforms: auto-approve
      // schemaMode is set so determineRequiresApproval returns false (bypasses dataset config)
      expect(result).toEqual({ output: { requiresApproval: false, hasBreakingChanges: false, newFields: 1 } });

      // Should proceed to create-schema-version since there are changes but no approval needed
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stage: "create-schema-version" }) })
      );
    });

    it("should fail import in flexible mode when schema has breaking changes", async () => {
      const currentSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
      const detectedSchema = { type: "object", properties: { id: { type: "number" } }, required: ["id"] };

      setupSchemaModeTest({ schemaMode: "flexible", detectedSchema, currentSchema });

      const result = await validateSchemaJob.handler(mockContext);

      expect(result).toEqual({
        output: {
          requiresApproval: false,
          hasBreakingChanges: true,
          newFields: 0,
          failed: true,
          failureReason: "Breaking schema changes detected",
        },
      });
    });

    it("should auto-approve non-breaking changes in flexible mode", async () => {
      const currentSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
      const detectedSchema = {
        type: "object",
        properties: { id: { type: "string" }, extra: { type: "number" } },
        required: ["id"],
      };

      setupSchemaModeTest({ schemaMode: "flexible", detectedSchema, currentSchema });

      const result = await validateSchemaJob.handler(mockContext);

      // flexible mode: non-breaking changes auto-approve, schemaMode bypasses dataset config
      expect(result).toEqual({ output: { requiresApproval: false, hasBreakingChanges: false, newFields: 1 } });

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stage: "create-schema-version" }) })
      );
    });

    it("should pass through with no failure for strict mode when no changes exist", async () => {
      const schema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };

      setupSchemaModeTest({ schemaMode: "strict", detectedSchema: schema, currentSchema: schema });

      const result = await validateSchemaJob.handler(mockContext);

      // No changes in strict mode: no failure, no approval, goes to geocode-batch
      expect(result).toEqual({ output: { requiresApproval: false, hasBreakingChanges: false, newFields: 0 } });

      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stage: "geocode-batch" }) })
      );
    });
  });

  describe("Schema lookup sort field", () => {
    it("should sort current schema query by -versionNumber not -version", async () => {
      const mockSchemaBuilderState = { fieldStats: {}, recordCount: 100 };
      const mockSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
      const mockImportJob = createMockImportJob({ id: 123 });
      (mockImportJob as unknown as ImportJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;
      const mockDataset = createMockDataset();
      const mockImportFile = createMockImportFile();
      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);
      mockPayload.find.mockResolvedValueOnce({ docs: [{ schema: mockSchema }] });
      mocks.getSchemaBuilderState.mockReturnValueOnce(mockSchemaBuilderState);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(mockSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockSchemaBuilderState);
      mockPayload.update.mockResolvedValueOnce({});
      await validateSchemaJob.handler(mockContext);
      expect(mockPayload.find).toHaveBeenCalledWith(
        expect.objectContaining({ collection: "dataset-schemas", sort: "-versionNumber", limit: 1 })
      );
    });
  });

  describe("Import Quota Validation", () => {
    it("should fail when events per import quota is exceeded", async () => {
      const mockSchemaBuilderState = { fieldStats: {}, recordCount: 100 };

      const mockImportJob = createMockImportJob({ id: 123 });
      (mockImportJob as unknown as ImportJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      const mockDataset = createMockDataset();
      const mockImportFile = createMockImportFile();
      // Attach a user object to the import file to trigger quota checking
      (mockImportFile as any).user = { id: 1, email: "test@example.com", role: "user" };

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // First checkQuota call (EVENTS_PER_IMPORT) returns not allowed
      mocks.checkQuota.mockResolvedValueOnce({ allowed: false, current: 0, limit: 50, remaining: 0 });

      mockPayload.update.mockResolvedValue({});

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow(
        "exceeding your limit of 50 events per import"
      );

      // Verify job was updated to FAILED stage
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "import-jobs",
          id: 123,
          data: expect.objectContaining({ stage: "failed" }),
        })
      );
    });

    it("should fail when total events quota is exceeded", async () => {
      const mockSchemaBuilderState = { fieldStats: {}, recordCount: 100 };

      const mockImportJob = createMockImportJob({ id: 123 });
      (mockImportJob as unknown as ImportJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      const mockDataset = createMockDataset();
      const mockImportFile = createMockImportFile();
      (mockImportFile as any).user = { id: 1, email: "test@example.com", role: "user" };

      mockPayload.findByID
        .mockResolvedValueOnce(mockImportJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockImportFile);

      // First checkQuota call (EVENTS_PER_IMPORT) returns allowed
      mocks.checkQuota.mockResolvedValueOnce({ allowed: true, current: 0, limit: 1000, remaining: 1000 });
      // Second checkQuota call (TOTAL_EVENTS) returns not allowed
      mocks.checkQuota.mockResolvedValueOnce({ allowed: false, current: 9500, limit: 10000, remaining: 500 });

      mockPayload.update.mockResolvedValue({});

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("would exceed your total events limit");

      // Verify the job was updated to FAILED with the quota error
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "import-jobs",
          id: 123,
          data: expect.objectContaining({
            stage: "failed",
            errors: expect.arrayContaining([
              expect.objectContaining({ error: expect.stringContaining("would exceed your total events limit") }),
            ]),
          }),
        })
      );
    });
  });
});
