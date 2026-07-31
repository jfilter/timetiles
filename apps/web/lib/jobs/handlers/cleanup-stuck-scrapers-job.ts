/**
 * Job handler for cleaning up stuck scrapers.
 *
 * Identifies and resets scrapers that have been stuck in "running" status
 * for too long (default 4 hours). The threshold is intentionally generous
 * because `lastRunAt` records the trigger/queue time, not when processing
 * actually started — there can be significant delay due to queue backlog
 * or worker restarts.
 *
 * Before resetting, also checks whether a Payload job is still actively
 * processing the scraper to avoid killing in-progress work.
 *
 * Mirrors the behavior of cleanup-stuck-scheduled-ingests-job.ts.
 *
 * @module
 * @category Jobs
 */

import type { Payload } from "payload";

import { logError, logger } from "@/lib/logger";
import { buildResourceIdMatch } from "@/lib/services/payload-job-queries";
import { asSystem } from "@/lib/services/system-payload";
import { recordScraperRun, resolveScraperStats } from "@/lib/types/run-statistics";
import { parseDateInput } from "@/lib/utils/date";
import type { Scraper } from "@/payload-types";

import type { JobHandlerContext } from "../utils/job-context";
import { hasActivePayloadJob, isResourceStuck } from "../utils/stuck-detection";

export interface CleanupStuckScrapersJobInput {
  /** Hours after which a running scraper is considered stuck (default: 4).
   * Uses 4h because `lastRunAt` is the trigger time, not when processing started. */
  stuckThresholdHours?: number;
  /** Whether to run in dry-run mode (default: false) */
  dryRun?: boolean;
}

/**
 * Cancel the workflow jobs an abandoned scraper run left behind.
 *
 * Errors deliberately propagate. Swallowing them and returning 0 made a transient database
 * error permanent: the scraper had already been flipped out of `running`, and the reaper only
 * ever looks at `lastRunStatus = "running"`, so the orphaned job kept its concurrency key
 * forever with nothing left to revisit it.
 */
const cancelOrphanedWorkflowJobs = async (
  payload: Payload,
  scraperId: number | string,
  currentTime: Date,
  thresholdHours: number
): Promise<number> => {
  const orphanedJobCutoff = new Date(currentTime.getTime() - thresholdHours * 60 * 60 * 1000).toISOString();

  const orphanedJobs = await asSystem(payload).find({
    collection: "payload-jobs" as const,
    where: {
      and: [
        // Must match the numeric form too. Job input is jsonb, and a string
        // `equals` on a jsonb path compiles to a JSON *string* comparison —
        // while every trigger path enqueues `scraperId` as a NUMBER. The
        // string-only clause was therefore always false and this cancellation
        // never ran, leaving orphaned jobs holding their concurrency key
        // forever. buildResourceIdMatch covers both representations; the
        // sibling hasActivePayloadJob check already uses it.
        buildResourceIdMatch("input.scraperId", scraperId),
        { processing: { equals: false } },
        { completedAt: { exists: false } },
        { createdAt: { less_than: orphanedJobCutoff } },
      ],
    },
    // 0 lifts the limit; a fixed number would strand everything past it, since the scraper
    // leaves `running` on the same pass (`pagination: false` does not lift an explicit limit).
    limit: 0,
    pagination: false,
  });

  let cancelled = 0;
  for (const job of orphanedJobs.docs) {
    await asSystem(payload).update({
      collection: "payload-jobs" as const,
      id: job.id,
      data: { completedAt: new Date().toISOString(), hasError: true, processing: false },
    });
    cancelled++;
  }
  return cancelled;
};

/**
 * Mark any scraper-runs still "running" for this scraper as failed.
 *
 * The only writers of a terminal scraper-runs.status are the run-success/failure
 * handlers, so a worker that dies mid-scrape leaves its run record "running"
 * forever — skewing run stats and the run-log UI even after the scraper itself
 * is reset. Mirror the scheduled-ingest cleanup, which records the stuck run as
 * failed.
 *
 * Errors propagate for the same reason as in cancelOrphanedWorkflowJobs.
 */
const failStuckScraperRuns = async (payload: Payload, scraperId: number, finishedAt: string): Promise<number> => {
  const stuck = await asSystem(payload).find({
    collection: "scraper-runs",
    where: { scraper: { equals: scraperId }, status: { equals: "running" } },
    limit: 0,
    pagination: false,
  });
  for (const run of stuck.docs) {
    await asSystem(payload).update({
      collection: "scraper-runs",
      id: run.id,
      data: {
        status: "failed",
        finishedAt,
        error: "Run auto-reset by cleanup: worker stopped before reporting a result.",
      },
    });
  }
  return stuck.docs.length;
};

/**
 * How many stuck-thresholds a scraper may spend waiting for its dependent cleanup to succeed.
 *
 * `claimScraperRunning` only claims a scraper whose `lastRunStatus` is NOT "running", so a
 * scraper left in that state can never be scheduled again — this reaper is the only thing
 * that can release it. Ordering the dependent cleanup first is right for a transient failure
 * (the next hourly pass retries safely), but a permanently failing cleanup would then keep
 * the scraper dead forever. Past this multiple of the threshold the scraper is released
 * regardless, and the leftovers are logged as an error rather than silently retried.
 */
const FORCE_RESET_THRESHOLD_MULTIPLE = 6;

