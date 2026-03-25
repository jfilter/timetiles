/**
 * Scraper scheduling logic for the schedule-manager job.
 *
 * Evaluates which scrapers are due for execution and queues
 * scraper-ingest workflows with atomic concurrency guards.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { calculateNextCronRun } from "@/lib/ingest/cron-parser";
import { logError, logger } from "@/lib/logger";
import { claimScraperRunning } from "@/lib/services/webhook-registry";
import type { Scraper } from "@/payload-types";

/**
 * Check if a scraper is due for its next scheduled run.
 */
const shouldScraperRunNow = (scraper: Scraper, currentTime: Date): boolean => {
  if (!scraper.enabled || !scraper.schedule) return false;

  // Use nextRunAt if it has been pre-calculated
  if (scraper.nextRunAt) {
    return currentTime >= new Date(scraper.nextRunAt);
  }

  // Fall back to calculating from lastRunAt
  if (scraper.lastRunAt) {
    try {
      const nextRun = calculateNextCronRun(scraper.schedule, new Date(scraper.lastRunAt));
      return nextRun != null && currentTime >= nextRun;
    } catch {
      return false;
    }
  }

  // First run: no previous execution and no pre-calculated nextRunAt.
  // Trigger immediately so the scraper starts its cadence; the handler
  // will calculate and persist nextRunAt after the run.
  return true;
};

/**
 * Process all due scrapers and queue execution jobs.
 *
 * Called from the main schedule-manager handler after scheduled ingests.
 */
export const processScheduledScrapers = async (
  payload: Payload,
  currentTime: Date
): Promise<{ triggered: number; errors: number }> => {
  // Check if scrapers feature is enabled
  const { getFeatureFlagService } = await import("@/lib/services/feature-flag-service");
  if (!(await getFeatureFlagService(payload).isEnabled("enableScrapers"))) {
    return { triggered: 0, errors: 0 };
  }

  // Find all enabled scrapers that have a schedule
  const scrapers = await payload.find({
    collection: "scrapers",
    where: { and: [{ enabled: { equals: true } }, { schedule: { exists: true } }] },
    limit: 1000,
    pagination: false,
    overrideAccess: true,
  });

  if (scrapers.docs.length === 0) {
    return { triggered: 0, errors: 0 };
  }

  logger.info("Found scheduled scrapers", { count: scrapers.docs.length });

  let triggered = 0;
  let errors = 0;

  for (const scraper of scrapers.docs) {
    try {
      if (!shouldScraperRunNow(scraper, currentTime)) continue;

      // Atomic concurrency guard: claim "running" status to prevent concurrent triggers
      const claimed = await claimScraperRunning(payload, scraper.id);
      if (!claimed) {
        logger.info("Skipping scraper - already running", { scraperId: scraper.id, name: scraper.name });
        continue;
      }

      try {
        // Queue scraper-ingest workflow
        await payload.jobs.queue({
          workflow: "scraper-ingest",
          input: { scraperId: scraper.id, triggeredBy: "schedule" },
        });

        // Calculate and update nextRunAt
        const nextRun = calculateNextCronRun(scraper.schedule!, currentTime);
        await payload.update({
          collection: "scrapers",
          id: scraper.id,
          overrideAccess: true,
          data: nextRun ? { nextRunAt: nextRun.toISOString() } : {},
        });

        logger.info("Queued scraper execution", {
          scraperId: scraper.id,
          name: scraper.name,
          nextRunAt: nextRun?.toISOString(),
        });

        triggered++;
      } catch (queueError) {
        // Revert "running" status so the scraper doesn't get stuck permanently
        logError(queueError, "Failed to queue scraper, reverting status", {
          scraperId: scraper.id,
          name: scraper.name,
        });
        await payload.update({
          collection: "scrapers",
          id: scraper.id,
          overrideAccess: true,
          data: { lastRunStatus: "failed" },
        });
        errors++;
      }
    } catch (error) {
      errors++;
      logError(error, "Failed to trigger scheduled scraper", { scraperId: scraper.id, name: scraper.name });
    }
  }

  return { triggered, errors };
};
