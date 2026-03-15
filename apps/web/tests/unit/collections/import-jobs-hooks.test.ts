/**
 * @module
 */
import "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => ({
  cleanupSidecarFiles: vi.fn(),
  getImportFilePath: vi.fn((filename: string) => `/mock/import-files/${filename}`),
}));

vi.mock("@/lib/utils/file-readers", () => ({ cleanupSidecarFiles: mocks.cleanupSidecarFiles }));

vi.mock("@/lib/jobs/utils/upload-path", () => ({ getImportFilePath: mocks.getImportFilePath }));

vi.mock("@/lib/services/stage-transition", () => ({ StageTransitionService: { processStageTransition: vi.fn() } }));

vi.mock("@/lib/services/audit-log-service", () => ({ AUDIT_ACTIONS: {}, auditLog: vi.fn() }));

vi.mock("@/lib/services/quota-service", () => ({ getQuotaService: vi.fn() }));

vi.mock("@/lib/constants/import-constants", () => ({
  COLLECTION_NAMES: { IMPORT_FILES: "import-files", IMPORT_JOBS: "import-jobs" },
  JOB_TYPES: { ANALYZE_DUPLICATES: "analyze-duplicates" },
  PROCESSING_STAGE: { COMPLETED: "completed", FAILED: "failed" },
}));

vi.mock("@/lib/constants/quota-constants", () => ({ USAGE_TYPES: {} }));

vi.mock("@/lib/collections/import-jobs/helpers", () => ({ handleJobCompletion: vi.fn(), isJobCompleted: vi.fn() }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { importJobAfterDeleteHook } from "@/lib/collections/import-jobs/hooks";

describe.sequential("importJobAfterDeleteHook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getImportFilePath.mockImplementation((filename: string) => `/mock/import-files/${filename}`);
  });

  it("should clean up sidecar files when import job with populated importFile is deleted", () => {
    const doc = { importFile: { id: "file-1", filename: "data.xlsx" }, sheetIndex: 2 };

    importJobAfterDeleteHook({ doc, req: {} } as any);

    expect(mocks.cleanupSidecarFiles).toHaveBeenCalledWith("/mock/import-files/data.xlsx", 2);
  });

  it("should not clean up when importFile is missing", () => {
    const doc = { sheetIndex: 0 };

    importJobAfterDeleteHook({ doc, req: {} } as any);

    expect(mocks.cleanupSidecarFiles).not.toHaveBeenCalled();
  });

  it("should not clean up when importFile is a plain ID (not populated)", () => {
    const doc = { importFile: 123, sheetIndex: 0 };

    importJobAfterDeleteHook({ doc, req: {} } as any);

    expect(mocks.cleanupSidecarFiles).not.toHaveBeenCalled();
  });

  it("should use sheetIndex 0 as default", () => {
    const doc = { importFile: { id: "file-1", filename: "data.xlsx" } };

    importJobAfterDeleteHook({ doc, req: {} } as any);

    expect(mocks.cleanupSidecarFiles).toHaveBeenCalledWith("/mock/import-files/data.xlsx", 0);
  });

  it("should not throw when cleanup fails", () => {
    mocks.cleanupSidecarFiles.mockImplementation(() => {
      throw new Error("disk error");
    });
    const doc = { importFile: { id: "file-1", filename: "data.xlsx" }, sheetIndex: 0 };

    expect(() => importJobAfterDeleteHook({ doc, req: {} } as any)).not.toThrow();
  });
});
