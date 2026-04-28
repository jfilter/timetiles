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
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";

export interface PreviewCleanupJobInput {
  /** Optional: force cleanup (currently a no-op flag — kept for symmetry with cache-cleanup). */
  force?: boolean;
}

/**
 * Scheduled job for cleaning up expired import-wizard preview files.
 */
export const previewCleanupJob = {
  slug: "preview-cleanup",
  /** Run every 6 hours. Preview TTL is 1 hour, so even at the extremes nothing sits older than 7 hours on disk. */
  schedule: [{ cron: "0 */6 * * *", queue: "maintenance" as const }],
  retries: 2,
  waitUntil: 300000, // 5 minutes timeout
  // Sync handler — sweepExpiredPreviews is synchronous but Payload still
  // awaits the returned object, so we return a resolved value directly.
  handler: (context: JobHandlerContext) => {
    const input = (context.input ?? context.job?.input ?? {}) as PreviewCleanupJobInput;

    const startTime = Date.now();
    logger.info("Starting preview cleanup job", { force: input.force });

    try {
      const result = sweepExpiredPreviews();
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
