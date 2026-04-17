/**
 * @module
 */
import { mockLogger } from "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => ({
  cleanupSidecarFiles: vi.fn(),
  getIngestFilePath: vi.fn((filename: string) => `/mock/ingest-files/${filename}`),
  auditLog: vi.fn(),
  createQuotaService: vi.fn(),
  validateCatalogOwnership: vi.fn(),
  isPrivileged: vi.fn(() => false),
  validateRelationOwnership: vi.fn(),
  extractRelationId: vi.fn((v: any) => (typeof v === "object" && v !== null ? v?.id : v)),
  requireRelationId: vi.fn((v: any) => (typeof v === "object" && v !== null ? v?.id : v)),
  getResumePointForReason: vi.fn(() => "create-schema-version"),
}));

vi.mock("@/lib/ingest/file-readers", () => ({ cleanupSidecarFiles: mocks.cleanupSidecarFiles }));

vi.mock("@/lib/jobs/utils/upload-path", () => ({ getIngestFilePath: mocks.getIngestFilePath }));

vi.mock("@/lib/services/audit-log-service", () => ({
  AUDIT_ACTIONS: { IMPORT_JOB_STAGE_OVERRIDE: "import.job_stage_override" },
  auditLog: mocks.auditLog,
}));

vi.mock("@/lib/services/quota-service", () => ({ createQuotaService: mocks.createQuotaService }));

vi.mock("@/lib/constants/ingest-constants", () => ({
  COLLECTION_NAMES: { INGEST_FILES: "ingest-files", INGEST_JOBS: "ingest-jobs" },
  PROCESSING_STAGE: { COMPLETED: "completed", FAILED: "failed", NEEDS_REVIEW: "needs-review" },
}));

vi.mock("@/lib/collections/catalog-ownership", () => ({ validateCatalogOwnership: mocks.validateCatalogOwnership }));

vi.mock("@/lib/collections/shared-fields", () => ({ isPrivileged: mocks.isPrivileged }));

vi.mock("@/lib/collections/shared-hooks", () => ({ validateRelationOwnership: mocks.validateRelationOwnership }));

vi.mock("@/lib/utils/relation-id", () => ({
  extractRelationId: mocks.extractRelationId,
  requireRelationId: mocks.requireRelationId,
}));

vi.mock("@/lib/jobs/workflows/review-checks", () => ({
  getResumePointForReason: mocks.getResumePointForReason,
  REVIEW_REASONS: {
    HIGH_DUPLICATE_RATE: "high-duplicates",
    HIGH_EMPTY_ROW_RATE: "high-empty-rows",
    NO_TIMESTAMP_DETECTED: "no-timestamp",
    NO_LOCATION_DETECTED: "no-location",
    GEOCODING_PARTIAL: "geocoding-partial",
    QUOTA_EXCEEDED: "quota-exceeded",
    HIGH_ROW_ERROR_RATE: "high-row-errors",
  },
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { afterChangeHooks, beforeChangeHooks, ingestJobAfterDeleteHook } from "@/lib/collections/ingest-jobs/hooks";

describe.sequential("ingestJobAfterDeleteHook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIngestFilePath.mockImplementation((filename: string) => `/mock/ingest-files/${filename}`);
  });

  it("should clean up sidecar files when import job with populated ingestFile is deleted", () => {
    const doc = { ingestFile: { id: "file-1", filename: "data.xlsx" }, sheetIndex: 2 };

    ingestJobAfterDeleteHook({ doc, req: {} } as any);

    expect(mocks.cleanupSidecarFiles).toHaveBeenCalledWith("/mock/ingest-files/data.xlsx", 2);
  });

  it("should not clean up when ingestFile is missing", () => {
    const doc = { sheetIndex: 0 };

    ingestJobAfterDeleteHook({ doc, req: {} } as any);

    expect(mocks.cleanupSidecarFiles).not.toHaveBeenCalled();
  });

  it("should not clean up when ingestFile is a plain ID (not populated)", () => {
    const doc = { ingestFile: 123, sheetIndex: 0 };

    ingestJobAfterDeleteHook({ doc, req: {} } as any);

    expect(mocks.cleanupSidecarFiles).not.toHaveBeenCalled();
  });

  it("should use sheetIndex 0 as default", () => {
    const doc = { ingestFile: { id: "file-1", filename: "data.xlsx" } };

    ingestJobAfterDeleteHook({ doc, req: {} } as any);

    expect(mocks.cleanupSidecarFiles).toHaveBeenCalledWith("/mock/ingest-files/data.xlsx", 0);
  });

  it("should log and swallow the error when cleanup fails", () => {
    const diskError = new Error("disk error");
    mocks.cleanupSidecarFiles.mockImplementation(() => {
      throw diskError;
    });
    const doc = { id: 99, ingestFile: { id: "file-1", filename: "data.xlsx" }, sheetIndex: 0 };

    expect(() => ingestJobAfterDeleteHook({ doc, req: {} } as any)).not.toThrow();

    expect(mocks.cleanupSidecarFiles).toHaveBeenCalledWith("/mock/ingest-files/data.xlsx", 0);
    expect(mockLogger.logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ error: diskError, ingestJobId: 99 }),
      "Failed to clean up sidecar files after ingest job deletion"
    );
  });
});

