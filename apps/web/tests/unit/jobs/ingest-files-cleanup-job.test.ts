/**
 * Unit tests for the Ingest Files Cleanup Job Handler.
 *
 * Covers both passes: reclaiming processed files (terminal status past
 * retention) and sweeping unreferenced orphan files, including fresh reference
 * checks and fail-closed handling of database errors.
 *
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createLocalReq: vi.fn((_options, payload) => Promise.resolve({ payload })),
  initTransaction: vi.fn().mockResolvedValue(true),
  commitTransaction: vi.fn().mockResolvedValue(undefined),
  killTransaction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/database/drizzle-transaction", () => ({
  getTransactionAwareDrizzle: vi
    .fn()
    .mockResolvedValue({
      select: () => ({ from: () => ({ where: () => ({ for: () => Promise.resolve([]) }) }) }),
      execute: vi.fn().mockResolvedValue({}),
    }),
}));

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

  const setupFind = (opts: { reclaimDocs?: any[]; reclaimThrows?: boolean }) => {
    if (opts.reclaimThrows) mockPayload.find.mockRejectedValue(new Error("DB down (reclaim)"));
    else mockPayload.find.mockResolvedValue({ docs: opts.reclaimDocs ?? [] });
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
      count: vi.fn((args: any) =>
        Promise.resolve({ totalDocs: args.req && args.where.and && args.collection === "ingest-files" ? 1 : 0 })
      ),
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
      req: expect.objectContaining({ payload: mockPayload }),
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

  it("throws on an update failure and skips that unlink", async () => {
    setupFind({ reclaimDocs: [{ id: 2, filename: "url-import-b.csv" }] });
    mockPayload.update.mockRejectedValueOnce(new Error("write conflict"));
    await expect(ingestFilesCleanupJob.handler(createContext())).rejects.toThrow(
      "Ingest file cleanup failed for 1 operations"
    );
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

  it.each(["reclaim", "sweep"])("reports unlink errors during %s after processing the other files", async (phase) => {
    if (phase === "reclaim") {
      setupFind({
        reclaimDocs: [
          { id: 1, filename: "blocked.csv" },
          { id: 2, filename: "removed.csv" },
        ],
      });
    } else {
      setupFind({});
      mockReaddir.mockResolvedValue([dirent("blocked.csv"), dirent("removed.csv")]);
      mockStat.mockResolvedValue({ mtimeMs: now - 48 * HOUR });
    }
    mockUnlink.mockRejectedValueOnce(Object.assign(new Error("EACCES"), { code: "EACCES" }));

    await expect(ingestFilesCleanupJob.handler(createContext())).rejects.toThrow(
      "Ingest file cleanup failed for 1 operations"
    );

    expect(mockUnlink).toHaveBeenCalledTimes(2);
    expect(mockUnlink).toHaveBeenCalledWith(getIngestFilePath("removed.csv"));
  });

  it.each(["EACCES", "ENOENT"])("handles stat failure %s without deleting the unchecked file", async (code) => {
    setupFind({});
    mockReaddir.mockResolvedValue([dirent("unchecked.csv"), dirent("removed.csv")]);
    mockStat
      .mockRejectedValueOnce(Object.assign(new Error(code), { code }))
      .mockResolvedValue({ mtimeMs: now - 48 * HOUR });

    const result = ingestFilesCleanupJob.handler(createContext());
    if (code === "ENOENT") await expect(result).resolves.toMatchObject({ output: { orphansDeleted: 1, errors: 0 } });
    else await expect(result).rejects.toThrow("Ingest file cleanup failed for 1 operations");

    expect(mockUnlink).toHaveBeenCalledExactlyOnceWith(getIngestFilePath("removed.csv"));
  });

  it("sweeps aged orphans, keeps referenced files, and skips too-new orphans", async () => {
    setupFind({});
    mockPayload.count.mockImplementation((args: any) =>
      Promise.resolve({ totalDocs: args.where.filename.equals === "keep.csv" ? 1 : 0 })
    );
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

  it("preserves a reference that becomes visible when the directory is read", async () => {
    setupFind({});
    mockReaddir.mockImplementation(() => {
      mockPayload.count.mockResolvedValue({ totalDocs: 1 });
      return Promise.resolve([dirent("newly-referenced.csv")]);
    });
    mockStat.mockResolvedValue({ mtimeMs: now - 72 * HOUR });

    const result = await ingestFilesCleanupJob.handler(createContext());

    expect(mockUnlink).not.toHaveBeenCalled();
    expect(result.output.orphansDeleted).toBe(0);
    expect(mockPayload.count).toHaveBeenCalledWith({
      collection: "ingest-files",
      where: { filename: { equals: "newly-referenced.csv" } },
      overrideAccess: true,
    });
  });

  it("rechecks the next file after processing the previous one", async () => {
    setupFind({});
    mockReaddir.mockResolvedValue([dirent("orphan.csv"), dirent("now-referenced.csv")]);
    mockStat.mockResolvedValue({ mtimeMs: now - 72 * HOUR });
    mockUnlink.mockImplementation(() => {
      mockPayload.count.mockResolvedValue({ totalDocs: 1 });
      return Promise.resolve();
    });

    await ingestFilesCleanupJob.handler(createContext());

    expect(mockUnlink).toHaveBeenCalledExactlyOnceWith(getIngestFilePath("orphan.csv"));
  });

  it("clears legacy orphans when no rows reference any file (count 0)", async () => {
    // The 1031-file scenario: all rows reclaimed already, only orphans remain.
    setupFind({});
    mockPayload.count.mockResolvedValue({ totalDocs: 0 });
    mockReaddir.mockResolvedValue([dirent("a.csv"), dirent("b.csv"), dirent("c.csv")]);
    mockStat.mockResolvedValue({ mtimeMs: now - 72 * HOUR });
    const result = await ingestFilesCleanupJob.handler(createContext());
    expect(mockUnlink).toHaveBeenCalledTimes(3);
    expect(result.output.orphansDeleted).toBe(3);
  });

  it.each(["initial", "locked"])("aborts deletion if the %s reference check fails", async (phase) => {
    setupFind({});
    mockReaddir.mockResolvedValue([dirent("unchecked.csv")]);
    mockStat.mockResolvedValue({ mtimeMs: now - 72 * HOUR });
    if (phase === "locked") mockPayload.count.mockResolvedValueOnce({ totalDocs: 0 });
    mockPayload.count.mockRejectedValueOnce(new Error("Reference count unavailable"));

    await expect(ingestFilesCleanupJob.handler(createContext())).rejects.toThrow("Reference count unavailable");

    if (phase === "initial") expect(mockStat).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("does not throw when the upload directory does not exist", async () => {
    setupFind({});
    mockReaddir.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const result = await ingestFilesCleanupJob.handler(createContext());
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
