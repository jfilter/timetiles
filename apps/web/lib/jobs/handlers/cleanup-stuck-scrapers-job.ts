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
 * Resets a stuck scraper to failed status.
 */
const cancelOrphanedWorkflowJobs = async (
  payload: Payload,
  scraperId: number | string,
  currentTime: Date,
  thresholdHours: number
): Promise<number> => {
  const orphanedJobCutoff = new Date(currentTime.getTime() - thresholdHours * 60 * 60 * 1000).toISOString();

  try {
    const orphanedJobs = await asSystem(payload).find({
      collection: "payload-jobs" as const,
      where: {
        and: [
          { "input.scraperId": { equals: String(scraperId) } },
          { processing: { equals: false } },
          { completedAt: { exists: false } },
          { createdAt: { less_than: orphanedJobCutoff } },
        ],
      },
      limit: 50,
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
  } catch (error) {
    logError(error, "Failed to cancel orphaned scraper workflow jobs", { scraperId, orphanedJobCutoff });
    return 0;
  }
};

const resetStuckScraper = async (
  payload: Payload,
  scraper: Scraper,
  currentTime: Date,
  thresholdHours: number
): Promise<void> => {
  const lastRunTime = scraper.lastRunAt ? parseDateInput(scraper.lastRunAt) : null;
  const stuckDuration = lastRunTime ? currentTime.getTime() - lastRunTime.getTime() : 0;

  // Update statistics (also increments totalRuns — a stuck run is still a run)
  const updatedStats = recordScraperRun(resolveScraperStats(scraper.statistics), "failed");

  await asSystem(payload).update({
    collection: "scrapers",
    id: scraper.id,
    data: { lastRunStatus: "failed", statistics: updatedStats },
  });

  const cancelledJobs = await cancelOrphanedWorkflowJobs(payload, scraper.id, currentTime, thresholdHours);

  logger.info("Reset stuck scraper", {
    scraperId: scraper.id,
    name: scraper.name,
    stuckDurationMinutes: Math.round(stuckDuration / (1000 * 60)),
    cancelledJobs,
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
        limit: 1000,
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