describe.sequential("beforeChangeHooks", () => {
  const hook = beforeChangeHooks[0]!;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPrivileged.mockReturnValue(false);
    mocks.extractRelationId.mockImplementation((v: any) => (typeof v === "object" && v !== null ? v?.id : v));
    mocks.requireRelationId.mockImplementation((v: any) => (typeof v === "object" && v !== null ? v?.id : v));
  });

  describe("enforceCompletedTerminalState", () => {
    it("should warn but not throw when admin changes a COMPLETED job", async () => {
      const data = { stage: "detect-schema" };
      const originalDoc = { id: 1, stage: "completed" };
      const req = { user: { id: 1, role: "admin", email: "admin@example.com" } };

      await expect(
        hook({ data, operation: "update", req, originalDoc, collection: {} as never, context: {} as never } as any)
      ).resolves.not.toThrow();
    });

    it("should throw when non-admin changes a COMPLETED job", async () => {
      const data = { stage: "detect-schema" };
      const originalDoc = { id: 1, stage: "completed" };
      const req = { user: { id: 2, role: "user" } };

      await expect(
        hook({ data, operation: "update", req, originalDoc, collection: {} as never, context: {} as never } as any)
      ).rejects.toThrow("Cannot modify completed import job");
    });
  });

  describe("handleSchemaApproval", () => {
    it("should throw when approval is attempted without authentication", async () => {
      const data = { stage: "needs-review", schemaValidation: { approved: true } };
      const originalDoc = { id: 1, stage: "needs-review", schemaValidation: { approved: false } };
      const req = { user: null };

      await expect(
        hook({ data, operation: "update", req, originalDoc, collection: {} as never, context: {} as never } as any)
      ).rejects.toThrow("Authentication required to approve schema changes");
    });

    it("should set approvedAt and approvedBy on valid approval", async () => {
      const data = { stage: "needs-review", schemaValidation: { approved: true } };
      const originalDoc = { id: 1, stage: "needs-review", schemaValidation: { approved: false } };
      const req = { user: { id: 42, role: "user" } };

      await hook({ data, operation: "update", req, originalDoc, collection: {} as never, context: {} as never } as any);

      expect(data.schemaValidation).toEqual(
        expect.objectContaining({ approved: true, approvedBy: 42, approvedAt: expect.any(String) })
      );
    });
  });

  describe("validateCreateOwnership", () => {
    it("should skip validation for privileged users on create", async () => {
      mocks.isPrivileged.mockReturnValue(true);
      const data = { ingestFile: 10, dataset: 20 };
      const req = { user: { id: 1, role: "admin" }, payload: {} };

      await hook({
        data,
        operation: "create",
        req,
        originalDoc: undefined,
        collection: {} as never,
        context: {} as never,
      } as any);

      expect(mocks.validateRelationOwnership).not.toHaveBeenCalled();
      expect(mocks.validateCatalogOwnership).not.toHaveBeenCalled();
    });

    it("should validate ownership for non-privileged users on create", async () => {
      mocks.isPrivileged.mockReturnValue(false);
      const mockPayload = { findByID: vi.fn().mockResolvedValue({ catalog: 5 }) };
      const data = { ingestFile: 10, dataset: 20 };
      const req = { user: { id: 1, role: "user" }, payload: mockPayload };

      await hook({
        data,
        operation: "create",
        req,
        originalDoc: undefined,
        collection: {} as never,
        context: {} as never,
      } as any);

      expect(mocks.validateRelationOwnership).toHaveBeenCalledWith(mockPayload, {
        collection: "ingest-files",
        id: 10,
        userField: "user",
        userId: 1,
        errorMessage: "You can only create ingest jobs for your own ingest files",
        req,
      });
      expect(mockPayload.findByID).toHaveBeenCalledWith({ collection: "datasets", id: 20, overrideAccess: true, req });
      expect(mocks.validateCatalogOwnership).toHaveBeenCalledWith(mockPayload, 5, { id: 1 }, req);
    });

    it("should skip ownership validation when no user is present on create", async () => {
      const data = { ingestFile: 10, dataset: 20 };
      const req = { user: undefined, payload: {} };

      await hook({
        data,
        operation: "create",
        req,
        originalDoc: undefined,
        collection: {} as never,
        context: {} as never,
      } as any);

      expect(mocks.validateRelationOwnership).not.toHaveBeenCalled();
      expect(mocks.validateCatalogOwnership).not.toHaveBeenCalled();
    });

    it("should skip ingestFile ownership validation when ingestFile is undefined", async () => {
      mocks.isPrivileged.mockReturnValue(false);
      const mockPayload = { findByID: vi.fn() };
      const data = { dataset: 20 };
      const req = { user: { id: 1, role: "user" }, payload: mockPayload };

      await hook({
        data,
        operation: "create",
        req,
        originalDoc: undefined,
        collection: {} as never,
        context: {} as never,
      } as any);

      expect(mocks.validateRelationOwnership).not.toHaveBeenCalled();
    });

    it("should skip catalog validation when dataset is undefined", async () => {
      mocks.isPrivileged.mockReturnValue(false);
      const data = { ingestFile: 10 };
      const req = { user: { id: 1, role: "user" }, payload: {} };

      await hook({
        data,
        operation: "create",
        req,
        originalDoc: undefined,
        collection: {} as never,
        context: {} as never,
      } as any);

      expect(mocks.validateCatalogOwnership).not.toHaveBeenCalled();
    });

    it("should skip catalog validation when dataset has no catalog", async () => {
      mocks.isPrivileged.mockReturnValue(false);
      const mockPayload = { findByID: vi.fn().mockResolvedValue({ catalog: null }) };
      mocks.extractRelationId.mockImplementation((v: any) => {
        if (v === null || v === undefined) return null;
        return typeof v === "object" ? v?.id : v;
      });
      const data = { ingestFile: 10, dataset: 20 };
      const req = { user: { id: 1, role: "user" }, payload: mockPayload };

      await hook({
        data,
        operation: "create",
        req,
        originalDoc: undefined,
        collection: {} as never,
        context: {} as never,
      } as any);

      expect(mocks.validateCatalogOwnership).not.toHaveBeenCalled();
    });
  });
});

