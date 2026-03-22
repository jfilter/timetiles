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

import { JobCancelledError } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateSchemaJob } from "@/lib/jobs/handlers/validate-schema-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import type { IngestJob } from "@/payload-types";
import {
  createMockContext,
  createMockDataset,
  createMockIngestFile,
  createMockIngestJob,
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
  };
});

// Mock external dependencies
vi.mock("@/lib/ingest/file-readers", () => ({ cleanupSidecarFiles: mocks.cleanupSidecarFiles }));

vi.mock("@/lib/jobs/utils/upload-path", () => ({
  getIngestFilePath: vi.fn((filename: string) => `/mock/ingest-files/${filename}`),
}));

vi.mock("@/lib/services/schema-builder", () => ({ ProgressiveSchemaBuilder: mocks.ProgressiveSchemaBuilder }));

vi.mock("@/lib/ingest/schema-versioning", () => ({
  SchemaVersioningService: {
    createSchemaVersion: mocks.createSchemaVersion,
    linkImportToSchemaVersion: mocks.linkImportToSchemaVersion,
  },
}));

vi.mock("@/lib/ingest/progress-tracking", () => ({
  ProgressTrackingService: { startStage: mocks.startStage, completeStage: mocks.completeStage },
}));

vi.mock("@/lib/types/schema-detection", () => ({ getSchemaBuilderState: mocks.getSchemaBuilderState }));

