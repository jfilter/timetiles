/**
 * Unit tests for the create schema version job handler.
 *
 * Tests the creation of new schema versions during import processing,
 * including version management and schema evolution tracking.
 *
 * @module
 * @category Tests
 */
// Import centralized logger mock
import "@/tests/mocks/services/logger";

import { JobCancelledError } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSchemaVersionJob } from "@/lib/jobs/handlers/create-schema-version-job";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { createMockDataset } from "@/tests/setup/factories";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    createSchemaVersion: vi.fn(),
    getFieldStats: vi.fn(),
    startStage: vi.fn().mockResolvedValue(undefined),
    completeStage: vi.fn().mockResolvedValue(undefined),
    skipStage: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock external dependencies
vi.mock("@/lib/ingest/schema-versioning", () => ({
  SchemaVersioningService: { createSchemaVersion: mocks.createSchemaVersion },
}));

vi.mock("@/lib/types/schema-detection", () => ({ getFieldStats: mocks.getFieldStats }));

vi.mock("@/lib/ingest/progress-tracking", () => ({
  ProgressTrackingService: {
    startStage: mocks.startStage,
    completeStage: mocks.completeStage,
    skipStage: mocks.skipStage,
  },
}));

vi.mock("@/lib/constants/ingest-constants", () => ({
  JOB_TYPES: { CREATE_SCHEMA_VERSION: "create-schema-version" },
  PROCESSING_STAGE: {
    CREATE_SCHEMA_VERSION: "create-schema-version",
    GEOCODE_BATCH: "geocode-batch",
    FAILED: "failed",
  },
  COLLECTION_NAMES: { INGEST_JOBS: "ingest-jobs", SCHEMA_VERSIONS: "schema-versions", DATASETS: "datasets" },
  BATCH_SIZES: { DUPLICATE_ANALYSIS: 5000, SCHEMA_DETECTION: 10000, EVENT_CREATION: 1000, DATABASE_CHUNK: 1000 },
}));