const cleanUpDependents = async (
  payload: Payload,
  scraper: Scraper,
  currentTime: Date,
  thresholdHours: number
): Promise<{ cancelledJobs: number; failedRuns: number }> => {
  const cancelledJobs = await cancelOrphanedWorkflowJobs(payload, scraper.id, currentTime, thresholdHours);
  const failedRuns = await failStuckScraperRuns(payload, scraper.id, currentTime.toISOString());
  return { cancelledJobs, failedRuns };
};

const resetStuckScraper = async (
  payload: Payload,
  scraper: Scraper,
  currentTime: Date,
  thresholdHours: number
): Promise<void> => {
  const lastRunTime = scraper.lastRunAt ? parseDateInput(scraper.lastRunAt) : null;
  const stuckDuration = lastRunTime ? currentTime.getTime() - lastRunTime.getTime() : 0;
  const forceCutoffMs = thresholdHours * FORCE_RESET_THRESHOLD_MULTIPLE * 60 * 60 * 1000;
  const mayForce = stuckDuration > forceCutoffMs;

  // Dependent state first, scraper last: `lastRunStatus = "running"` is the only handle the
  // reaper has, so releasing it before the dependents are terminal would strand an orphaned
  // job or a "running" run record with no later pass able to see it. Both steps are
  // idempotent, so retrying the whole scraper on the next hourly pass is safe.
  let dependents: { cancelledJobs: number; failedRuns: number };
  try {
    dependents = await cleanUpDependents(payload, scraper, currentTime, thresholdHours);
  } catch (error) {
    if (!mayForce) throw error;
    // Long past the point where retrying is plausibly transient. Release the scraper anyway —
    // a scraper that can never run again is worse than a leftover job record.
    logError(error, "Releasing stuck scraper despite failed dependent cleanup", {
      scraperId: scraper.id,
      name: scraper.name,
      stuckDurationMinutes: Math.round(stuckDuration / (1000 * 60)),
    });
    dependents = { cancelledJobs: 0, failedRuns: 0 };
  }

  // Update statistics (also increments totalRuns — a stuck run is still a run)
  const updatedStats = recordScraperRun(resolveScraperStats(scraper.statistics), "failed");

  await asSystem(payload).update({
    collection: "scrapers",
    id: scraper.id,
    data: { lastRunStatus: "failed", statistics: updatedStats },
  });

  logger.info("Reset stuck scraper", {
    scraperId: scraper.id,
    name: scraper.name,
    stuckDurationMinutes: Math.round(stuckDuration / (1000 * 60)),
    ...dependents,
  });
};

export const cleanupStuckScrapersJob = {
  slug: "cleanup-stuck-scrapers",
  schedule: [{ cron: "0 * * * *", queue: "maintenance" as const }],
  concurrency: () => "cleanup-stuck-scrapers",
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as CleanupStuckScrapersJobInput;

    // Default 4h threshold accounts for the gap between trigger time (lastRunAt) and
    // actual processing start. See stuck-detection.ts for details.
    const stuckThresholdHours = input?.stuckThresholdHours ?? 4;
    const dryRun = input?.dryRun ?? false;
    const currentTime = new Date();

    try {
      // Check if scrapers feature is enabled
      const { getFeatureFlagService } = await import("@/lib/services/feature-flag-service");
      if (!(await getFeatureFlagService(payload).isEnabled("enableScrapers"))) {
        return { output: { success: true, skipped: true, reason: "Scrapers feature disabled" } };
      }

      logger.info("Starting cleanup stuck scrapers job", { jobId: context.job?.id, stuckThresholdHours, dryRun });

      // Find all scrapers with "running" status
      const runningScrapers = await asSystem(payload).find({
        collection: "scrapers",
        where: { lastRunStatus: { equals: "running" } },
        // 0 lifts the limit; a number would cap the reaper itself, leaving anything past it
        // stuck forever (`pagination: false` does not lift an explicit limit).
        limit: 0,
        pagination: false,
      });

      logger.info("Found running scrapers", { count: runningScrapers.docs.length });

      let stuckCount = 0;
      let resetCount = 0;
      const errors: Array<{ id: string; name: string; error: string }> = [];

      for (const scraper of runningScrapers.docs) {
        try {
          if (isResourceStuck(scraper.lastRunStatus, "running", scraper.lastRunAt, currentTime, stuckThresholdHours)) {
            // Secondary safety check: verify no Payload job is actively processing this scraper
            const isActive = await hasActivePayloadJob(payload, "input.scraperId", scraper.id);

            if (isActive) {
              logger.info("Scraper appears stuck but has active Payload job, skipping reset", {
                scraperId: scraper.id,
                name: scraper.name,
              });
              continue;
            }

            stuckCount++;
            if (!dryRun) {
              await resetStuckScraper(payload, scraper, currentTime, stuckThresholdHours);
              resetCount++;
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          errors.push({ id: scraper.id.toString(), name: scraper.name, error: errorMessage });
          logError(error, "Failed to process scraper in cleanup", { scraperId: scraper.id, name: scraper.name });
        }
      }

      const result = {
        success: true,
        totalRunning: runningScrapers.docs.length,
        stuckCount,
        resetCount,
        dryRun,
        errors: errors.length > 0 ? errors : undefined,
      };

      logger.info("Cleanup stuck scrapers job completed", { jobId: context.job?.id, ...result });

      return { output: result };
    } catch (error) {
      logError(error, "Cleanup stuck scrapers job failed", { jobId: context.job?.id });
      throw error;
    }
  },
};
