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
import { getNextFrequencyExecution } from "@/lib/ingest/schedule-utils";
import { logger } from "@/lib/logger";
import type { ScheduledIngest } from "@/payload-types";

export { getNextFrequencyExecution } from "@/lib/ingest/schedule-utils";

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