describe.sequential("afterChangeHooks", () => {
  const hook = afterChangeHooks[0]!;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractRelationId.mockImplementation((v: any) => (typeof v === "object" && v !== null ? v?.id : v));
    mocks.requireRelationId.mockImplementation((v: any) => (typeof v === "object" && v !== null ? v?.id : v));
  });

  describe("schema approval - quota-exceeded", () => {
    it("should throw when non-admin approves quota-exceeded review", async () => {
      const doc = {
        id: 1,
        stage: "needs-review",
        reviewReason: "quota-exceeded",
        schemaValidation: { approved: true },
      };
      const previousDoc = { id: 1, stage: "needs-review", schemaValidation: { approved: false } };
      const req = { user: { id: 2, role: "user" }, payload: {} };

      await expect(
        hook({ doc, previousDoc, req, operation: "update", collection: {} as never, context: {} as never } as any)
      ).rejects.toThrow("Only admins can approve quota-exceeded imports");
    });
  });

  describe("schema approval - high-row-errors", () => {
    it("should mark job completed without queuing workflow", async () => {
      const mockUpdate = vi.fn().mockResolvedValue({});
      const doc = {
        id: 1,
        stage: "needs-review",
        reviewReason: "high-row-errors",
        schemaValidation: { approved: true },
      };
      const previousDoc = { id: 1, stage: "needs-review", schemaValidation: { approved: false } };
      const req = { user: { id: 2, role: "user" }, payload: { update: mockUpdate, jobs: { queue: vi.fn() } } };

      const result = await hook({
        doc,
        previousDoc,
        req,
        operation: "update",
        collection: {} as never,
        context: {} as never,
      } as any);

      expect(mockUpdate).toHaveBeenCalledWith({ collection: "ingest-jobs", id: 1, data: { stage: "completed" }, req });
      expect(req.payload.jobs.queue).not.toHaveBeenCalled();
      expect(result).toEqual(doc);
    });
  });

  describe("schema approval - normal reason", () => {
    it("should set skip flag and queue ingest-process workflow", async () => {
      mocks.getResumePointForReason.mockReturnValue("detect-schema");
      const mockFindByID = vi.fn().mockResolvedValue({ processingOptions: { existing: true } });
      const mockUpdate = vi.fn().mockResolvedValue({});
      const mockQueue = vi.fn().mockResolvedValue({});
      const doc = {
        id: 1,
        stage: "needs-review",
        reviewReason: "high-duplicates",
        ingestFile: { id: 10 },
        schemaValidation: { approved: true },
      };
      const previousDoc = { id: 1, stage: "needs-review", schemaValidation: { approved: false } };
      const req = {
        user: { id: 2, role: "user" },
        payload: { findByID: mockFindByID, update: mockUpdate, jobs: { queue: mockQueue } },
      };

      await hook({ doc, previousDoc, req, operation: "update", collection: {} as never, context: {} as never } as any);

      // Should set skip flag on ingest file
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "ingest-files",
          id: 10,
          data: { processingOptions: { existing: true, reviewChecks: { skipDuplicateRateCheck: true } } },
        })
      );
      // Should queue ingest-process workflow
      expect(mockQueue).toHaveBeenCalledWith({
        workflow: "ingest-process",
        input: { ingestJobId: "1", resumeFrom: "detect-schema" },
      });
    });
  });

  describe("schema approval - reason with no skip flag", () => {
    it("should skip setting skip flag when reviewReason has no mapped flag", async () => {
      mocks.getResumePointForReason.mockReturnValue("create-schema-version");
      const mockFindByID = vi.fn();
      const mockUpdate = vi.fn().mockResolvedValue({});
      const mockQueue = vi.fn().mockResolvedValue({});
      const doc = {
        id: 1,
        stage: "needs-review",
        reviewReason: "quota-exceeded",
        ingestFile: { id: 10 },
        schemaValidation: { approved: true },
      };
      const previousDoc = { id: 1, stage: "needs-review", schemaValidation: { approved: false } };
      const req = {
        user: { id: 2, role: "admin" },
        payload: { findByID: mockFindByID, update: mockUpdate, jobs: { queue: mockQueue } },
      };

      await hook({ doc, previousDoc, req, operation: "update", collection: {} as never, context: {} as never } as any);

      // findByID should not be called because the skip flag lookup returns undefined early
      expect(mockFindByID).not.toHaveBeenCalled();
      // Should still queue the workflow
      expect(mockQueue).toHaveBeenCalledWith({
        workflow: "ingest-process",
        input: { ingestJobId: "1", resumeFrom: "create-schema-version" },
      });
    });

    it("should skip setting skip flag when doc has no reviewReason", async () => {
      mocks.getResumePointForReason.mockReturnValue("create-schema-version");
      const mockFindByID = vi.fn();
      const mockQueue = vi.fn().mockResolvedValue({});
      const doc = {
        id: 1,
        stage: "needs-review",
        reviewReason: undefined,
        ingestFile: { id: 10 },
        schemaValidation: { approved: true },
      };
      const previousDoc = { id: 1, stage: "needs-review", schemaValidation: { approved: false } };
      const req = {
        user: { id: 2, role: "user" },
        payload: { findByID: mockFindByID, update: vi.fn(), jobs: { queue: mockQueue } },
      };

      await hook({ doc, previousDoc, req, operation: "update", collection: {} as never, context: {} as never } as any);

      expect(mockFindByID).not.toHaveBeenCalled();
      expect(mockQueue).toHaveBeenCalled();
    });

    it("should skip setting skip flag when ingestFile is missing", async () => {
      mocks.getResumePointForReason.mockReturnValue("detect-schema");
      mocks.extractRelationId.mockReturnValue(null);
      const mockFindByID = vi.fn();
      const mockUpdate = vi.fn();
      const mockQueue = vi.fn().mockResolvedValue({});
      const doc = {
        id: 1,
        stage: "needs-review",
        reviewReason: "high-duplicates",
        ingestFile: null,
        schemaValidation: { approved: true },
      };
      const previousDoc = { id: 1, stage: "needs-review", schemaValidation: { approved: false } };
      const req = {
        user: { id: 2, role: "user" },
        payload: { findByID: mockFindByID, update: mockUpdate, jobs: { queue: mockQueue } },
      };

      await hook({ doc, previousDoc, req, operation: "update", collection: {} as never, context: {} as never } as any);

      // findByID should not be called because ingestFileId is null
      expect(mockFindByID).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      // Should still queue the workflow
      expect(mockQueue).toHaveBeenCalled();
    });
  });

  describe("audit admin stage override", () => {
    it("should audit when admin overrides terminal COMPLETED state", async () => {
      const doc = { id: 1, stage: "detect-schema" };
      const previousDoc = { id: 1, stage: "completed", schemaValidation: {} };
      const req = { user: { id: 1, role: "admin", email: "admin@example.com" }, payload: {} };

      await hook({ doc, previousDoc, req, operation: "update", collection: {} as never, context: {} as never } as any);

      expect(mocks.auditLog).toHaveBeenCalledWith(
        req.payload,
        {
          action: "import.job_stage_override",
          userId: 1,
          userEmail: "admin@example.com",
          details: {
            ingestJobId: 1,
            fromStage: "completed",
            toStage: "detect-schema",
            overrideType: "completed_state_reset",
          },
        },
        expect.objectContaining({ req: expect.any(Object) })
      );
    });

    it("should audit when admin overrides terminal FAILED state", async () => {
      const doc = { id: 1, stage: "detect-schema" };
      const previousDoc = { id: 1, stage: "failed", schemaValidation: {} };
      const req = { user: { id: 1, role: "admin", email: "admin@example.com" }, payload: {} };

      await hook({ doc, previousDoc, req, operation: "update", collection: {} as never, context: {} as never } as any);

      expect(mocks.auditLog).toHaveBeenCalledWith(
        req.payload,
        expect.objectContaining({
          action: "import.job_stage_override",
          userId: 1,
          userEmail: "admin@example.com",
          details: expect.objectContaining({ overrideType: "failed_recovery" }),
        }),
        expect.objectContaining({ req: expect.any(Object) })
      );
    });

    it("should not audit for non-terminal stage changes", async () => {
      const doc = { id: 1, stage: "detect-schema" };
      const previousDoc = { id: 1, stage: "needs-review", schemaValidation: {} };
      const req = { user: { id: 1, role: "admin", email: "admin@example.com" }, payload: {} };

      await hook({ doc, previousDoc, req, operation: "update", collection: {} as never, context: {} as never } as any);

      expect(mocks.auditLog).not.toHaveBeenCalled();
    });

    it("should not audit terminal stage override for non-admin users", async () => {
      const doc = { id: 1, stage: "detect-schema" };
      const previousDoc = { id: 1, stage: "completed", schemaValidation: {} };
      const req = { user: { id: 2, role: "user" }, payload: {} };

      await hook({ doc, previousDoc, req, operation: "update", collection: {} as never, context: {} as never } as any);

      expect(mocks.auditLog).not.toHaveBeenCalled();
    });
  });

  describe("trackIngestJobQuota on create", () => {
    it("should increment quota on job creation", async () => {
      const mockIncrementUsage = vi.fn().mockResolvedValue({});
      mocks.createQuotaService.mockReturnValue({ incrementUsage: mockIncrementUsage });
      const mockFindByID = vi.fn().mockResolvedValue({ user: { id: 42 } });
      const doc = { id: 1, ingestFile: { id: 10 } };
      const req = { user: { id: 42, role: "user" }, payload: { findByID: mockFindByID, jobs: { queue: vi.fn() } } };

      await hook({
        doc,
        previousDoc: undefined,
        req,
        operation: "create",
        collection: {} as never,
        context: {} as never,
      } as any);

      expect(mocks.createQuotaService).toHaveBeenCalledWith(req.payload);
      expect(mockIncrementUsage).toHaveBeenCalledWith(42, "IMPORT_JOBS_PER_DAY", 1, req);
    });

    it("should skip quota tracking when ingest file has no user", async () => {
      const mockIncrementUsage = vi.fn();
      mocks.createQuotaService.mockReturnValue({ incrementUsage: mockIncrementUsage });
      const mockFindByID = vi.fn().mockResolvedValue({ user: null });
      const doc = { id: 1, ingestFile: { id: 10 } };
      const req = { user: { id: 42, role: "user" }, payload: { findByID: mockFindByID, jobs: { queue: vi.fn() } } };

      await hook({
        doc,
        previousDoc: undefined,
        req,
        operation: "create",
        collection: {} as never,
        context: {} as never,
      } as any);

      expect(mockIncrementUsage).not.toHaveBeenCalled();
    });
  });
});
