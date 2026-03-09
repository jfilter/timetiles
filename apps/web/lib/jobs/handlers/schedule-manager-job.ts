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

import { validateCronExpression } from "@/lib/collections/scheduled-imports/validation";
import { COLLECTION_NAMES, JOB_TYPES } from "@/lib/constants/import-constants";
import { logError, logger } from "@/lib/logger";
import { parseDateInput } from "@/lib/utils/date";
import type { ScheduledImport } from "@/payload-types";

// Unused but kept for future expansion
// interface ScheduleManagerJobInput {
//   scanAll?: boolean; // Optionally scan all schedules instead of just due ones
// }

const getTimeZoneDateParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number.parseInt(getPart("year"), 10),
    month: Number.parseInt(getPart("month"), 10),
    day: Number.parseInt(getPart("day"), 10),
    hour: Number.parseInt(getPart("hour"), 10),
    minute: Number.parseInt(getPart("minute"), 10),
    second: Number.parseInt(getPart("second"), 10),
    weekday: weekdayMap[getPart("weekday")] ?? 0,
  };
};

const getTimeZoneOffset = (date: Date, timeZone: string): number => {
  const parts = getTimeZoneDateParts(date, timeZone);
  const utcTimestamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return utcTimestamp - date.getTime();
};

const zonedTimeToUtc = (
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
  },
  timeZone: string
): Date => {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    0
  );
  const guessDate = new Date(utcGuess);
  const offset = getTimeZoneOffset(guessDate, timeZone);
  return new Date(utcGuess - offset);
};

const getScheduleTimeZone = (scheduledImport: ScheduledImport): string => {
  const maybeTimezone = (scheduledImport as ScheduledImport & { timezone?: string | null }).timezone;
  return maybeTimezone || "UTC";
};

/**
 * Gets the next execution time based on frequency.
 */
const getNextFrequencyExecution = (frequency: string, fromDate?: Date, timeZone = "UTC"): Date => {
  const now = fromDate ?? new Date();
  const nowParts = getTimeZoneDateParts(now, timeZone);

  switch (frequency) {
    case "hourly":
      return zonedTimeToUtc(
        {
          year: nowParts.year,
          month: nowParts.month,
          day: nowParts.day,
          hour: nowParts.hour + 1,
          minute: 0,
          second: 0,
        },
        timeZone
      );

    case "daily":
      return zonedTimeToUtc(
        {
          year: nowParts.year,
          month: nowParts.month,
          day: nowParts.day + 1,
          hour: 0,
          minute: 0,
          second: 0,
        },
        timeZone
      );

    case "weekly": {
      const daysUntilSunday = (7 - nowParts.weekday) || 7;
      return zonedTimeToUtc(
        {
          year: nowParts.year,
          month: nowParts.month,
          day: nowParts.day + daysUntilSunday,
          hour: 0,
          minute: 0,
          second: 0,
        },
        timeZone
      );
    }

    case "monthly":
      return zonedTimeToUtc(
        {
          year: nowParts.year,
          month: nowParts.month + 1,
          day: 1,
          hour: 0,
          minute: 0,
          second: 0,
        },
        timeZone
      );

    default:
      throw new Error(`Invalid frequency: ${frequency}`);
  }
};

const parseValidatedCronExpression = (cronExpression: string) => {
  const validationResult = validateCronExpression(cronExpression);
  if (validationResult !== true) {
    throw new Error(validationResult);
  }

  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  const [minute = "*", hour = "*", dayOfMonth = "*", month = "*", dayOfWeek = "*"] = parts;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
};

const matchesCronPart = (field: string, value: number): boolean => {
  if (field === "*") {
    return true;
  }

  return field.split(",").some((part) => {
    if (part.startsWith("*/")) {
      const step = Number.parseInt(part.slice(2), 10);
      return step > 0 && value % step === 0;
    }

    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-");
      if (startRaw == null || endRaw == null) {
        return false;
      }

      const start = Number.parseInt(startRaw, 10);
      const end = Number.parseInt(endRaw, 10);
      return !Number.isNaN(start) && !Number.isNaN(end) && value >= start && value <= end;
    }

    return Number.parseInt(part, 10) === value;
  });
};

const matchesCronDayOfWeek = (field: string, weekday: number): boolean => {
  if (field === "*") {
    return true;
  }

  return matchesCronPart(field, weekday) || (weekday === 0 && matchesCronPart(field, 7));
};

