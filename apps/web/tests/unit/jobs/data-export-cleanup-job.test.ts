/* eslint-disable sonarjs/publicly-writable-directories -- test fixtures use mock paths */
/**
 * Unit tests for Data Export Cleanup Job Handler.
 *
 * Tests the data-export-cleanup job which expires ready exports,
 * deletes files from disk, and removes old failed/expired records.
 *
 * @module
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({ unlink: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logError: vi.fn(),
}));

import { dataExportCleanupJob } from "@/lib/jobs/handlers/data-export-cleanup-job";
import { logError } from "@/lib/logger";

describe.sequential("dataExportCleanupJob", () => {
  let mockPayload: any;
  let mockUnlink: any;

  const createContext = () => ({ job: { id: "cleanup-job-1" }, req: { payload: mockPayload } });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-import and re-apply unlink mock after clearAllMocks
    const fsp = await import("node:fs/promises");
    mockUnlink = fsp.unlink as any;
    mockUnlink.mockResolvedValue(undefined);

    mockPayload = {
      findByID: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    };
  });

  it("should return zero counts when no expired exports exist", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 })
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 });

    const result = await dataExportCleanupJob.handler(createContext() as any);

    expect(result.output).toEqual({ success: true, filesDeleted: 0, recordsUpdated: 0, recordsDeleted: 0, errors: 0 });
  });

  it("should update expired exports and delete their files", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: 1, filePath: "/tmp/export-1.zip", status: "ready" }], totalDocs: 1 })
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 });

    const result = await dataExportCleanupJob.handler(createContext() as any);

    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "data-exports",
      id: 1,
      data: { status: "expired", filePath: null },
      overrideAccess: true,
    });

    expect(mockUnlink).toHaveBeenCalledWith("/tmp/export-1.zip");

    expect(result.output).toEqual({ success: true, filesDeleted: 1, recordsUpdated: 1, recordsDeleted: 0, errors: 0 });
  });

  it("should handle file error when unlink throws", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: 2, filePath: "/tmp/missing.zip", status: "ready" }], totalDocs: 1 })
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 });

    mockUnlink.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await dataExportCleanupJob.handler(createContext() as any);

    expect(result.output.recordsUpdated).toBe(1);
    expect(result.output.filesDeleted).toBe(0);
    expect(result.output.errors).toBe(0);
  });

  it("should increment errors when per-record update fails", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: 3, filePath: "/tmp/export-3.zip", status: "ready" }], totalDocs: 1 })
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 });

    mockPayload.update.mockRejectedValueOnce(new Error("DB connection lost"));

    const result = await dataExportCleanupJob.handler(createContext() as any);

    expect(result.output.errors).toBe(1);
    expect(logError).toHaveBeenCalledWith(expect.any(Error), "Failed to clean up export", { exportId: 3 });
  });

  it("should find and delete old failed/expired records", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [], totalDocs: 0 }).mockResolvedValueOnce({
      docs: [
        { id: 10, status: "failed" },
        { id: 11, status: "expired" },
      ],
      totalDocs: 2,
    });

    const result = await dataExportCleanupJob.handler(createContext() as any);

    expect(mockPayload.delete).toHaveBeenCalledTimes(2);
    expect(mockPayload.delete).toHaveBeenCalledWith({ collection: "data-exports", id: 10, overrideAccess: true });
    expect(mockPayload.delete).toHaveBeenCalledWith({ collection: "data-exports", id: 11, overrideAccess: true });
    expect(result.output.recordsDeleted).toBe(2);
  });

  it("should increment errors and continue when old record delete fails", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [], totalDocs: 0 }).mockResolvedValueOnce({
      docs: [
        { id: 20, status: "expired" },
        { id: 21, status: "failed" },
      ],
      totalDocs: 2,
    });

    mockPayload.delete.mockRejectedValueOnce(new Error("Delete failed")).mockResolvedValueOnce({});

    const result = await dataExportCleanupJob.handler(createContext() as any);

    expect(result.output.recordsDeleted).toBe(1);
    expect(result.output.errors).toBe(1);
    expect(logError).toHaveBeenCalledWith(expect.any(Error), "Failed to delete old export record", { exportId: 20 });
  });

  it("should throw on overall handler error for retry", async () => {
    mockPayload.find.mockRejectedValueOnce(new Error("Database unavailable"));

    await expect(dataExportCleanupJob.handler(createContext() as any)).rejects.toThrow("Database unavailable");
  });
});