describe.sequential("ValidateSchemaJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;
  let mockSchemaBuilderInstance: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create standard mock payload and context using factories
    mockPayload = createMockPayload();
    mockContext = createMockContext(mockPayload, { ingestJobId: "123" });

    // Mock schema builder instance (job-specific)
    mockSchemaBuilderInstance = { processBatch: vi.fn(), getSchema: vi.fn(), getState: vi.fn() };

    // Setup ProgressiveSchemaBuilder mock
    // eslint-disable-next-line prefer-arrow-functions/prefer-arrow-functions -- regular function required: arrow functions cannot be constructors (vitest 4)
    mocks.ProgressiveSchemaBuilder.mockImplementation(function () {
      return mockSchemaBuilderInstance;
    });
  });

  describe("Success Cases", () => {
    it("should reject partially numeric import job ids before loading resources", async () => {
      mockContext = createMockContext(mockPayload, { ingestJobId: "123abc" });

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("Invalid import job ID");

      expect(mockPayload.findByID).not.toHaveBeenCalled();
      expect(mockPayload.update).not.toHaveBeenCalled();
    });

    it("should auto-approve schema with only non-breaking changes", async () => {
      // Create mock data using factories
      const mockIngestJob = createMockIngestJob({ id: 123, progress: { total: 100 } });
      const mockDataset = createMockDataset();
      const mockIngestFile = createMockIngestFile();

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
      (mockIngestJob as unknown as IngestJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile);

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

      // Verify result — success: true, no stage transition (workflow controls it)
      expect(result).toEqual({ output: { hasChanges: true, hasBreakingChanges: false, newFields: 1 } });

      // Schema version creation now happens in CREATE_SCHEMA_VERSION stage, not inline
      // So we should NOT expect createSchemaVersion to be called here
      expect(mocks.createSchemaVersion).not.toHaveBeenCalled();

      // Verify job was updated with validation data but no stage (workflow controls sequencing)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
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
        },
      });
    });

    it("should require approval for breaking changes", async () => {
      // Mock import job
      const mockIngestJob = {
        id: 123,
        dataset: "dataset-456",
        ingestFile: "file-789",
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
      const mockIngestFile = { id: "file-789", filename: "test.csv" };

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
      (mockIngestJob as unknown as IngestJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile);

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
      expect(result).toEqual({
        output: { needsReview: true, requiresApproval: true, hasBreakingChanges: true, newFields: 0 },
      });

      // Verify no schema version was created (needs approval)
      expect(mocks.createSchemaVersion).not.toHaveBeenCalled();

      // Verify job was updated to await approval (stage set for needs-review pause)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
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
          stage: "needs-review",
        },
      });
    });

    it("should handle locked schema configuration", async () => {
      // Mock import job
      const mockIngestJob = {
        id: 123,
        dataset: "dataset-456",
        ingestFile: "file-789",
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
      const mockIngestFile = { id: "file-789", filename: "test.csv" };

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
      (mockIngestJob as unknown as IngestJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile);

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
      expect(result).toEqual({
        output: { needsReview: true, requiresApproval: true, hasBreakingChanges: false, newFields: 1 },
      });

      // Verify job was updated to await approval (stage set for needs-review pause)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
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
          stage: "needs-review",
        },
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw Error when ingest job not found (onFail handles failure marking)", async () => {
      mockPayload.findByID.mockResolvedValue(null);
      mockPayload.update.mockResolvedValue({});

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("Ingest job not found");
    });

    it("should throw Error when dataset not found (onFail handles failure marking)", async () => {
      const mockIngestJob = { id: 123, dataset: "dataset-456" };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestJob).mockResolvedValueOnce(null); // Dataset not found
      mockPayload.update.mockResolvedValue({});

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("Dataset not found");
    });

    it("should throw Error when ingest file not found (onFail handles failure marking)", async () => {
      const mockIngestJob = { id: 123, dataset: "dataset-456", ingestFile: "file-789" };

      const mockDataset = { id: "dataset-456", schemaConfig: {} };

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(null); // Ingest file not found
      mockPayload.update.mockResolvedValue({});

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("Ingest file not found");
    });

    it("should throw Error when schema builder state is missing (onFail handles failure marking)", async () => {
      const mockIngestJob = {
        id: 123,
        dataset: "dataset-456",
        ingestFile: "file-789",
        // No schemaBuilderState - this should cause an error
      };

      const mockDataset = { id: "dataset-456", schemaConfig: {} };

      const mockIngestFile = { id: "file-789", filename: "test.csv" };

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile);

      // Mock getSchemaBuilderState to return null (missing state)
      mocks.getSchemaBuilderState.mockReturnValueOnce(null);
      mockPayload.update.mockResolvedValue({});

      // Error is re-thrown for Payload to retry; onFail marks job as failed after retries exhaust
      const error = await validateSchemaJob.handler(mockContext).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Schema builder state not found. Schema detection stage must run first.");
    });

    it("should re-throw transient errors and clean up sidecar files", async () => {
      const mockIngestJob = createMockIngestJob({ id: 123, sheetIndex: 2 });
      const mockDataset = createMockDataset();
      const mockIngestFile = createMockIngestFile("file-789", "test.xlsx");

      // First loadJobResources call (in try block) — returns resources successfully
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile);

      // Make getSchemaBuilderState throw a transient error (matches transient patterns)
      mocks.getSchemaBuilderState.mockImplementationOnce(() => {
        throw new Error("Connection timeout");
      });

      // Second loadJobResources call (in catch block for cleanup)
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile);

      mockPayload.update.mockResolvedValueOnce({});

      // Transient error: re-throws original error for Payload to retry (not JobCancelledError)
      const error = await validateSchemaJob.handler(mockContext).catch((e: unknown) => e);

      expect(error).not.toBeInstanceOf(JobCancelledError);
      expect((error as Error).message).toBe("Connection timeout");

      // Verify sidecar cleanup was called with the file path and sheetIndex
      expect(mocks.cleanupSidecarFiles).toHaveBeenCalledWith("/mock/ingest-files/test.xlsx", 2);
    });
  });

  describe("Edge Cases", () => {
    it("should handle no schema changes", async () => {
      // Mock import job
      const mockIngestJob = {
        id: 123,
        dataset: "dataset-456",
        ingestFile: "file-789",
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
      const mockIngestFile = { id: "file-789", filename: "test.csv" };

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
      (mockIngestJob as unknown as IngestJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile);

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

      // Verify result - no approval needed, no changes, success
      expect(result).toEqual({ output: { hasChanges: false, hasBreakingChanges: false, newFields: 0 } });

      // Verify no schema version was created (no changes)
      expect(mocks.createSchemaVersion).not.toHaveBeenCalled();

      // Verify job was updated with validation data but no stage (workflow controls sequencing)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
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
        },
      });
    });

    it("should skip duplicate rows during schema validation", async () => {
      // Mock import job with duplicates
      const mockIngestJob = {
        id: 123,
        dataset: "dataset-456",
        ingestFile: "file-789",
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
      const mockIngestFile = { id: "file-789", filename: "test.csv" };

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
      (mockIngestJob as unknown as IngestJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      // Setup mocks
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile);

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

      const mockIngestJob = createMockIngestJob({ id: 123 });
      (mockIngestJob as unknown as IngestJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;

      const mockDataset = createMockDataset();
      const mockIngestFile = createMockIngestFile();

      // Add processingOptions with schemaMode and optionally a user
      (mockIngestFile as any).processingOptions = { schemaMode: options.schemaMode };
      if (options.userId) {
        (mockIngestFile as any).user = { id: options.userId, email: "test@example.com", role: "user" };
      }

      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile);

      mockPayload.find.mockResolvedValueOnce({ docs: [{ schema: options.currentSchema }] });

      mocks.getSchemaBuilderState.mockReturnValueOnce(mockSchemaBuilderState);
      mockSchemaBuilderInstance.getSchema.mockResolvedValueOnce(options.detectedSchema);
      mockSchemaBuilderInstance.getState.mockReturnValueOnce(mockSchemaBuilderState);
      mockPayload.update.mockResolvedValue({});

      return { mockIngestJob, mockDataset, mockIngestFile };
    };

    it("should throw for strict mode when schema has changes", async () => {
      const currentSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
      const detectedSchema = {
        type: "object",
        properties: { id: { type: "string" }, newField: { type: "string" } },
        required: ["id"],
      };

      setupSchemaModeTest({ schemaMode: "strict", detectedSchema, currentSchema });

      // Strict-mode violation now throws (Payload retries → onFail marks FAILED)
      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("Schema mismatch in strict mode");

      // Verify job was updated to FAILED stage (handler marks it before throwing)
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "ingest-jobs",
          id: 123,
          data: expect.objectContaining({ stage: "failed" }),
        })
      );
    });

    it("should throw for additive mode when schema has breaking changes", async () => {
      const currentSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
      const detectedSchema = { type: "object", properties: { id: { type: "number" } }, required: ["id"] };

      setupSchemaModeTest({ schemaMode: "additive", detectedSchema, currentSchema });

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow(
        "Breaking schema changes not allowed in additive mode"
      );

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
      expect(result).toEqual({ output: { hasChanges: true, hasBreakingChanges: false, newFields: 1 } });

      // Workflow controls stage transition — no stage in update data
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ stage: expect.anything() }) })
      );
    });

    it("should throw for flexible mode when schema has breaking changes", async () => {
      const currentSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
      const detectedSchema = { type: "object", properties: { id: { type: "number" } }, required: ["id"] };

      setupSchemaModeTest({ schemaMode: "flexible", detectedSchema, currentSchema });

      await expect(validateSchemaJob.handler(mockContext)).rejects.toThrow("Breaking schema changes detected");
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
      expect(result).toEqual({ output: { hasChanges: true, hasBreakingChanges: false, newFields: 1 } });

      // Workflow controls stage transition — no stage in update data
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ stage: expect.anything() }) })
      );
    });

    it("should pass through with no failure for strict mode when no changes exist", async () => {
      const schema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };

      setupSchemaModeTest({ schemaMode: "strict", detectedSchema: schema, currentSchema: schema });

      const result = await validateSchemaJob.handler(mockContext);

      // No changes in strict mode: no failure, no approval, success
      expect(result).toEqual({ output: { hasChanges: false, hasBreakingChanges: false, newFields: 0 } });

      // Workflow controls stage transition — no stage in update data
      expect(mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ stage: expect.anything() }) })
      );
    });
  });

  describe("Schema lookup sort field", () => {
    it("should sort current schema query by -versionNumber not -version", async () => {
      const mockSchemaBuilderState = { fieldStats: {}, recordCount: 100 };
      const mockSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
      const mockIngestJob = createMockIngestJob({ id: 123 });
      (mockIngestJob as unknown as IngestJob & { schemaBuilderState?: unknown }).schemaBuilderState =
        mockSchemaBuilderState;
      const mockDataset = createMockDataset();
      const mockIngestFile = createMockIngestFile();
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob)
        .mockResolvedValueOnce(mockDataset)
        .mockResolvedValueOnce(mockIngestFile);
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
});
