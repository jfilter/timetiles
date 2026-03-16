/**
 * Background job handler for managing scheduled imports.
 *
 * Runs periodically to check for scheduled imports that are due for execution.
 * Creates new import-files records for scheduled URLs and triggers URL fetch jobs.
 * Implements a cron-like scheduler using Payload's job system with support for
 * various frequency patterns and retry logic.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/import-constants";
import { logError, logger } from "@/lib/logger";
import { triggerScheduledImport } from "@/lib/services/scheduled-import-trigger-service";
import { calculateNextCronRun } from "@/lib/utils/cron-parser";
import type { ScheduledImport, Scraper } from "@/payload-types";

// Unused but kept for future expansion
// interface ScheduleManagerJobInput {
//   scanAll?: boolean; // Optionally scan all schedules instead of just due ones
// }

/**
 * Gets the next execution time based on frequency (UTC).
 */
const getNextFrequencyExecution = (frequency: string, fromDate?: Date): Date => {
  const now = fromDate ?? new Date();
  const next = new Date(now);
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);

  switch (frequency) {
    case "hourly": {
      // Calculate the next full hour
      next.setUTCMinutes(0);

      // Move to next hour
      const currentHour = next.getUTCHours();
      next.setUTCHours(currentHour + 1);

      // Make sure we're actually in the future (handles edge cases)
      while (next <= now) {
        next.setUTCHours(next.getUTCHours() + 1);
      }

      break;
    }

    case "daily":
      // Next day at midnight UTC
      next.setUTCMinutes(0);
      next.setUTCHours(0);
      next.setUTCDate(next.getUTCDate() + 1);

      // Make sure we're actually in the future (in case it's already past midnight)
      while (next <= now) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      break;

    case "weekly": {
      // Next Sunday at midnight UTC
      next.setUTCMinutes(0);
      next.setUTCHours(0);
      const daysUntilSunday = 7 - next.getUTCDay() || 7;
      next.setUTCDate(next.getUTCDate() + daysUntilSunday);
      break;
    }

    case "monthly":
      // First of next month at midnight UTC
      next.setUTCMinutes(0);
      next.setUTCHours(0);
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;

    default:
      throw new Error(`Invalid frequency: ${frequency}`);
  }

  return next;
};

/**
 * Gets the next execution time based on schedule type (UTC).
 */
const getNextExecutionTime = (scheduledImport: ScheduledImport, fromDate?: Date): Date => {
  if (scheduledImport.scheduleType === "frequency" && scheduledImport.frequency) {
    return getNextFrequencyExecution(scheduledImport.frequency, fromDate);
  } else if (scheduledImport.scheduleType === "cron" && scheduledImport.cronExpression) {
    const nextRun = calculateNextCronRun(scheduledImport.cronExpression, fromDate);
    if (!nextRun) {
      throw new Error(`Unable to calculate next run for cron expression: ${scheduledImport.cronExpression}`);
    }
    return nextRun;
  }

  throw new Error("Invalid schedule configuration");
};

/**
 * Checks if a scheduled import should run now.
 */
