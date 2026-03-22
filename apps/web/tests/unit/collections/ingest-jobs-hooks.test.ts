/**
 * @module
 */
import "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => ({
  cleanupSidecarFiles: vi.fn(),
  getIngestFilePath: vi.fn((filename: string) => `/mock/ingest-files/${filename}`),
}));

vi.mock("@/lib/ingest/file-readers", () => ({ cleanupSidecarFiles: mocks.cleanupSidecarFiles }));

vi.mock("@/lib/jobs/utils/upload-path", () => ({ getIngestFilePath: mocks.getIngestFilePath }));

vi.mock("@/lib/services/audit-log-service", () => ({ AUDIT_ACTIONS: {}, auditLog: vi.fn() }));

vi.mock("@/lib/services/quota-service", () => ({ createQuotaService: vi.fn() }));

vi.mock("@/lib/constants/ingest-constants", () => ({
  COLLECTION_NAMES: { IMPORT_FILES: "ingest-files", IMPORT_JOBS: "ingest-jobs" },
  PROCESSING_STAGE: { COMPLETED: "completed", FAILED: "failed", NEEDS_REVIEW: "needs-review" },
}));

vi.mock("@/lib/collections/ingest-jobs/helpers", () => ({ handleJobCompletion: vi.fn(), isJobCompleted: vi.fn() }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ingestJobAfterDeleteHook } from "@/lib/collections/ingest-jobs/hooks";

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

  it("should not throw when cleanup fails", () => {
    mocks.cleanupSidecarFiles.mockImplementation(() => {
      throw new Error("disk error");
    });
    const doc = { ingestFile: { id: "file-1", filename: "data.xlsx" }, sheetIndex: 0 };

    expect(() => ingestJobAfterDeleteHook({ doc, req: {} } as any)).not.toThrow();
  });
});
