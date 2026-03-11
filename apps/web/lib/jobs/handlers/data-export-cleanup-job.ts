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

import type { Payload } from "payload";

import { logError, logger } from "@/lib/logger";

/**
 * Scheduled job for cleaning up expired data exports.
 */
export const dataExportCleanupJob = {
  slug: "data-export-cleanup",
  handler: async ({ job, req }: { job?: { id?: string | number }; req?: { payload?: Payload } }) => {
    const payload = req?.payload;

    if (!payload) {
      throw new Error("Payload not available in job context");
    }

    try {
      logger.info({ jobId: job?.id }, "Starting data export cleanup job");

      const now = new Date();
      let filesDeleted = 0;
      let recordsUpdated = 0;
      let errors = 0;

      // Find all ready exports that have expired
      const expiredExports = await payload.find({
        collection: "data-exports",
        where: { and: [{ status: { equals: "ready" } }, { expiresAt: { less_than: now.toISOString() } }] },
        limit: 100,
        overrideAccess: true,
      });

      logger.info({ count: expiredExports.docs.length, jobId: job?.id }, "Found expired exports to clean up");

      for (const exportRecord of expiredExports.docs) {
        try {
          const oldFilePath = exportRecord.filePath;

          // Mark as expired first to prevent download attempts during cleanup
          await payload.update({
            collection: "data-exports",
            id: exportRecord.id,
            data: { status: "expired", filePath: null },
            overrideAccess: true,
          });
          recordsUpdated++;

          // Then delete the file from disk
          if (oldFilePath) {
            try {
              await unlink(oldFilePath);
              filesDeleted++;
              logger.debug({ exportId: exportRecord.id, filePath: oldFilePath }, "Deleted export file");
            } catch (fileError) {
              // File may already be deleted — record is already updated so no orphan risk
              logger.warn(
                { exportId: exportRecord.id, filePath: oldFilePath, error: fileError },
                "Could not delete export file (may already be deleted)"
              );
            }
          }
        } catch (error) {
          errors++;
          logError(error, "Failed to clean up export", { exportId: exportRecord.id });
        }
      }

      // Also find and clean up old failed or expired records (older than 30 days)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const oldRecords = await payload.find({
        collection: "data-exports",
        where: {
          and: [{ status: { in: ["failed", "expired"] } }, { requestedAt: { less_than: thirtyDaysAgo.toISOString() } }],
        },
        limit: 100,
        overrideAccess: true,
      });

      let recordsDeleted = 0;
      for (const record of oldRecords.docs) {
        try {
          await payload.delete({ collection: "data-exports", id: record.id, overrideAccess: true });
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
