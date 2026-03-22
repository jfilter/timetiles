/**
 * Background job handler for managing scheduled ingests.
 *
 * Runs periodically to check for scheduled ingests that are due for execution.
 * Creates new import-files records for scheduled URLs and triggers URL fetch jobs.
 * Implements a cron-like scheduler using Payload's job system with support for
 * various frequency patterns and retry logic.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { calculateNextCronRun } from "@/lib/ingest/cron-parser";
import { triggerScheduledIngest } from "@/lib/ingest/trigger-service";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { claimScraperRunning } from "@/lib/services/webhook-registry";
import { getDatePartsInTimezone, wallClockToUtc } from "@/lib/utils/timezone";
import { sanitizeUrlForLogging } from "@/lib/utils/url-sanitize";
import type { ScheduledIngest, Scraper } from "@/payload-types";

/**
 * Gets the next execution time based on frequency.
 *
 * When a timezone is provided, schedule boundaries (midnight, start of week, etc.)
 * are computed in that timezone. The returned Date is always a UTC instant.
 * Defaults to UTC for backward compatibility.
 */
const getNextFrequencyExecution = (frequency: string, fromDate?: Date, timezone?: string): Date => {
  const now = fromDate ?? new Date();
  const tz = timezone ?? "UTC";

  if (tz !== "UTC") {
    return getNextFrequencyInTimezone(frequency, now, tz);
  }

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
 * Calculate the next frequency-based execution in a specific timezone.
 */
const getNextFrequencyInTimezone = (frequency: string, now: Date, timezone: string): Date => {
  const local = getDatePartsInTimezone(now, timezone);

  switch (frequency) {
    case "hourly": {
      let result = wallClockToUtc(local.year, local.month, local.day, local.hour + 1, 0, timezone);
      while (result <= now) {
        result = new Date(result.getTime() + 60 * 60 * 1000);
      }
      return result;
    }
    case "daily": {
      let result = wallClockToUtc(local.year, local.month, local.day + 1, 0, 0, timezone);
      while (result <= now) {
        result = new Date(result.getTime() + 24 * 60 * 60 * 1000);
      }
      return result;
    }
    case "weekly": {
      const daysUntilSunday = 7 - local.dayOfWeek || 7;
      let result = wallClockToUtc(local.year, local.month, local.day + daysUntilSunday, 0, 0, timezone);
      while (result <= now) {
        result = new Date(result.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
      return result;
    }
    case "monthly": {
      let result = wallClockToUtc(local.year, local.month + 1, 1, 0, 0, timezone);
      while (result <= now) {
        const advParts = getDatePartsInTimezone(result, timezone);
        result = wallClockToUtc(advParts.year, advParts.month + 1, 1, 0, 0, timezone);
      }
      return result;
    }
    default:
      throw new Error(`Invalid frequency: ${frequency}`);
  }
};

/**
 * Gets the next execution time based on schedule type.
 *
 * Respects the timezone field on the scheduled ingest. Defaults to UTC.
 */
const getNextExecutionTime = (scheduledIngest: ScheduledIngest, fromDate?: Date): Date => {
  const timezone = scheduledIngest.timezone ?? "UTC";

  if (scheduledIngest.scheduleType === "frequency" && scheduledIngest.frequency) {
    return getNextFrequencyExecution(scheduledIngest.frequency, fromDate, timezone);
  } else if (scheduledIngest.scheduleType === "cron" && scheduledIngest.cronExpression) {
    const nextRun = calculateNextCronRun(scheduledIngest.cronExpression, fromDate, timezone);
    if (!nextRun) {
      throw new Error(`Unable to calculate next run for cron expression: ${scheduledIngest.cronExpression}`);
    }
    return nextRun;
  }

  throw new Error("Invalid schedule configuration");
};

/**
 * Checks if a scheduled ingest should run now.
 */
const shouldRunNow = (scheduledIngest: ScheduledIngest, currentTime: Date): boolean => {
  if (!scheduledIngest.enabled) {
    return false;
  }

  // Check schedule configuration
  const hasValidSchedule = Boolean(
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    (scheduledIngest.scheduleType === "frequency" && scheduledIngest.frequency) ||
    (scheduledIngest.scheduleType === "cron" && scheduledIngest.cronExpression)
  );

  if (!hasValidSchedule) {
    return false;
  }

  // Check if there's a nextRun time set and if it's time to run
  if (scheduledIngest.nextRun) {
    const nextRun = new Date(scheduledIngest.nextRun);
    return currentTime >= nextRun;
  }

  // If no nextRun is set, calculate if it should run based on lastRun
  if (scheduledIngest.lastRun) {
    try {
      const nextRun = getNextExecutionTime(scheduledIngest, new Date(scheduledIngest.lastRun));
      return currentTime >= nextRun;
    } catch (error) {
      logger.warn("Invalid schedule configuration", {
        scheduledIngestId: scheduledIngest.id,
        scheduleType: scheduledIngest.scheduleType,
        frequency: scheduledIngest.frequency,
        cronExpression: scheduledIngest.cronExpression,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  // If no lastRun, this is the first run - check if it should run now
  try {
    const nextRun = getNextExecutionTime(scheduledIngest);
    return currentTime >= nextRun;
  } catch (error) {
    logger.warn("Invalid schedule configuration for first run", {
      scheduledIngestId: scheduledIngest.id,
      scheduleType: scheduledIngest.scheduleType,
      frequency: scheduledIngest.frequency,
      cronExpression: scheduledIngest.cronExpression,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
};

// Helper to calculate next run with fallback
const calculateNextRun = (scheduledIngest: ScheduledIngest, currentTime: Date): Date => {
  try {
    return getNextExecutionTime(scheduledIngest, currentTime);
  } catch (error) {
    logger.error("Failed to calculate next run time", {
      scheduledIngestId: scheduledIngest.id,
      scheduleType: scheduledIngest.scheduleType,
      frequency: scheduledIngest.frequency,
      cronExpression: scheduledIngest.cronExpression,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return new Date(currentTime.getTime() + 24 * 60 * 60 * 1000); // Default to 24 hours
  }
};

// Helper to process a single scheduled ingest
const processScheduledIngest = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  currentTime: Date
): Promise<boolean> => {
  if (!shouldRunNow(scheduledIngest, currentTime)) {
    return false;
  }

  // Quick in-memory check before attempting the atomic claim.
  // Not a guarantee (stale data), but avoids unnecessary SQL round-trips.
  if (scheduledIngest.lastStatus === "running") {
    logger.info("Skipping scheduled ingest - already running", {
      scheduledIngestId: scheduledIngest.id,
      name: scheduledIngest.name,
    });
    return false;
  }

  const nextRun = calculateNextRun(scheduledIngest, currentTime);

  try {
    await triggerScheduledIngest(payload, scheduledIngest, currentTime, {
      triggeredBy: "schedule",
      nextRun: nextRun.toISOString(),
    });
  } catch (error) {
    // Concurrency rejection from the atomic SQL claim means another worker
    // already claimed this import. This is expected, not an error.
    if (error instanceof Error && error.message.includes("concurrent trigger rejected")) {
      logger.info("Skipping scheduled ingest - claimed by another worker", {
        scheduledIngestId: scheduledIngest.id,
        name: scheduledIngest.name,
      });
      return false;
    }
    throw error; // Re-throw real errors for handleImportError
  }

  return true;
};

// Helper to handle import error
const handleImportError = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  error: unknown,
  currentTime: Date
): Promise<void> => {
  logError(error, "Failed to trigger scheduled ingest", {
    scheduledIngestId: scheduledIngest.id,
    name: scheduledIngest.name,
    url: sanitizeUrlForLogging(scheduledIngest.sourceUrl),
  });

  try {
    // Advance nextRun so the scheduler doesn't retry every minute for a
    // broken import. Without this, a queue failure would leave the old
    // nextRun in the past and re-trigger on every scheduler tick.
    const nextRun = calculateNextRun(scheduledIngest, currentTime);

    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngest.id,
      data: {
        lastStatus: "failed",
        lastError: error instanceof Error ? error.message : "Unknown error",
        nextRun: nextRun.toISOString(),
      },
    });
  } catch (updateError) {
    logError(updateError, "Failed to update scheduled ingest error status");
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

export const scheduleManagerJob = {
  slug: "schedule-manager",
  schedule: [{ cron: "* * * * *", queue: "default" as const }],
  // Only one schedule-manager may run at a time across all workers.
  // Without this, two workers could both trigger the same scheduled ingest.
  concurrency: () => "schedule-manager",
  handler: async ({ job, req }: JobHandlerContext) => {
    const { payload } = req;

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

      // Find all enabled scheduled ingests
      const scheduledIngests = await payload.find({
        collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
        where: { enabled: { equals: true } },
        limit: 1000,
        pagination: false,
      });

      logger.info("Found scheduled ingests", {
        count: scheduledIngests.docs.length,
        totalDocs: scheduledIngests.totalDocs,
      });

      let triggeredCount = 0;
      let errorCount = 0;

      for (const scheduledIngest of scheduledIngests.docs) {
        try {
          const triggered = await processScheduledIngest(payload, scheduledIngest, currentTime);
          if (triggered) {
            triggeredCount++;
          }
        } catch (error) {
          errorCount++;
          await handleImportError(payload, scheduledIngest, error, currentTime);
        }
      }

      // Process scheduled scrapers
      const scraperResults = await processScheduledScrapers(payload, currentTime);

      logger.info("Schedule manager job completed", {
        jobId: job?.id,
        totalScheduled: scheduledIngests.docs.length,
        triggered: triggeredCount,
        errors: errorCount,
        scrapersTriggered: scraperResults.triggered,
        scraperErrors: scraperResults.errors,
      });

      return {
        output: {
          success: true,
          totalScheduled: scheduledIngests.docs.length,
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
