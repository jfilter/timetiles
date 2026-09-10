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
 *   older than a grace window. Each filename is checked through Payload before
 *   processing it; a database error aborts the sweep rather than implying absence.
 *
 * @module
 * @category Jobs
 */
import { readdir, stat, unlink } from "node:fs/promises";

import { eq, sql } from "@payloadcms/db-postgres/drizzle";
import type { Where } from "payload";
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";

import { getEnv } from "@/lib/config/env";
import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { getIngestFilePath, getIngestFilesDir } from "@/lib/ingest/upload-path";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { asSystem, type SystemPayload } from "@/lib/services/system-payload";
import { isENOENT } from "@/lib/utils/is-enoent";
import { ingest_files } from "@/payload-generated-schema";

/** Max concurrent `unlink()` calls per chunk. Bounded to avoid overwhelming the FS. */
const UNLINK_CONCURRENCY = 10;
/** Page size for the reclaim candidate scan. */
const RECLAIM_PAGE_SIZE = 200;
/** Cap reclaim candidate pages per run so the first run can't block the queue. */
const MAX_RECLAIM_PAGES = 25;
const HOUR_MS = 60 * 60 * 1000;

/** A row narrowed to the fields the cleanup scans select. */
interface IngestFileRow {
  id: number;
  filename?: string | null;
}

/**
 * Unlink absolute paths in bounded-concurrency chunks without blocking other files
 * on one failure. Missing files are already cleaned; other errors fail the job.
 * A failed deletion after reclaim leaves an orphan for a later sweep.
 */
const unlinkPaths = async (paths: string[]): Promise<{ deleted: number; errors: number }> => {
  let deleted = 0;
  let errors = 0;
  for (let i = 0; i < paths.length; i += UNLINK_CONCURRENCY) {
    const chunk = paths.slice(i, i + UNLINK_CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((p) => unlink(p)));
    for (let j = 0; j < results.length; j++) {
      const result = results[j]!;
      if (result.status === "fulfilled") {
        deleted++;
      } else if (!isENOENT(result.reason)) {
        errors++;
        logger.warn({ path: chunk[j], error: result.reason }, "Could not delete ingest file");
      }
    }
  }
  return { deleted, errors };
};

