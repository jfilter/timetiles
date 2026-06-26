/**
 * Background job for reclaiming and sweeping ingest CSV upload files.
 *
 * The `ingest-files` collection is a Payload upload collection backed by local
 * disk (`${UPLOAD_DIR}/ingest-files`). The raw CSV is transient working data
 * (see ADR 0004): once events/datasets are persisted it is no longer needed.
 * Nothing in the pipeline ever deletes it, so files accumulate two ways:
 *
 * 1. **Leak at creation.** `urlFetchJob` calls `payload.create({ file })`, which
 *    writes the file to disk AND inserts the row. The file write is a filesystem
 *    side-effect, not part of the DB transaction — when the job's transaction
 *    rolls back or a retry fails after the file is written, the row is gone but
 *    the file stays (orphan with no record).
 * 2. **No reclaim after success.** Completed records keep their file forever.
 *
 * This job, modeled on {@link dataExportCleanupJob}, runs hourly and:
 * - **Pass A (reclaim):** for records in a terminal status past the retention
 *   window, unlinks the file and nulls the file reference (keeps the row so
 *   dedup/audit still work). DB is updated before the unlink so a crash leaves a
 *   true orphan that Pass B later collects — never a row pointing at a missing file.
 * - **Pass B (orphan sweep):** unlinks files on disk referenced by no row and
 *   older than a grace window. A safety guard aborts the sweep if the referenced
 *   set looks inconsistent, so a transient DB error can never mass-delete files.
 *
 * @module
 * @category Jobs
 */
import { readdir, stat, unlink } from "node:fs/promises";

import { getEnv } from "@/lib/config/env";
import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { getIngestFilePath, getIngestFilesDir } from "@/lib/ingest/upload-path";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { asSystem, type SystemPayload } from "@/lib/services/system-payload";

/** Max concurrent `unlink()` calls per chunk. Bounded to avoid overwhelming the FS. */
const UNLINK_CONCURRENCY = 10;
/** Page size for the reclaim candidate scan. */
const RECLAIM_PAGE_SIZE = 200;
/** Page size for loading referenced filenames in the orphan sweep. */
const REF_PAGE_SIZE = 500;
/** Cap reclaim candidate pages per run so the first run can't block the queue. */
const MAX_RECLAIM_PAGES = 25;
/** Below this fraction of the counted referenced rows, treat the set as suspect and abort the sweep. */
const REF_LOAD_MIN_FRACTION = 0.5;
const HOUR_MS = 60 * 60 * 1000;

/** A row narrowed to the fields the cleanup scans select. */
interface IngestFileRow {
  id: number | string;
  filename?: string | null;
}

const isENOENT = (e: unknown): boolean =>
  typeof e === "object" && e !== null && (e as { code?: unknown }).code === "ENOENT";

/**
 * Unlink absolute paths in bounded-concurrency chunks. One failing unlink (e.g.
 * already deleted) must not block the others. ENOENT and other rejections are
 * logged but not fatal — the DB reference is already gone, so there is no orphan
 * risk. Returns the count actually removed.
 */
const unlinkPaths = async (paths: string[]): Promise<number> => {
  let deleted = 0;
  for (let i = 0; i < paths.length; i += UNLINK_CONCURRENCY) {
    const chunk = paths.slice(i, i + UNLINK_CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((p) => unlink(p)));
    for (let j = 0; j < results.length; j++) {
      const result = results[j]!;
      if (result.status === "fulfilled") {
        deleted++;
      } else {
        logger.warn({ path: chunk[j], error: result.reason }, "Could not delete ingest file (may already be deleted)");
      }
    }
  }
  return deleted;
};

/**
 * Pass A — reclaim disk space from processed ingests.
 *
 * Collects terminal-status candidates first (stable pagination — no mutation
 * during the scan), then nulls each file reference and unlinks the file.
 */
const reclaimProcessedFiles = async (
  sys: SystemPayload,
  nowMs: number
): Promise<{ recordsReclaimed: number; filesDeleted: number; errors: number }> => {
  const cutoff = new Date(nowMs - getEnv().INGEST_FILE_RETENTION_HOURS * HOUR_MS).toISOString();

  // Stable scan: gather candidates before mutating anything.
  const candidates: IngestFileRow[] = [];
  for (let page = 1; page <= MAX_RECLAIM_PAGES; page++) {
    const res = await sys.find({
      collection: COLLECTION_NAMES.INGEST_FILES,
      where: {
        and: [
          { filename: { not_equals: null } },
          {
            or: [
              { and: [{ status: { equals: "completed" } }, { completedAt: { less_than: cutoff } }] },
              { and: [{ status: { equals: "failed" } }, { updatedAt: { less_than: cutoff } }] },
            ],
          },
        ],
      },
      select: { filename: true, status: true },
      depth: 0,
      limit: RECLAIM_PAGE_SIZE,
      page,
    });
    const docs = res.docs as IngestFileRow[];
    candidates.push(...docs);
    if (docs.length < RECLAIM_PAGE_SIZE) break;
  }

  let recordsReclaimed = 0;
  let errors = 0;
  const pendingPaths: string[] = [];
  for (const doc of candidates) {
    try {
      // DB first: null the file reference. A crash before the unlink leaves a
      // true orphan that Pass B reclaims — never a row pointing at a gone file.
      await sys.update({
        collection: COLLECTION_NAMES.INGEST_FILES,
        id: doc.id,
        data: { filename: null, filesize: null, mimeType: null },
        context: { skipIngestFileHooks: true },
      });
      recordsReclaimed++;
      if (doc.filename) pendingPaths.push(getIngestFilePath(doc.filename));
    } catch (error) {
      errors++;
      logError(error, "Failed to reclaim ingest-file record", { ingestFileId: doc.id });
    }
  }

  const filesDeleted = await unlinkPaths(pendingPaths);
  return { recordsReclaimed, filesDeleted, errors };
};

