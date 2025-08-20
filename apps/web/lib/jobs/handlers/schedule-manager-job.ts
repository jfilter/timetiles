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

import { COLLECTION_NAMES, JOB_TYPES } from "@/lib/constants/import-constants";
import { logError, logger } from "@/lib/logger";
import type { ScheduledImport } from "@/payload-types";

// Unused but kept for future expansion
// interface ScheduleManagerJobInput {
//   scanAll?: boolean; // Optionally scan all schedules instead of just due ones
// }

/**
 * Gets the next execution time based on frequency (UTC)
 */
const getNextFrequencyExecution = (frequency: string, fromDate?: Date): Date => {
  const now = fromDate ?? new Date();
  const next = new Date(now);
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);

  switch (frequency) {
    case "hourly":
      // Next hour at :00
      next.setUTCMinutes(0);
      next.setUTCHours(next.getUTCHours() + 1);
      break;

    case "daily":
      // Next day at midnight UTC
      next.setUTCMinutes(0);
      next.setUTCHours(0);
      next.setUTCDate(next.getUTCDate() + 1);
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

// Helper to parse and validate cron parts
const parseCronExpression = (cronExpression: string) => {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }
  const [minute = "*", hour = "*", dayOfMonth = "*", month = "*", dayOfWeek = "*"] = parts;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
};

// Helper to set cron time fields
const setCronTimeFields = (date: Date, minute: string, hour: string): void => {
  date.setUTCSeconds(0);
  date.setUTCMilliseconds(0);

  if (minute !== "*") {
    const targetMinute = parseInt(minute);
    if (isNaN(targetMinute) || targetMinute < 0 || targetMinute > 59) {
      throw new Error(`Invalid minute in cron expression: ${minute}`);
    }
    date.setUTCMinutes(targetMinute);
  }

  if (hour !== "*") {
    const targetHour = parseInt(hour);
    if (isNaN(targetHour) || targetHour < 0 || targetHour > 23) {
      throw new Error(`Invalid hour in cron expression: ${hour}`);
    }
    date.setUTCHours(targetHour);
  }
};

// Helper to advance to next occurrence
const advanceToNextOccurrence = (
  date: Date,
  now: Date,
  minute: string,
  hour: string,
  dayOfMonth: string,
  month: string,
  dayOfWeek: string
): void => {
  if (date <= now) {
    if (hour === "*" && minute === "*") {
      date.setMinutes(date.getMinutes() + 1);
    } else if (hour === "*") {
      date.setHours(date.getHours() + 1);
    } else if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      date.setDate(date.getDate() + 1);
    } else {
      date.setDate(date.getDate() + 1);
    }
  }
};

/**
 * Parses a cron expression and returns the next execution time (UTC)
 * Note: This is a basic implementation. For production, consider using a library like 'node-cron' or 'cron-parser'
 */
const getNextCronExecution = (cronExpression: string, fromDate?: Date): Date => {
  const now = fromDate ?? new Date();
  const { minute, hour, dayOfMonth, month, dayOfWeek } = parseCronExpression(cronExpression);

  const next = new Date(now);
  setCronTimeFields(next, minute, hour);
  advanceToNextOccurrence(next, now, minute, hour, dayOfMonth, month, dayOfWeek);

  return next;
};

/**
 * Gets the next execution time based on schedule type (UTC)
 */
const getNextExecutionTime = (scheduledImport: ScheduledImport, fromDate?: Date): Date => {
  if (scheduledImport.scheduleType === "frequency" && scheduledImport.frequency) {
    return getNextFrequencyExecution(scheduledImport.frequency, fromDate);
  } else if (scheduledImport.scheduleType === "cron" && scheduledImport.cronExpression) {
    return getNextCronExecution(scheduledImport.cronExpression, fromDate);
  }

  throw new Error("Invalid schedule configuration");
};

/**
 * Checks if a scheduled import should run now
 */