/** Recovery takes the same file lock before changing a job stage or queueing work. */
const reclaimEligibleFile = async (sys: SystemPayload, doc: IngestFileRow, where: Where): Promise<boolean> => {
  if (!doc.filename) return false;
  const req = await createLocalReq({}, sys.payload);
  if (!(await initTransaction(req))) throw new Error("Ingest file cleanup requires a database transaction");
  try {
    const db = await getTransactionAwareDrizzle(sys.payload, req);
    await db.select({ id: ingest_files.id }).from(ingest_files).where(eq(ingest_files.id, doc.id)).for("update");
    const eligible = await sys.count({
      collection: COLLECTION_NAMES.INGEST_FILES,
      where: { and: [where, { id: { equals: doc.id } }, { filename: { equals: doc.filename } }] },
      req,
    });
    // Also protect active/review jobs left with an outdated aggregate file status.
    const active = await sys.count({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      where: {
        and: [
          { ingestFile: { equals: doc.id } },
          { stage: { not_in: [PROCESSING_STAGE.COMPLETED, PROCESSING_STAGE.FAILED] } },
        ],
      },
      req,
    });
    const reclaim = eligible.totalDocs > 0 && active.totalDocs === 0;
    if (reclaim)
      await sys.update({
        collection: COLLECTION_NAMES.INGEST_FILES,
        id: doc.id,
        data: { filename: null, filesize: null, mimeType: null },
        context: { skipIngestFileHooks: true },
        req,
      });
    await commitTransaction(req);
    return reclaim;
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
};

/**
 * Pass A — reclaim disk space from processed ingests.
 *
 * Collects terminal-status candidates before this pass mutates them, then
 * rechecks each under a row lock before nulling its reference and unlinking.
 */
const reclaimProcessedFiles = async (
  sys: SystemPayload,
  nowMs: number
): Promise<{ recordsReclaimed: number; filesDeleted: number; errors: number }> => {
  const cutoff = new Date(nowMs - getEnv().INGEST_FILE_RETENTION_HOURS * HOUR_MS).toISOString();
  const where: Where = {
    and: [
      { filename: { not_equals: null } },
      {
        or: [
          { and: [{ status: { equals: "completed" } }, { completedAt: { less_than: cutoff } }] },
          { and: [{ status: { equals: "failed" } }, { updatedAt: { less_than: cutoff } }] },
        ],
      },
    ],
  };

  // Gather candidates first; concurrent recoveries are checked again below.
  const candidates: IngestFileRow[] = [];
  for (let page = 1; page <= MAX_RECLAIM_PAGES; page++) {
    const res = await sys.find({
      collection: COLLECTION_NAMES.INGEST_FILES,
      where,
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
      if (!(await reclaimEligibleFile(sys, doc, where))) continue;
      recordsReclaimed++;
      if (doc.filename) pendingPaths.push(getIngestFilePath(doc.filename));
    } catch (error) {
      errors++;
      logError(error, "Failed to reclaim ingest-file record", { ingestFileId: doc.id });
    }
  }

  const unlinked = await unlinkPaths(pendingPaths);
  return { recordsReclaimed, filesDeleted: unlinked.deleted, errors: errors + unlinked.errors };
};

/** Sidecar CSVs remain owned by the row referencing their source file. */
const fileReferenceWhere = (filename: string): Where => {
  const source = filename.replace(/\.sheet\d+\.csv$/, "");
  return source === filename ? { filename: { equals: filename } } : { filename: { in: [filename, source] } };
};

/**
 * Pass B — sweep physical files no row references and older than the grace window.
 */
const unlinkOrphan = async (sys: SystemPayload, filename: string): Promise<{ deleted: number; errors: number }> => {
  const req = await createLocalReq({}, sys.payload);
  if (!(await initTransaction(req))) throw new Error("Orphan cleanup requires a database transaction");
  try {
    const db = await getTransactionAwareDrizzle(sys.payload, req);
    // An absent row cannot be row-locked. Only for aged orphan candidates,
    // briefly exclude table writes through the final check and filesystem unlink.
    // This also waits for references being committed by an in-flight writer.
    await db.execute(sql`LOCK TABLE ${ingest_files} IN SHARE MODE`);
    const { totalDocs } = await sys.count({
      collection: COLLECTION_NAMES.INGEST_FILES,
      where: fileReferenceWhere(filename),
      req,
    });
    const result = totalDocs === 0 ? await unlinkPaths([getIngestFilePath(filename)]) : { deleted: 0, errors: 0 };
    await commitTransaction(req);
    return result;
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
};

const sweepOrphans = async (
  sys: SystemPayload,
  nowMs: number
): Promise<{ orphansDeleted: number; orphansSkippedTooNew: number; errors: number }> => {
  const graceCutoff = nowMs - getEnv().INGEST_FILE_ORPHAN_GRACE_HOURS * HOUR_MS;
  const dir = getIngestFilesDir();

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isENOENT(error)) return { orphansDeleted: 0, orphansSkippedTooNew: 0, errors: 0 };
    throw error;
  }

  let orphansSkippedTooNew = 0;
  let errors = 0;
  let orphansDeleted = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    // Do not infer absence from a paginated snapshot: concurrent writes can
    // shift its pages or publish references after the snapshot was loaded.
    const { totalDocs } = await sys.count({
      collection: COLLECTION_NAMES.INGEST_FILES,
      where: fileReferenceWhere(entry.name),
    });
    if (totalDocs > 0) continue;
    const full = getIngestFilePath(entry.name);
    let st;
    try {
      st = await stat(full);
    } catch (error) {
      if (!isENOENT(error)) {
        errors++;
        logger.warn({ path: full, error }, "Could not stat ingest file during sweep");
      }
      continue;
    }
    if (st.mtimeMs < graceCutoff) {
      const unlinked = await unlinkOrphan(sys, entry.name);
      orphansDeleted += unlinked.deleted;
      errors += unlinked.errors;
    } else {
      orphansSkippedTooNew++;
    }
  }

  return { orphansDeleted, orphansSkippedTooNew, errors };
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
        errors: reclaim.errors + sweep.errors,
      };
      if (output.errors > 0) {
        throw new Error(`Ingest file cleanup failed for ${output.errors} operations`);
      }
      logger.info({ jobId: job?.id, ...output }, "Ingest-files cleanup job completed");
      return { output };
    } catch (error) {
      logError(error, "Ingest-files cleanup job failed", { jobId: job?.id });
      throw error;
    }
  },
};
