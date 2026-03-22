/**
 * Job handler for cleaning up stuck scrapers.
 *
 * Identifies and resets scrapers that have been stuck in "running" status
 * for too long (default 2 hours). This prevents permanent blocking of
 * scrapers due to job failures or system crashes.
 *
 * Mirrors the behavior of cleanup-stuck-scheduled-ingests-job.ts.
 *
 * @module
 * @category Jobs
 */

import type { Payload } from "payload";

import { logError, logger } from "@/lib/logger";
import { parseDateInput } from "@/lib/utils/date";
import type { Scraper } from "@/payload-types";

import type { JobHandlerContext } from "../utils/job-context";
import { isResourceStuck } from "../utils/stuck-detection";

export interface CleanupStuckScrapersJobInput {
  /** Hours after which a running scraper is considered stuck (default: 2) */
  stuckThresholdHours?: number;
  /** Whether to run in dry-run mode (default: false) */
  dryRun?: boolean;
}

/**
 * Resets a stuck scraper to failed status.
 */
const resetStuckScraper = async (payload: Payload, scraper: Scraper, currentTime: Date): Promise<void> => {
  const lastRunTime = scraper.lastRunAt ? parseDateInput(scraper.lastRunAt) : null;
  const stuckDuration = lastRunTime ? currentTime.getTime() - lastRunTime.getTime() : 0;

  // Update statistics
  const stats = (scraper.statistics as Record<string, number> | null) ?? {
    totalRuns: 0,
    successRuns: 0,
    failedRuns: 0,
  };
  stats.failedRuns = (stats.failedRuns ?? 0) + 1;

  await payload.update({
    collection: "scrapers",
    id: scraper.id,
    overrideAccess: true,
    data: { lastRunStatus: "failed", statistics: stats },
  });

  logger.info("Reset stuck scraper", {
    scraperId: scraper.id,
    name: scraper.name,
    stuckDurationMinutes: Math.round(stuckDuration / (1000 * 60)),
  });
};

export const cleanupStuckScrapersJob = {
  slug: "cleanup-stuck-scrapers",
  schedule: [{ cron: "0 * * * *", queue: "maintenance" as const }],
  concurrency: () => "cleanup-stuck-scrapers",
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as CleanupStuckScrapersJobInput;

    const stuckThresholdHours = input?.stuckThresholdHours ?? 2;
    const dryRun = input?.dryRun ?? false;
    const currentTime = new Date();

    try {
      // Check if scrapers feature is enabled
      const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
      if (!(await isFeatureEnabled(payload, "enableScrapers"))) {
        return { output: { success: true, skipped: true, reason: "Scrapers feature disabled" } };
      }

      logger.info("Starting cleanup stuck scrapers job", { jobId: context.job?.id, stuckThresholdHours, dryRun });

      // Find all scrapers with "running" status
      const runningScrapers = await payload.find({
        collection: "scrapers",
        where: { lastRunStatus: { equals: "running" } },
        limit: 1000,
        pagination: false,
        overrideAccess: true,
      });

      logger.info("Found running scrapers", { count: runningScrapers.docs.length });

      let stuckCount = 0;
      let resetCount = 0;
      const errors: Array<{ id: string; name: string; error: string }> = [];

      for (const scraper of runningScrapers.docs) {
        try {
          if (isResourceStuck(scraper.lastRunStatus, "running", scraper.lastRunAt, currentTime, stuckThresholdHours)) {
            stuckCount++;

            if (!dryRun) {
              await resetStuckScraper(payload, scraper, currentTime);
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
