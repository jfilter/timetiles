/**
 * Background job for cleaning up old failed and completed Payload jobs.
 *
 * Failed jobs (`hasError = true`) accumulate indefinitely since Payload
 * does not auto-delete them. This job purges old entries to prevent
 * table bloat and keep the dashboard manageable.
 *
 * @module
 * @category Jobs
 */
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { asSystem } from "@/lib/services/system-payload";

/** Delete failed jobs older than this many days. */
const FAILED_RETENTION_DAYS = 7;

/** Delete completed jobs older than this many days (safety net for any that linger). */
const COMPLETED_RETENTION_DAYS = 3;

/**
 * Scheduled job for purging old failed and completed Payload jobs.
 */
export const jobCleanupJob = {
  slug: "job-cleanup",
  schedule: [{ cron: "0 5 * * *", queue: "maintenance" as const }],
  concurrency: () => "job-cleanup",
  handler: async ({ job, req }: JobHandlerContext) => {
    const sys = asSystem(req.payload);

    try {
      logger.info({ jobId: job?.id }, "Starting job cleanup");

      const now = Date.now();
      const failedCutoff = new Date(now - FAILED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const completedCutoff = new Date(now - COMPLETED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      let failedDeleted = 0;
      let completedDeleted = 0;
      let errors = 0;

      // 1. Delete old failed jobs
      const failedJobs = await sys.find({
        collection: "payload-jobs",
        where: { and: [{ hasError: { equals: true } }, { updatedAt: { less_than: failedCutoff.toISOString() } }] },
        limit: 500,
      });

      for (const failedJob of failedJobs.docs) {
        try {
          await sys.delete({ collection: "payload-jobs", id: failedJob.id });
          failedDeleted++;
        } catch (error) {
          errors++;
          logError(error, "Failed to delete failed job", { payloadJobId: failedJob.id });
        }
      }

      // 2. Delete old completed jobs that weren't auto-deleted
      const completedJobs = await sys.find({
        collection: "payload-jobs",
        where: {
          and: [{ completedAt: { exists: true } }, { completedAt: { less_than: completedCutoff.toISOString() } }],
        },
        limit: 500,
      });

      for (const completedJob of completedJobs.docs) {
        try {
          await sys.delete({ collection: "payload-jobs", id: completedJob.id });
          completedDeleted++;
        } catch (error) {
          errors++;
          logError(error, "Failed to delete completed job", { payloadJobId: completedJob.id });
        }
      }

      logger.info({ jobId: job?.id, failedDeleted, completedDeleted, errors }, "Job cleanup completed");

      return { output: { success: true, failedDeleted, completedDeleted, errors } };
    } catch (error) {
      logError(error, "Job cleanup failed", { jobId: job?.id });
      throw error;
    }
  },
};