const shouldRunNow = (scheduledImport: ScheduledImport, currentTime: Date): boolean => {
  if (!scheduledImport.enabled) {
    return false;
  }

  // Check schedule configuration

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Logical OR is correct here for boolean logic
  const hasValidSchedule = Boolean(
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

// Helper to generate import name from template
const generateImportName = (
  template: string | null | undefined,
  scheduledImport: ScheduledImport,
  currentTime: Date
): string => {
  const importName = template ?? "{{name}} - {{date}}";
  const timeString = `${currentTime.getUTCHours().toString().padStart(2, "0")}:${currentTime.getUTCMinutes().toString().padStart(2, "0")}:${currentTime.getUTCSeconds().toString().padStart(2, "0")}`;

  return importName
    .replace("{{name}}", scheduledImport.name)
    .replace("{{date}}", currentTime.toISOString().split("T")[0] ?? "")
    .replace("{{time}}", timeString)
    .replace("{{url}}", new URL(scheduledImport.sourceUrl).hostname);
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

// Helper to update execution history
const updateExecutionHistory = (
  scheduledImport: ScheduledImport,
  currentTime: Date,
  _jobId: string,
  startTime: number
) => {
  const executionHistory = scheduledImport.executionHistory ?? [];
  executionHistory.unshift({
    executedAt: currentTime.toISOString(),
    status: "success",
    duration: Date.now() - startTime,
  });

  // Keep only last 10 executions
  if (executionHistory.length > 10) {
    executionHistory.splice(10);
  }

  return executionHistory;
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

  const startTime = Date.now();
  const importName = generateImportName(scheduledImport.importNameTemplate, scheduledImport, currentTime);

  // Queue the URL fetch job
  const urlFetchJob = await payload.jobs.queue({
    task: JOB_TYPES.URL_FETCH,
    input: {
      scheduledImportId: scheduledImport.id,
      sourceUrl: scheduledImport.sourceUrl,
      authConfig: scheduledImport.authConfig,
      catalogId:
        // eslint-disable-next-line sonarjs/different-types-comparison -- Checking for object type is correct
        typeof scheduledImport.catalog === "object" && scheduledImport.catalog !== null
          ? scheduledImport.catalog.id
          : (scheduledImport.catalog ?? undefined),
      originalName: importName,
      userId:
        typeof scheduledImport.createdBy === "object" && scheduledImport.createdBy !== null
          ? scheduledImport.createdBy.id
          : scheduledImport.createdBy,
    },
  });

  const nextRun = calculateNextRun(scheduledImport, currentTime);
  const executionHistory = updateExecutionHistory(scheduledImport, currentTime, urlFetchJob.id.toString(), startTime);

  // Update statistics
  const stats = scheduledImport.statistics ?? {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    averageDuration: 0,
  };
  stats.totalRuns = (stats.totalRuns ?? 0) + 1;
  stats.successfulRuns = (stats.successfulRuns ?? 0) + 1;

  // Update the scheduled import record
  await payload.update({
    collection: COLLECTION_NAMES.SCHEDULED_IMPORTS,
    id: scheduledImport.id,
    data: {
      lastRun: currentTime.toISOString(),
      nextRun: nextRun.toISOString(),
      lastStatus: "running",
      currentRetries: 0,
      executionHistory,
      statistics: stats,
    },
  });

  logger.info("Triggered scheduled import", {
    scheduledImportId: scheduledImport.id,
    scheduledImportName: scheduledImport.name,
    urlFetchJobId: urlFetchJob.id,
    nextRun: nextRun.toISOString(),
    url: scheduledImport.sourceUrl,
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
    const stats = scheduledImport.statistics ?? {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageDuration: 0,
    };
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

export const scheduleManagerJob = {
  slug: "schedule-manager",
  handler: async ({ job, req }: { job?: { id?: string | number }; req?: { payload?: Payload } }) => {
    const payload = req?.payload;

    if (!payload) {
      throw new Error("Payload not available in job context");
    }

    try {
      logger.info("Starting schedule manager job", { jobId: job?.id });

      const currentTime = new Date();

      // Find all enabled scheduled imports
      const scheduledImports = await payload.find({
        collection: COLLECTION_NAMES.SCHEDULED_IMPORTS,
        where: {
          enabled: {
            equals: true,
          },
        },
        limit: 1000,
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

      logger.info("Schedule manager job completed", {
        jobId: job?.id,
        totalScheduled: scheduledImports.docs.length,
        triggered: triggeredCount,
        errors: errorCount,
      });

      return {
        output: {
          success: true,
          totalScheduled: scheduledImports.docs.length,
          triggered: triggeredCount,
          errors: errorCount,
        },
      };
    } catch (error) {
      logError(error, "Schedule manager job failed", { jobId: job?.id });
      throw error;
    }
  },
};
