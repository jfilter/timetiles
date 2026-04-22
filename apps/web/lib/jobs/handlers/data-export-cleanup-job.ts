/**
 * Background job for cleaning up expired data exports.
 *
 * This scheduled job runs periodically to:
 * - Delete expired export ZIP files from disk
 * - Update export records to 'expired' status
 *
 * @module
 * @category Jobs
 */
import { unlink } from "node:fs/promises";

import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { asSystem } from "@/lib/services/system-payload";

/** Max concurrent `unlink()` calls per chunk. Bounded to avoid overwhelming the FS. */
const UNLINK_CONCURRENCY = 10;

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
      let filesDeleted = 0;
      let recordsUpdated = 0;
      let errors = 0;

      // Find all ready exports that have expired
      const expiredExports = await sys.find({
        collection: "data-exports",
        where: { and: [{ status: { equals: "ready" } }, { expiresAt: { less_than: now.toISOString() } }] },
        limit: 100,
      });

      logger.info({ count: expiredExports.docs.length, jobId: job?.id }, "Found expired exports to clean up");

      // Pass 1: mark records as expired (sequential — Payload updates are cheap and serialize
      // naturally in the write path). Collect file paths to unlink in the next pass.
      type PendingUnlink = { exportId: string | number; filePath: string };
      const pendingUnlinks: PendingUnlink[] = [];
      for (const exportRecord of expiredExports.docs) {
        try {
          const oldFilePath = exportRecord.filePath;

          // Mark as expired first to prevent download attempts during cleanup
          await sys.update({
            collection: "data-exports",
            id: exportRecord.id,
            data: { status: "expired", filePath: null },
          });
          recordsUpdated++;

          if (oldFilePath) {
            pendingUnlinks.push({ exportId: exportRecord.id, filePath: oldFilePath });
          }
        } catch (error) {
          errors++;
          logError(error, "Failed to clean up export", { exportId: exportRecord.id });
        }
      }

      // Pass 2: unlink files in bounded-concurrency chunks. One failing unlink (e.g. already
      // deleted) must not block the others — use Promise.allSettled per chunk and log each
      // rejection individually. Record is already updated so there is no orphan risk.
      for (let i = 0; i < pendingUnlinks.length; i += UNLINK_CONCURRENCY) {
        const chunk = pendingUnlinks.slice(i, i + UNLINK_CONCURRENCY);
        const results = await Promise.allSettled(chunk.map(({ filePath }) => unlink(filePath)));

        for (let j = 0; j < results.length; j++) {
          const { exportId, filePath } = chunk[j]!;
          const result = results[j]!;
          if (result.status === "fulfilled") {
            filesDeleted++;
            logger.debug({ exportId, filePath }, "Deleted export file");
          } else {
            logger.warn(
              { exportId, filePath, error: result.reason },
              "Could not delete export file (may already be deleted)"
            );
          }
        }
      }

      // Also find and clean up old failed or expired records (older than 30 days)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const oldRecords = await sys.find({
        collection: "data-exports",
        where: {
          and: [{ status: { in: ["failed", "expired"] } }, { requestedAt: { less_than: thirtyDaysAgo.toISOString() } }],
        },
        limit: 100,
      });

      let recordsDeleted = 0;
      for (const record of oldRecords.docs) {
        try {
          await sys.delete({ collection: "data-exports", id: record.id });
          recordsDeleted++;
        } catch (error) {
          errors++;
          logError(error, "Failed to delete old export record", { exportId: record.id });
        }
      }

      logger.info(
        { jobId: job?.id, filesDeleted, recordsUpdated, recordsDeleted, errors },
        "Data export cleanup job completed"
      );

      return { output: { success: true, filesDeleted, recordsUpdated, recordsDeleted, errors } };
    } catch (error) {
      logError(error, "Data export cleanup job failed", { jobId: job?.id });
      throw error;
    }
  },
};
