/**
 * Background job for cleaning up expired data exports.
 *
 * Export archives contain the user's complete personal data, so the record and
 * its file must be retired together. This scheduled job runs periodically to:
 * - Expire ready exports past their `expiresAt` and delete their ZIPs
 * - Purge records older than 30 days, unlinking any file they still point at
 * - Fail exports abandoned in 'pending'/'processing' by a killed worker
 *
 * @module
 * @category Jobs
 */
import { ACTIVE_DATA_EXPORT_STATUSES } from "@/lib/export/data-export-statuses";
import { unlinkExportFile } from "@/lib/export/unlink-export-file";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import type { SystemPayload } from "@/lib/services/system-payload";
import { asSystem } from "@/lib/services/system-payload";

/** Collection slug for data exports. */
const DATA_EXPORTS = "data-exports" as const;

/** Max concurrent `unlink()` calls per chunk. Bounded to avoid overwhelming the FS. */
const UNLINK_CONCURRENCY = 10;

/** Days a failed/expired record is retained before the row itself is purged. */
const RECORD_RETENTION_DAYS = 30;

/**
 * Hours after `requestedAt` before an export still in "pending"/"processing" is
 * considered abandoned and flipped to "failed".
 *
 * `POST /api/data-exports/request` refuses a new request while ANY record for
 * the user sits in those states, so a worker killed mid-run (OOM, redeploy)
 * locks the user out of exporting forever — nothing else in the system ever
 * heals that record. More generous than the 4h used by the scraper/ingest
 * reapers because archiving streams every event in an account.
 */
const STALE_EXPORT_HOURS = 6;

/** Per-pass tally folded into the job output. */
interface PassResult {
  filesDeleted?: number;
  recordsUpdated?: number;
  recordsDeleted?: number;
  staleFailed?: number;
  errors?: number;
}

type PendingUnlink = { exportId: string | number; filePath: string };

/**
 * Pass 1: mark expired "ready" exports as expired and collect their files.
 *
 * Records are updated sequentially (Payload writes are cheap and serialize
 * naturally) and marked BEFORE the unlink so no download can race the cleanup.
 *
 * The status flips but `filePath` stays — it is cleared only once the file is actually gone
 * (see `unlinkPending`). Clearing it up front meant a transient unlink failure — I/O error,
 * unmounted volume, permissions — left a ZIP full of exported personal data on disk with no
 * record pointing at it, so neither this pass nor the later purge could ever remove it.
 * Already-expired records that still carry a path are picked up again here for that reason.
 */
const expireReadyExports = async (
  sys: SystemPayload,
  now: Date
): Promise<PassResult & { pending: PendingUnlink[] }> => {
  const expired = await sys.find({
    collection: DATA_EXPORTS,
    where: {
      or: [
        { and: [{ status: { equals: "ready" } }, { expiresAt: { less_than: now.toISOString() } }] },
        // Retry: expired earlier, but the file survived a failed unlink.
        { and: [{ status: { equals: "expired" } }, { filePath: { exists: true } }] },
      ],
    },
    limit: 100,
  });

  const pending: PendingUnlink[] = [];
  let recordsUpdated = 0;
  let errors = 0;

  for (const record of expired.docs) {
    try {
      if (record.status !== "expired") {
        await sys.update({ collection: DATA_EXPORTS, id: record.id, data: { status: "expired" } });
        recordsUpdated++;
      }
      if (record.filePath) pending.push({ exportId: record.id, filePath: record.filePath });
    } catch (error) {
      errors++;
      logError(error, "Failed to clean up export", { exportId: record.id });
    }
  }

  return { pending, recordsUpdated, errors };
};

/**
 * Pass 2: unlink files in bounded-concurrency chunks, then drop the path from the record.
 *
 * One failing unlink (e.g. already deleted) must not block the others. `filePath` is cleared
 * only when the file is confirmed gone — a path kept after a failed unlink is what lets the
 * next run retry instead of orphaning the archive.
 */
const unlinkPending = async (sys: SystemPayload, pending: PendingUnlink[]): Promise<number> => {
  let filesDeleted = 0;

  for (let i = 0; i < pending.length; i += UNLINK_CONCURRENCY) {
    const chunk = pending.slice(i, i + UNLINK_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async ({ exportId, filePath }) => {
        const outcome = await unlinkExportFile(exportId, filePath, "expiry");
        if (outcome === "failed") return false;

        try {
          await sys.update({ collection: DATA_EXPORTS, id: exportId, data: { filePath: null } });
        } catch (error) {
          // The file is gone either way; a stale path just means one more retry next run.
          logError(error, "Failed to clear export file path", { exportId });
        }
        return outcome === "deleted";
      })
    );
    filesDeleted += results.filter(Boolean).length;
  }

  return filesDeleted;
};