const matchesCronDate = (
  date: Date,
  timeZone: string,
  {
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
  }: {
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
  }
): boolean => {
  const zonedParts = getTimeZoneDateParts(date, timeZone);

  if (!matchesCronPart(minute, zonedParts.minute)) {
    return false;
  }

  if (!matchesCronPart(hour, zonedParts.hour)) {
    return false;
  }

  if (!matchesCronPart(month, zonedParts.month)) {
    return false;
  }

  const dayOfMonthMatches = matchesCronPart(dayOfMonth, zonedParts.day);
  const dayOfWeekMatches = matchesCronDayOfWeek(dayOfWeek, zonedParts.weekday);
  const usesDayOfMonth = dayOfMonth !== "*";
  const usesDayOfWeek = dayOfWeek !== "*";

  if (usesDayOfMonth && usesDayOfWeek) {
    return dayOfMonthMatches || dayOfWeekMatches;
  }

  if (usesDayOfMonth) {
    return dayOfMonthMatches;
  }

  if (usesDayOfWeek) {
    return dayOfWeekMatches;
  }

  return true;
};

/**
 * Parses a cron expression and returns the next execution time.
 */
const getNextCronExecution = (cronExpression: string, fromDate?: Date, timeZone = "UTC"): Date => {
  const parts = parseValidatedCronExpression(cronExpression);
  const next = new Date(fromDate ?? new Date());
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);
  next.setUTCMinutes(next.getUTCMinutes() + 1);

  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCronDate(next, timeZone, parts)) {
      return next;
    }

    next.setUTCMinutes(next.getUTCMinutes() + 1);
  }

  throw new Error(`Unable to calculate next run for cron expression: ${cronExpression}`);
};

/**
 * Gets the next execution time based on schedule type.
 */
const getNextExecutionTime = (scheduledImport: ScheduledImport, fromDate?: Date): Date => {
  const timeZone = getScheduleTimeZone(scheduledImport);

  if (scheduledImport.scheduleType === "frequency" && scheduledImport.frequency) {
    return getNextFrequencyExecution(scheduledImport.frequency, fromDate, timeZone);
  } else if (scheduledImport.scheduleType === "cron" && scheduledImport.cronExpression) {
    return getNextCronExecution(scheduledImport.cronExpression, fromDate, timeZone);
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
    const nextRun = parseDateInput(scheduledImport.nextRun);
    if (nextRun) {
      return currentTime >= nextRun;
    }
  }

  // If no nextRun is set, calculate if it should run based on lastRun
  if (scheduledImport.lastRun) {
    try {
      const lastRun = parseDateInput(scheduledImport.lastRun);
      const nextRun = getNextExecutionTime(scheduledImport, lastRun ?? undefined);
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
  const timeZone = getScheduleTimeZone(scheduledImport);
  const zonedParts = getTimeZoneDateParts(currentTime, timeZone);
  const timeString = `${zonedParts.hour.toString().padStart(2, "0")}:${zonedParts.minute.toString().padStart(2, "0")}:${zonedParts.second.toString().padStart(2, "0")}`;
  const dateString = `${zonedParts.year.toString().padStart(4, "0")}-${zonedParts.month.toString().padStart(2, "0")}-${zonedParts.day.toString().padStart(2, "0")}`;

  return importName
    .replace("{{name}}", scheduledImport.name)
    .replace("{{date}}", dateString)
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

  // CRITICAL: Check if already running BEFORE queuing
  if (scheduledImport.lastStatus === "running") {
    logger.info("Skipping scheduled import - already running", {
      scheduledImportId: scheduledImport.id,
      name: scheduledImport.name,
    });
    return false;
  }

  const startTime = Date.now();
  const importName = generateImportName(scheduledImport.importNameTemplate, scheduledImport, currentTime);

  // CRITICAL: Set status to "running" BEFORE queuing job
  await payload.update({
    collection: COLLECTION_NAMES.SCHEDULED_IMPORTS,
    id: scheduledImport.id,
    data: {
      lastStatus: "running",
      lastRun: currentTime.toISOString(),
    },
  });

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
        // eslint-disable-next-line sonarjs/different-types-comparison -- Checking for object type is correct
        typeof scheduledImport.createdBy === "object" && scheduledImport.createdBy !== null
          ? scheduledImport.createdBy.id
          : scheduledImport.createdBy,
      triggeredBy: "schedule", // Add triggeredBy field
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

  // Update the scheduled import record with next run and history
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
      // Check feature flag - skip execution if disabled
      const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
      if (!(await isFeatureEnabled(payload, "enableScheduledJobExecution"))) {
        logger.info("Schedule manager job skipped - feature disabled", { jobId: job?.id });
        return {
          output: {
            success: true,
            skipped: true,
            reason: "Feature flag enableScheduledJobExecution is disabled",
          },
        };
      }

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