const shouldRunNow = (scheduledImport: ScheduledImport, currentTime: Date): boolean => {
  if (!scheduledImport.enabled) {
    return false;
  }

  // Check schedule configuration
  const hasValidSchedule = Boolean(
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    (scheduledImport.scheduleType === "frequency" && scheduledImport.frequency) ||
    (scheduledImport.scheduleType === "cron" && scheduledImport.cronExpression)
  );

  if (!hasValidSchedule) {
    return false;
  }

  // Check if there's a nextRun time set and if it's time to run
  if (scheduledImport.nextRun) {
    const nextRun = new Date(scheduledImport.nextRun);
    return currentTime >= nextRun;
  }

  // If no nextRun is set, calculate if it should run based on lastRun
  if (scheduledImport.lastRun) {
    try {
      const nextRun = getNextExecutionTime(scheduledImport, new Date(scheduledImport.lastRun));
      return currentTime >= nextRun;
    } catch (error) {
      logger.warn("Invalid schedule configuration", {
        scheduledImportId: scheduledImport.id,
        scheduleType: scheduledImport.scheduleType,
        frequency: scheduledImport.frequency,
        cronExpression: scheduledImport.cronExpression,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  // If no lastRun, this is the first run - check if it should run now
  try {
    const nextRun = getNextExecutionTime(scheduledImport);
    return currentTime >= nextRun;
  } catch (error) {
    logger.warn("Invalid schedule configuration for first run", {
      scheduledImportId: scheduledImport.id,
      scheduleType: scheduledImport.scheduleType,
      frequency: scheduledImport.frequency,
      cronExpression: scheduledImport.cronExpression,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
};

// Helper to calculate next run with fallback
const calculateNextRun = (scheduledImport: ScheduledImport, currentTime: Date): Date => {
  try {
    return getNextExecutionTime(scheduledImport, currentTime);
  } catch (error) {
    logger.error("Failed to calculate next run time", {
      scheduledImportId: scheduledImport.id,
      scheduleType: scheduledImport.scheduleType,
      frequency: scheduledImport.frequency,
      cronExpression: scheduledImport.cronExpression,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return new Date(currentTime.getTime() + 24 * 60 * 60 * 1000); // Default to 24 hours
  }
};

// Helper to process a single scheduled import
const processScheduledImport = async (
  payload: Payload,
  scheduledImport: ScheduledImport,
  currentTime: Date
): Promise<boolean> => {
  if (!shouldRunNow(scheduledImport, currentTime)) {
    return false;
  }

  // CRITICAL: Check if already running BEFORE queuing
  if (scheduledImport.lastStatus === "running") {
    logger.info("Skipping scheduled import - already running", {
      scheduledImportId: scheduledImport.id,
      name: scheduledImport.name,
    });
    return false;
  }

  const nextRun = calculateNextRun(scheduledImport, currentTime);

  await triggerScheduledImport(payload, scheduledImport, currentTime, {
    triggeredBy: "schedule",
    nextRun: nextRun.toISOString(),
  });

  return true;
};

// Helper to handle import error
const handleImportError = async (payload: Payload, scheduledImport: ScheduledImport, error: unknown): Promise<void> => {
  logError(error, "Failed to trigger scheduled import", {
    scheduledImportId: scheduledImport.id,
    name: scheduledImport.name,
    url: scheduledImport.sourceUrl,
  });

  try {
    const stats = scheduledImport.statistics ?? { totalRuns: 0, successfulRuns: 0, failedRuns: 0, averageDuration: 0 };
    stats.totalRuns = (stats.totalRuns ?? 0) + 1;
    stats.failedRuns = (stats.failedRuns ?? 0) + 1;

    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_IMPORTS,
      id: scheduledImport.id,
      data: {
        lastStatus: "failed",
        lastError: error instanceof Error ? error.message : "Unknown error",
        statistics: stats,
      },
    });
  } catch (updateError) {
    logError(updateError, "Failed to update scheduled import error status");
  }
};

// ---------------------------------------------------------------------------
// Scraper scheduling
// ---------------------------------------------------------------------------

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

  // First run: calculate from now minus 1 minute to see if cron matches
  try {
    const nextRun = calculateNextCronRun(scraper.schedule);
    return nextRun != null && currentTime >= nextRun;
  } catch {
    return false;
  }
};

/**
 * Process all due scrapers and queue execution jobs.
 *
 * Called from the main schedule-manager handler after scheduled imports.
 */
const processScheduledScrapers = async (
  payload: Payload,
  currentTime: Date
): Promise<{ triggered: number; errors: number }> => {
  // Check if scrapers feature is enabled
  const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
  if (!(await isFeatureEnabled(payload, "enableScrapers"))) {
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

      // Concurrency guard: skip if already running
      if (scraper.lastRunStatus === "running") {
        logger.info("Skipping scraper - already running", { scraperId: scraper.id, name: scraper.name });
        continue;
      }

      // Queue scraper execution job
      await payload.jobs.queue({
        task: "scraper-execution",
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
    } catch (error) {
      errors++;
      logError(error, "Failed to trigger scheduled scraper", { scraperId: scraper.id, name: scraper.name });
    }
  }

  return { triggered, errors };
};

export const scheduleManagerJob = {
  slug: "schedule-manager",
  schedule: [{ cron: "* * * * *", queue: "default" as const }],
  handler: async ({ job, req }: { job?: { id?: string | number }; req?: { payload?: Payload } }) => {
    const payload = req?.payload;

    if (!payload) {
      throw new Error("Payload not available in job context");
    }

    try {
      // Check feature flag - skip execution if disabled
      const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
      if (!(await isFeatureEnabled(payload, "enableScheduledJobExecution"))) {
        logger.info("Schedule manager job skipped - feature disabled", { jobId: job?.id });
        return {
          output: { success: true, skipped: true, reason: "Feature flag enableScheduledJobExecution is disabled" },
        };
      }

      logger.info("Starting schedule manager job", { jobId: job?.id });

      const currentTime = new Date();

      // Find all enabled scheduled imports
      const scheduledImports = await payload.find({
        collection: COLLECTION_NAMES.SCHEDULED_IMPORTS,
        where: { enabled: { equals: true } },
        limit: 1000,
        pagination: false,
      });

      logger.info("Found scheduled imports", {
        count: scheduledImports.docs.length,
        totalDocs: scheduledImports.totalDocs,
      });

      let triggeredCount = 0;
      let errorCount = 0;

      for (const scheduledImport of scheduledImports.docs) {
        try {
          const triggered = await processScheduledImport(payload, scheduledImport, currentTime);
          if (triggered) {
            triggeredCount++;
          }
        } catch (error) {
          errorCount++;
          await handleImportError(payload, scheduledImport, error);
        }
      }

      // Process scheduled scrapers
      const scraperResults = await processScheduledScrapers(payload, currentTime);

      logger.info("Schedule manager job completed", {
        jobId: job?.id,
        totalScheduled: scheduledImports.docs.length,
        triggered: triggeredCount,
        errors: errorCount,
        scrapersTriggered: scraperResults.triggered,
        scraperErrors: scraperResults.errors,
      });

      return {
        output: {
          success: true,
          totalScheduled: scheduledImports.docs.length,
          triggered: triggeredCount,
          errors: errorCount,
          scrapersTriggered: scraperResults.triggered,
          scraperErrors: scraperResults.errors,
        },
      };
    } catch (error) {
      logError(error, "Schedule manager job failed", { jobId: job?.id });
      throw error;
    }
  },
};
