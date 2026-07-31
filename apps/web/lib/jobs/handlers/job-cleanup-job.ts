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

/** Rows deleted per query. */
const PAGE_SIZE = 500;

/** Upper bound on pages per category, so one run cannot spin forever. */
const MAX_PAGES = 40;

interface DrainResult {
  deleted: number;
  errors: number;
  hasMore: boolean;
}

/**
 * Delete every matching job, not just the first page.
 *
 * A single capped query per category meant any instance producing more than PAGE_SIZE stale
 * jobs a day fell further behind every day — while the run reported success and the retention
 * windows this job exists to enforce were quietly exceeded. Always re-reads page 1: each pass
 * removes the rows it just matched.
 */
const drainJobs = async (
  sys: ReturnType<typeof asSystem>,
  where: Record<string, unknown>,
  label: string
): Promise<DrainResult> => {
  let deleted = 0;
  let errors = 0;
  let hasMore = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await sys.find({ collection: "payload-jobs", where: where as never, limit: PAGE_SIZE, depth: 0 });
    if (batch.docs.length === 0) break;

    let deletedThisPage = 0;
    for (const doc of batch.docs) {
      try {
        await sys.delete({ collection: "payload-jobs", id: doc.id });
        deleted++;
        deletedThisPage++;
      } catch (error) {
        errors++;
        logError(error, `Failed to delete ${label} job`, { payloadJobId: doc.id });
      }
    }

    // Every row on this page refused to go — retrying the same page would spin.
    if (deletedThisPage === 0) break;
    // A short page is the end of the backlog; querying again would be a wasted round trip.
    if (batch.docs.length < PAGE_SIZE) break;
    if (page === MAX_PAGES) hasMore = true;
  }

  return { deleted, errors, hasMore };
};

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
      // 1. Delete old failed jobs
      const failed = await drainJobs(
        sys,
        { and: [{ hasError: { equals: true } }, { updatedAt: { less_than: failedCutoff.toISOString() } }] },
        "failed"
      );

      // 2. Delete old completed jobs that weren't auto-deleted
      const completed = await drainJobs(
        sys,
        { and: [{ completedAt: { exists: true } }, { completedAt: { less_than: completedCutoff.toISOString() } }] },
        "completed"
      );

      const failedDeleted = failed.deleted;
      const completedDeleted = completed.deleted;
      const errors = failed.errors + completed.errors;
      const hasMore = failed.hasMore || completed.hasMore;

      if (hasMore) {
        logger.warn(
          { jobId: job?.id, failedDeleted, completedDeleted },
          "Job cleanup hit its page cap; backlog remains"
        );
      }
      logger.info({ jobId: job?.id, failedDeleted, completedDeleted, errors }, "Job cleanup completed");

      return { output: { success: true, failedDeleted, completedDeleted, errors, hasMore } };
    } catch (error) {
      logError(error, "Job cleanup failed", { jobId: job?.id });
      throw error;
    }
  },
};