/**
 * Pass 3: purge failed/expired records older than the retention window.
 *
 * Deleting the record destroys the only pointer to its archive, so any file it
 * still references is unlinked first — otherwise a PII-bearing ZIP is orphaned
 * on disk permanently.
 */
const purgeOldRecords = async (sys: SystemPayload, now: Date): Promise<PassResult> => {
  const cutoff = new Date(now.getTime() - RECORD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const old = await sys.find({
    collection: DATA_EXPORTS,
    where: { and: [{ status: { in: ["failed", "expired"] } }, { requestedAt: { less_than: cutoff.toISOString() } }] },
    limit: 100,
  });

  let recordsDeleted = 0;
  let filesDeleted = 0;
  let errors = 0;

  for (const record of old.docs) {
    try {
      if (record.filePath) {
        const outcome = await unlinkExportFile(record.id, record.filePath, "purge");
        if (outcome === "deleted") filesDeleted++;
        // Deleting the record destroys the only pointer to the archive, so keep it until the
        // file is confirmed gone — the next hourly run retries. (An explicit comparison: the
        // outcome is a string now, and every string is truthy.)
        if (outcome === "failed") continue;
      }
      await sys.delete({ collection: DATA_EXPORTS, id: record.id });
      recordsDeleted++;
    } catch (error) {
      errors++;
      logError(error, "Failed to delete old export record", { exportId: record.id });
    }
  }

  return { recordsDeleted, filesDeleted, errors };
};

/**
 * Pass 4: fail exports abandoned in "pending"/"processing" past
 * {@link STALE_EXPORT_HOURS}, so the user is not locked out of exporting.
 */
const reapStaleExports = async (sys: SystemPayload, now: Date): Promise<PassResult> => {
  const cutoff = new Date(now.getTime() - STALE_EXPORT_HOURS * 60 * 60 * 1000);
  const stale = await sys.find({
    collection: DATA_EXPORTS,
    where: {
      and: [{ status: { in: [...ACTIVE_DATA_EXPORT_STATUSES] } }, { requestedAt: { less_than: cutoff.toISOString() } }],
    },
    limit: 100,
  });

  let staleFailed = 0;
  let errors = 0;

  for (const record of stale.docs) {
    try {
      await sys.update({
        collection: DATA_EXPORTS,
        id: record.id,
        data: {
          status: "failed",
          completedAt: now.toISOString(),
          errorLog: `Export abandoned — no progress for over ${STALE_EXPORT_HOURS}h (worker likely terminated)`,
        },
      });
      staleFailed++;
      logger.warn({ exportId: record.id, requestedAt: record.requestedAt }, "Failed abandoned data export");
    } catch (error) {
      errors++;
      logError(error, "Failed to reap stale export", { exportId: record.id });
    }
  }

  return { staleFailed, errors };
};

/**
 * Scheduled job for cleaning up expired data exports.
 */
export const dataExportCleanupJob = {
  slug: "data-export-cleanup",
  schedule: [{ cron: "0 * * * *", queue: "maintenance" as const }],
  concurrency: () => "data-export-cleanup",
  handler: async ({ job, req }: JobHandlerContext) => {
    const sys = asSystem(req.payload);

    try {
      logger.info({ jobId: job?.id }, "Starting data export cleanup job");

      const now = new Date();

      const expiry = await expireReadyExports(sys, now);
      const unlinked = await unlinkPending(sys, expiry.pending);
      const purge = await purgeOldRecords(sys, now);
      const stale = await reapStaleExports(sys, now);

      const output = {
        success: true,
        filesDeleted: unlinked + (purge.filesDeleted ?? 0),
        recordsUpdated: expiry.recordsUpdated ?? 0,
        recordsDeleted: purge.recordsDeleted ?? 0,
        staleFailed: stale.staleFailed ?? 0,
        errors: (expiry.errors ?? 0) + (purge.errors ?? 0) + (stale.errors ?? 0),
      };

      logger.info({ jobId: job?.id, ...output }, "Data export cleanup job completed");

      return { output };
    } catch (error) {
      logError(error, "Data export cleanup job failed", { jobId: job?.id });
      throw error;
    }
  },
};
