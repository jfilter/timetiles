/**
 * Unit tests for the Ingest Files Cleanup Job Handler.
 *
 * Covers both passes: reclaiming processed files (terminal status past
 * retention) and sweeping unreferenced orphan files, including the safety
 * guard that aborts the sweep when the referenced set looks inconsistent.
 *
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ mtimeMs: 0 }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logError: vi.fn(),
}));

vi.mock("@/lib/config/env", () => ({
  getEnv: () => ({ UPLOAD_DIR: "uploads", INGEST_FILE_RETENTION_HOURS: 24, INGEST_FILE_ORPHAN_GRACE_HOURS: 12 }),
}));

import { getIngestFilePath } from "@/lib/ingest/upload-path";
import { ingestFilesCleanupJob } from "@/lib/jobs/handlers/ingest-files-cleanup-job";
import { logError } from "@/lib/logger";

const HOUR = 60 * 60 * 1000;
const now = Date.now();
const dirent = (name: string, isFile = true) => ({ name, isFile: () => isFile });

describe.sequential("ingestFilesCleanupJob", () => {
  let mockPayload: any;
  let mockUnlink: any;
  let mockReaddir: any;
  let mockStat: any;

  const createContext = () => ({ job: { id: "ingest-cleanup-1" }, req: { payload: mockPayload } });

  // Configure the shared `find` mock to branch on the query: the reclaim scan
  // selects `status`, the referenced-filenames scan does not.
  const setupFind = (opts: {
    reclaimDocs?: any[];
    referencedDocs?: any[];
    reclaimThrows?: boolean;
    referencedThrows?: boolean;
  }) => {
    mockPayload.find = vi.fn((args: any) => {
      if (args.select?.status) {
        if (opts.reclaimThrows) return Promise.reject(new Error("DB down (reclaim)"));
        return Promise.resolve({ docs: opts.reclaimDocs ?? [] });
      }
      if (opts.referencedThrows) return Promise.reject(new Error("DB down (referenced)"));
      return Promise.resolve({ docs: opts.referencedDocs ?? [] });
    });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const fsp = await import("node:fs/promises");
    mockUnlink = fsp.unlink as any;
    mockReaddir = fsp.readdir as any;
    mockStat = fsp.stat as any;
    mockUnlink.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    mockStat.mockResolvedValue({ mtimeMs: now });

    mockPayload = {
      find: vi.fn().mockResolvedValue({ docs: [] }),
      count: vi.fn().mockResolvedValue({ totalDocs: 0 }),
      update: vi.fn().mockResolvedValue({}),
    };
  });

  it("returns zero counts when nothing to reclaim or sweep", async () => {
    setupFind({});
    const result = await ingestFilesCleanupJob.handler(createContext());
    expect(result.output).toEqual({
      success: true,
      recordsReclaimed: 0,
      filesDeleted: 0,
      orphansDeleted: 0,
      orphansSkippedTooNew: 0,
      swept: true,
      errors: 0,
    });
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("reclaims a processed file: nulls the file reference, then unlinks", async () => {
    setupFind({ reclaimDocs: [{ id: 1, filename: "url-import-a.csv" }] });
    const result = await ingestFilesCleanupJob.handler(createContext());

    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "ingest-files",
      id: 1,
      data: { filename: null, filesize: null, mimeType: null },
      context: { skipIngestFileHooks: true },
      overrideAccess: true,
    });
    expect(mockUnlink).toHaveBeenCalledWith(getIngestFilePath("url-import-a.csv"));
    expect(result.output.recordsReclaimed).toBe(1);
    expect(result.output.filesDeleted).toBe(1);
  });

  it("nulls the DB reference before unlinking (orphan-safe ordering)", async () => {
    const calls: string[] = [];
    setupFind({ reclaimDocs: [{ id: 7, filename: "url-import-x.csv" }] });
    mockPayload.update.mockImplementation(() => {
      calls.push("update");
      return Promise.resolve({});
    });
    mockUnlink.mockImplementation(() => {
      calls.push("unlink");
      return Promise.resolve();
    });
    await ingestFilesCleanupJob.handler(createContext());
    expect(calls).toEqual(["update", "unlink"]);
  });

  it("counts an update failure as an error and skips that unlink", async () => {
    setupFind({ reclaimDocs: [{ id: 2, filename: "url-import-b.csv" }] });
    mockPayload.update.mockRejectedValueOnce(new Error("write conflict"));
    const result = await ingestFilesCleanupJob.handler(createContext());
    expect(result.output.errors).toBe(1);
    expect(result.output.recordsReclaimed).toBe(0);
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(expect.any(Error), "Failed to reclaim ingest-file record", {
      ingestFileId: 2,
    });
  });

  it("treats a missing file (unlink reject) as non-fatal", async () => {
    setupFind({ reclaimDocs: [{ id: 3, filename: "gone.csv" }] });
    mockUnlink.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const result = await ingestFilesCleanupJob.handler(createContext());
    expect(result.output.recordsReclaimed).toBe(1);
    expect(result.output.filesDeleted).toBe(0);
    expect(result.output.errors).toBe(0);
  });

  it("sweeps aged orphans, keeps referenced files, and skips too-new orphans", async () => {
    setupFind({ referencedDocs: [{ filename: "keep.csv" }] });
    mockPayload.count.mockResolvedValue({ totalDocs: 1 });
    mockReaddir.mockResolvedValue([dirent("keep.csv"), dirent("old-orphan.csv"), dirent("new-orphan.csv")]);
    mockStat.mockImplementation((p: string) => {
      const name = p.split("/").pop();
      if (name === "old-orphan.csv") return Promise.resolve({ mtimeMs: now - 48 * HOUR });
      return Promise.resolve({ mtimeMs: now - 1 * HOUR }); // within 12h grace
    });

    const result = await ingestFilesCleanupJob.handler(createContext());

    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockUnlink).toHaveBeenCalledWith(getIngestFilePath("old-orphan.csv"));
    expect(result.output.orphansDeleted).toBe(1);
    expect(result.output.orphansSkippedTooNew).toBe(1);
    expect(result.output.swept).toBe(true);
  });

  it("ignores subdirectories during the sweep", async () => {
    setupFind({});
    mockReaddir.mockResolvedValue([dirent("subdir", false), dirent("old-orphan.csv")]);
    mockStat.mockResolvedValue({ mtimeMs: now - 48 * HOUR });
    const result = await ingestFilesCleanupJob.handler(createContext());
    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockUnlink).toHaveBeenCalledWith(getIngestFilePath("old-orphan.csv"));
    expect(result.output.orphansDeleted).toBe(1);
  });

  it("clears legacy orphans when no rows reference any file (count 0)", async () => {
    // The 1031-file scenario: all rows reclaimed already, only orphans remain.
    setupFind({ referencedDocs: [] });
    mockPayload.count.mockResolvedValue({ totalDocs: 0 });
    mockReaddir.mockResolvedValue([dirent("a.csv"), dirent("b.csv"), dirent("c.csv")]);
    mockStat.mockResolvedValue({ mtimeMs: now - 72 * HOUR });
    const result = await ingestFilesCleanupJob.handler(createContext());
    expect(mockUnlink).toHaveBeenCalledTimes(3);
    expect(result.output.orphansDeleted).toBe(3);
    expect(result.output.swept).toBe(true);
  });

  it("aborts the sweep when the referenced set looks incomplete (DB inconsistency)", async () => {
    setupFind({ referencedDocs: [] }); // loaded 0 ...
    mockPayload.count.mockResolvedValue({ totalDocs: 5 }); // ... but 5 rows exist
    mockReaddir.mockResolvedValue([dirent("a.csv")]);
    mockStat.mockResolvedValue({ mtimeMs: now - 72 * HOUR });
    const result = await ingestFilesCleanupJob.handler(createContext());
    expect(result.output.swept).toBe(false);
    expect(result.output.orphansDeleted).toBe(0);
    expect(mockReaddir).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("aborts the sweep when loading referenced filenames throws", async () => {
    setupFind({ referencedThrows: true });
    mockPayload.count.mockResolvedValue({ totalDocs: 5 });
    mockReaddir.mockResolvedValue([dirent("a.csv")]);
    const result = await ingestFilesCleanupJob.handler(createContext());
    expect(result.output.swept).toBe(false);
    expect(mockReaddir).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("does not throw when the upload directory does not exist", async () => {
    setupFind({});
    mockReaddir.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const result = await ingestFilesCleanupJob.handler(createContext());
    expect(result.output.swept).toBe(true);
    expect(result.output.orphansDeleted).toBe(0);
  });

  it("rethrows on a reclaim-scan failure so Payload retries", async () => {
    setupFind({ reclaimThrows: true });
    await expect(ingestFilesCleanupJob.handler(createContext() as any)).rejects.toThrow("DB down (reclaim)");
  });

  it("is scheduled hourly on the maintenance queue", () => {
    expect(ingestFilesCleanupJob.slug).toBe("ingest-files-cleanup");
    expect(ingestFilesCleanupJob.schedule[0]!.cron).toBe("0 * * * *");
    expect(ingestFilesCleanupJob.schedule[0]!.queue).toBe("maintenance");
  });
});
