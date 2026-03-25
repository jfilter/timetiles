/**
 * Schedule evaluation logic for the schedule-manager job.
 *
 * Contains all timing calculations: frequency-based scheduling,
 * timezone-aware next-run computation, cron expression evaluation,
 * and the shouldRunNow predicate.
 *
 * @module
 * @category Jobs
 */
import { calculateNextCronRun } from "@/lib/ingest/cron-parser";
import { logger } from "@/lib/logger";
import { getDatePartsInTimezone, wallClockToUtc } from "@/lib/utils/timezone";
import type { ScheduledIngest } from "@/payload-types";

/**
 * Gets the next execution time based on frequency.
 *
 * When a timezone is provided, schedule boundaries (midnight, start of week, etc.)
 * are computed in that timezone. The returned Date is always a UTC instant.
 * Defaults to UTC for backward compatibility.
 */
export const getNextFrequencyExecution = (frequency: string, fromDate?: Date, timezone?: string): Date => {
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
export const getNextExecutionTime = (scheduledIngest: ScheduledIngest, fromDate?: Date): Date => {
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
export const shouldRunNow = (scheduledIngest: ScheduledIngest, currentTime: Date): boolean => {
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

/** Calculate next run with fallback to 24 hours. */
export const calculateNextRun = (scheduledIngest: ScheduledIngest, currentTime: Date): Date => {
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