describe.sequential("CreateSchemaVersionJob Handler", () => {
  let mockPayload: any;
  let mockContext: JobHandlerContext;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock payload
    mockPayload = { findByID: vi.fn(), update: vi.fn() };

    // Mock context
    mockContext = {
      req: { payload: mockPayload },
      job: { id: "test-job-1", taskStatus: "running" } as any,
      input: { ingestJobId: "import-123" } as any,
    };
  });

  describe("Success Cases", () => {
    it("should create schema version successfully", async () => {
      // Mock import job with manually approved schema
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        schemaValidation: {
          requiresApproval: true, // Manual approval required
          approved: true, // And it was approved
          approvedBy: 789, // Numeric ID
        },
        schema: { title: { type: "string" }, date: { type: "date" } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
        duplicates: { summary: { uniqueRows: 100 } },
      };

      // Mock dataset
      const mockDataset = createMockDataset();

      // Mock field stats
      const mockFieldStats = { title: { uniqueCount: 100, nullCount: 0 }, date: { uniqueCount: 95, nullCount: 5 } };

      // Mock created schema version
      const mockSchemaVersion = { id: "schema-version-101", dataset: "dataset-456", schema: mockIngestJob.schema };

      // Setup payload mock responses
      mockPayload.findByID
        .mockResolvedValueOnce(mockIngestJob) // First call returns import job
        .mockResolvedValueOnce(mockDataset); // Second call returns dataset

      mockPayload.update.mockResolvedValue({});

      mocks.getFieldStats.mockReturnValue(mockFieldStats);
      mocks.createSchemaVersion.mockResolvedValue(mockSchemaVersion);

      // Execute job
      const result = await createSchemaVersionJob.handler(mockContext);

      // Verify result — includes success, versionNumber, schemaVersionId
      expect(result).toEqual({
        output: { success: true, versionNumber: undefined, schemaVersionId: "schema-version-101" },
      });

      // Verify payload calls
      expect(mockPayload.findByID).toHaveBeenCalledTimes(2);
      expect(mockPayload.findByID).toHaveBeenNthCalledWith(1, { collection: "ingest-jobs", id: "import-123" });
      expect(mockPayload.findByID).toHaveBeenNthCalledWith(2, { collection: "datasets", id: "dataset-456" });

      // Verify schema version creation
      expect(mocks.createSchemaVersion).toHaveBeenCalledWith(mockPayload, {
        dataset: "dataset-456",
        schema: mockIngestJob.schema,
        fieldMetadata: mockFieldStats,
        fieldMappings: undefined,
        autoApproved: false,
        approvedBy: 789,
        ingestSources: [],
        req: mockContext.req,
      });

      // Verify stage tracking update at start + schema version update (no stage transition)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: "import-123",
        data: { stage: "create-schema-version" },
        context: { skipStageTransition: true },
      });
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: "import-123",
        data: { datasetSchemaVersion: "schema-version-101" },
        context: { skipStageTransition: true },
      });
    });

    it("should skip when schema version already exists", async () => {
      // Mock import job with existing schema version
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        datasetSchemaVersion: "existing-schema-version-123",
        schemaValidation: { approved: true, approvedBy: "user-789" },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
        duplicates: { summary: { uniqueRows: 100 } },
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestJob);

      // Execute job
      const result = await createSchemaVersionJob.handler(mockContext);

      // Verify result — skip path includes success: true
      expect(result).toEqual({ output: { success: true, skipped: true } });

      // Verify no schema version creation was attempted
      expect(mocks.createSchemaVersion).not.toHaveBeenCalled();

      // Stage tracking update at start (no stage transition to next stage)
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "ingest-jobs",
        id: "import-123",
        data: { stage: "create-schema-version" },
        context: { skipStageTransition: true },
      });
    });

    it("should skip when schema is not approved", async () => {
      // Mock import job with manual approval required but not yet approved
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        schemaValidation: {
          requiresApproval: true, // Manual approval required
          approved: false, // But not yet approved
        },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
        duplicates: { summary: { uniqueRows: 100 } },
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestJob);

      // Execute job
      const result = await createSchemaVersionJob.handler(mockContext);

      // Verify result — skip path includes success: true
      expect(result).toEqual({ output: { success: true, skipped: true } });

      // Verify no schema version creation was attempted
      expect(mocks.createSchemaVersion).not.toHaveBeenCalled();
    });

    it("should handle dataset as object reference", async () => {
      // Mock import job with dataset as object
      const mockDataset = createMockDataset();

      const mockIngestJob = {
        id: "import-123",
        dataset: mockDataset, // Dataset as object instead of ID
        schemaValidation: {
          requiresApproval: true, // Manual approval required
          approved: true, // And it was approved
          approvedBy: "user-789",
        },
        schema: { title: { type: "string" } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
        duplicates: { summary: { uniqueRows: 100 } },
      };

      const mockSchemaVersion = { id: "schema-version-101", dataset: "dataset-456" };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestJob);
      mockPayload.update.mockResolvedValue({});
      mocks.getFieldStats.mockReturnValue({});
      mocks.createSchemaVersion.mockResolvedValue(mockSchemaVersion);

      // Execute job
      const result = await createSchemaVersionJob.handler(mockContext);

      // Verify result — includes success, versionNumber, schemaVersionId
      expect(result).toEqual({
        output: { success: true, versionNumber: undefined, schemaVersionId: "schema-version-101" },
      });

      // Verify only one findByID call (no separate dataset fetch needed)
      expect(mockPayload.findByID).toHaveBeenCalledTimes(1);
    });

    it("should handle approvedBy as object reference", async () => {
      // Mock import job with approvedBy as object
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        schemaValidation: {
          requiresApproval: true, // Manual approval required
          approved: true, // And it was approved
          approvedBy: { id: "user-789", name: "Test User" },
        },
        schema: { title: { type: "string" } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
        duplicates: { summary: { uniqueRows: 100 } },
      };

      const mockDataset = createMockDataset();

      const mockSchemaVersion = { id: "schema-version-101", dataset: "dataset-456" };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestJob).mockResolvedValueOnce(mockDataset);
      mockPayload.update.mockResolvedValue({});
      mocks.getFieldStats.mockReturnValue({});
      mocks.createSchemaVersion.mockResolvedValue(mockSchemaVersion);

      // Execute job
      await createSchemaVersionJob.handler(mockContext);

      // Verify schema version creation with correct approvedBy ID
      expect(mocks.createSchemaVersion).toHaveBeenCalledWith(mockPayload, {
        dataset: "dataset-456",
        schema: mockIngestJob.schema,
        fieldMetadata: {},
        fieldMappings: undefined,
        autoApproved: false,
        approvedBy: "user-789", // Should extract ID from object
        ingestSources: [],
        req: mockContext.req,
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw Error when ingest job not found (onFail handles failure marking)", async () => {
      mockPayload.findByID.mockResolvedValue(null);
      mockPayload.update.mockResolvedValue({});

      const error = await createSchemaVersionJob.handler(mockContext).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Ingest job not found: import-123");
      expect(mockPayload.findByID).toHaveBeenCalledWith({ collection: "ingest-jobs", id: "import-123" });
    });

    it("should throw Error when dataset not found (onFail handles failure marking)", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        schemaValidation: { approved: true },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
        duplicates: { summary: { uniqueRows: 100 } },
      };

      mockPayload.findByID.mockResolvedValueOnce(mockIngestJob).mockResolvedValueOnce(null); // Dataset not found
      mockPayload.update.mockResolvedValue({});

      await expect(createSchemaVersionJob.handler(mockContext)).rejects.toThrow("Dataset not found");
    });

    it("should re-throw transient errors for Payload to retry", async () => {
      const mockIngestJob = {
        id: "import-123",
        dataset: "dataset-456",
        schemaValidation: { approved: true, approvedBy: "user-789" },
        schema: { title: { type: "string" } },
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
        duplicates: { summary: { uniqueRows: 100 } },
      };

      const mockDataset = createMockDataset();

      // "Connection timeout" matches transient error patterns,
      // so it is re-thrown for Payload to retry.
      const mockError = new Error("Connection timeout");

      mockPayload.findByID.mockResolvedValueOnce(mockIngestJob).mockResolvedValueOnce(mockDataset);
      mockPayload.update.mockResolvedValue({});
      mocks.getFieldStats.mockReturnValue({});
      mocks.createSchemaVersion.mockRejectedValue(mockError);

      const error = await createSchemaVersionJob.handler(mockContext).catch((e: unknown) => e);

      // Transient errors are re-thrown as-is (not JobCancelledError)
      expect(error).not.toBeInstanceOf(JobCancelledError);
      expect((error as Error).message).toBe("Connection timeout");

      // Transient errors do NOT call failIngestJob -- Payload handles retries
      expect(mockPayload.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stage: "failed" }) })
      );
    });
  });
});
