/**
 * Preview Cleanup Job Handler.
 *
 * Removes expired import-wizard preview files (metadata + data file) from the
 * temp directory every 6 hours. Without this job, preview temp files are only
 * cleaned when the caller explicitly invokes `cleanupPreview` — which leaves
 * aborted/abandoned wizard sessions on disk indefinitely.
 *
 * @module
 * @category Jobs
 */

import { sweepExpiredPreviews } from "@/lib/ingest/preview-store";
import { logError, logger } from "@/lib/logger";

/**
 * Scheduled job for cleaning up expired import-wizard preview files.
 */
export const previewCleanupJob = {
  slug: "preview-cleanup",
  /** Run every 6 hours; previews expire after 1 hour. Worker delays or cleanup failures extend retention. */
  schedule: [{ cron: "0 */6 * * *", queue: "maintenance" as const }],
  retries: 2,
  // Sync handler — sweepExpiredPreviews is synchronous but Payload still
  // awaits the returned object, so we return a resolved value directly.
  handler: () => {
    const startTime = Date.now();
    logger.info("Starting preview cleanup job");

    try {
      const result = sweepExpiredPreviews();
      if (result.errors > 0) {
        throw new Error(`Preview cleanup failed for ${result.errors} entries`);
      }
      const duration = Date.now() - startTime;

      logger.info("Preview cleanup completed", {
        scanned: result.scanned,
        removed: result.removed,
        orphanedRemoved: result.orphanedRemoved,
        errors: result.errors,
        duration,
      });

      return Promise.resolve({
        output: {
          success: true,
          scanned: result.scanned,
          removed: result.removed,
          orphanedRemoved: result.orphanedRemoved,
          errors: result.errors,
          duration,
        },
      });
    } catch (error) {
      logError(error, "Preview cleanup job failed");
      return Promise.reject(error instanceof Error ? error : new Error("Preview cleanup job failed"));
    }
  },
};