/**
 * Load the set of filenames still referenced by a row. Returns `null` to signal
 * the orphan sweep must abort (DB error or a suspiciously incomplete set), so a
 * transient failure can never make every file look like an orphan.
 */
const loadReferencedFilenames = async (sys: SystemPayload): Promise<Set<string> | null> => {
  try {
    const { totalDocs: refCount } = await sys.count({
      collection: COLLECTION_NAMES.INGEST_FILES,
      where: { filename: { not_equals: null } },
    });

    const referenced = new Set<string>();
    for (let page = 1; ; page++) {
      const res = await sys.find({
        collection: COLLECTION_NAMES.INGEST_FILES,
        where: { filename: { not_equals: null } },
        select: { filename: true },
        depth: 0,
        limit: REF_PAGE_SIZE,
        page,
      });
      const docs = res.docs as IngestFileRow[];
      for (const doc of docs) if (doc.filename) referenced.add(doc.filename);
      if (docs.length < REF_PAGE_SIZE) break;
    }

    // Guard: refCount==0 with an empty set is the legitimate "everything
    // reclaimed, only orphans remain" state (and is exactly how legacy orphans
    // get cleared) — allow it. Abort only when rows exist but we failed to load
    // (most of) them.
    if (refCount > 0 && referenced.size < refCount * REF_LOAD_MIN_FRACTION) {
      logger.warn(
        { refCount, referencedLoaded: referenced.size },
        "Orphan sweep aborted: referenced set looks incomplete"
      );
      return null;
    }
    return referenced;
  } catch (error) {
    logError(error, "Orphan sweep aborted: failed to load referenced filenames");
    return null;
  }
};

/**
 * Pass B — sweep physical files no row references and older than the grace window.
 */
const sweepOrphans = async (
  sys: SystemPayload,
  nowMs: number
): Promise<{ orphansDeleted: number; orphansSkippedTooNew: number; swept: boolean }> => {
  const referenced = await loadReferencedFilenames(sys);
  if (referenced === null) return { orphansDeleted: 0, orphansSkippedTooNew: 0, swept: false };

  const graceCutoff = nowMs - getEnv().INGEST_FILE_ORPHAN_GRACE_HOURS * HOUR_MS;
  const dir = getIngestFilesDir();

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isENOENT(error)) return { orphansDeleted: 0, orphansSkippedTooNew: 0, swept: true };
    throw error;
  }

  let orphansSkippedTooNew = 0;
  const orphanPaths: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (referenced.has(entry.name)) continue;
    const full = getIngestFilePath(entry.name);
    try {
      const st = await stat(full);
      if (st.mtimeMs < graceCutoff) {
        orphanPaths.push(full);
      } else {
        orphansSkippedTooNew++;
      }
    } catch (error) {
      if (!isENOENT(error)) logger.warn({ path: full, error }, "Could not stat ingest file during sweep");
    }
  }

  const orphansDeleted = await unlinkPaths(orphanPaths);
  return { orphansDeleted, orphansSkippedTooNew, swept: true };
};

/**
 * Scheduled job for reclaiming processed ingest files and sweeping orphans.
 */
export const ingestFilesCleanupJob = {
  slug: "ingest-files-cleanup",
  schedule: [{ cron: "0 * * * *", queue: "maintenance" as const }], // hourly
  concurrency: () => "ingest-files-cleanup",
  retries: 2,
  handler: async ({ job, req }: JobHandlerContext) => {
    const sys = asSystem(req.payload);
    try {
      logger.info({ jobId: job?.id }, "Starting ingest-files cleanup job");
      const nowMs = Date.now();

      const reclaim = await reclaimProcessedFiles(sys, nowMs);
      const sweep = await sweepOrphans(sys, nowMs);

      const output = {
        success: true,
        recordsReclaimed: reclaim.recordsReclaimed,
        filesDeleted: reclaim.filesDeleted,
        orphansDeleted: sweep.orphansDeleted,
        orphansSkippedTooNew: sweep.orphansSkippedTooNew,
        swept: sweep.swept,
        errors: reclaim.errors,
      };
      logger.info({ jobId: job?.id, ...output }, "Ingest-files cleanup job completed");
      return { output };
    } catch (error) {
      logError(error, "Ingest-files cleanup job failed", { jobId: job?.id });
      throw error;
    }
  },
};
