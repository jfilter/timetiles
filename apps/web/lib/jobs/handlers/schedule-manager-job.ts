/**
 * Schedule Manager Job Handler
 *
 * This job runs periodically (every minute) to check for scheduled imports that need to be executed.
 * It creates new import-files records for scheduled URLs and triggers URL fetch jobs.
 * This implements a cron-like scheduler using Payload's job system.
 */

import { logError, logger } from "@/lib/logger";
import type { ScheduledImport } from "@/payload-types";

interface ScheduleManagerJobInput {
  // No input needed - this job scans all scheduled imports
}

/**
 * Gets the next execution time based on frequency (UTC)
 */
const getNextFrequencyExecution = (frequency: string, fromDate?: Date): Date => {
  const now = fromDate || new Date();
  const next = new Date(now);
  next.setSeconds(0);
  next.setMilliseconds(0);

  switch (frequency) {
    case "hourly":
      // Next hour at :00
      next.setMinutes(0);
      next.setHours(next.getHours() + 1);
      break;

    case "daily":
      // Next day at midnight UTC
      next.setMinutes(0);
      next.setHours(0);
      next.setDate(next.getDate() + 1);
      break;

    case "weekly":
      // Next Sunday at midnight UTC
      next.setMinutes(0);
      next.setHours(0);
      const daysUntilSunday = 7 - next.getDay() || 7;
      next.setDate(next.getDate() + daysUntilSunday);
      break;

    case "monthly":
      // First of next month at midnight UTC
      next.setMinutes(0);
      next.setHours(0);
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
      break;

    default:
      throw new Error(`Invalid frequency: ${frequency}`);
  }

  return next;
};

/**
 * Parses a cron expression and returns the next execution time (UTC)
 * Note: This is a basic implementation. For production, consider using a library like 'node-cron' or 'cron-parser'
 */
const getNextCronExecution = (cronExpression: string, fromDate?: Date): Date => {
  // For now, we'll implement basic cron parsing
  // In production, use a proper cron parsing library

  const now = fromDate || new Date();
  const parts = cronExpression.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  const [minute = "*", hour = "*", dayOfMonth = "*", month = "*", dayOfWeek = "*"] = parts;

  // Simple implementation for common patterns
  // This handles basic cases like "0 0 * * *" (daily at midnight), "0 * * * *" (hourly), etc.

  const next = new Date(now);
  next.setSeconds(0);
  next.setMilliseconds(0);

  // Handle minute
  if (minute !== "*") {
    const targetMinute = parseInt(minute);
    if (isNaN(targetMinute) || targetMinute < 0 || targetMinute > 59) {
      throw new Error(`Invalid minute in cron expression: ${minute}`);
    }
    next.setMinutes(targetMinute);
  }

  // Handle hour
  if (hour !== "*") {
    const targetHour = parseInt(hour);
    if (isNaN(targetHour) || targetHour < 0 || targetHour > 23) {
      throw new Error(`Invalid hour in cron expression: ${hour}`);
    }
    next.setHours(targetHour);
  }

  // If the calculated time is in the past, move to the next occurrence
  if (next <= now) {
    if (hour === "*" && minute === "*") {
      // Every minute
      next.setMinutes(next.getMinutes() + 1);
    } else if (hour === "*") {
      // Every hour at specific minute
      next.setHours(next.getHours() + 1);
    } else if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      // Daily at specific time
      next.setDate(next.getDate() + 1);
    } else {
      // For more complex expressions, add a day and let the user handle it
      next.setDate(next.getDate() + 1);
    }
  }

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
  const hasValidSchedule =
    (scheduledImport.scheduleType === "frequency" && scheduledImport.frequency) ||
    (scheduledImport.scheduleType === "cron" && scheduledImport.cronExpression);

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

export const scheduleManagerJob = {
  slug: "schedule-manager",
  handler: async ({ job, req }: any) => {
    const { payload } = req;

    try {
      logger.info("Starting schedule manager job", { jobId: job.id });

      const currentTime = new Date();

      // Find all enabled scheduled imports (excluding manual-only)
      const scheduledImports = await payload.find({
        collection: "scheduled-imports",
        where: {
          enabled: {
            equals: true,
          },
        },
        limit: 1000, // Reasonable limit for scheduled imports
      });

      logger.info("Found scheduled imports", {
        count: scheduledImports.docs.length,
        totalDocs: scheduledImports.totalDocs,
      });

      let triggeredCount = 0;
      let errorCount = 0;

      for (const scheduledImport of scheduledImports.docs) {
        try {
          // Check if this import should run now
          if (!shouldRunNow(scheduledImport, currentTime)) {
            continue;
          }

          const startTime = Date.now();

          // Generate import name from template
          let importName = scheduledImport.importNameTemplate || "{{name}} - {{date}}";
          importName = importName
            .replace("{{name}}", scheduledImport.name)
            .replace("{{date}}", currentTime.toISOString().split("T")[0])
            .replace("{{time}}", currentTime.toTimeString().split(" ")[0])
            .replace("{{url}}", new URL(scheduledImport.sourceUrl).hostname);

          // Queue the URL fetch job directly with all necessary parameters
          const urlFetchJob = await payload.jobs.queue({
            task: "url-fetch",
            input: {
              scheduledImportId: scheduledImport.id,
              sourceUrl: scheduledImport.sourceUrl,
              authConfig: scheduledImport.authConfig,
              catalogId:
                typeof scheduledImport.catalog === "object" ? scheduledImport.catalog.id : scheduledImport.catalog,
              originalName: importName,
              userId:
                typeof scheduledImport.createdBy === "object"
                  ? scheduledImport.createdBy.id
                  : scheduledImport.createdBy,
            },
          });

          // Calculate next run time
          let nextRun: Date;
          try {
            nextRun = getNextExecutionTime(scheduledImport, currentTime);
          } catch (error) {
            logger.error("Failed to calculate next run time", {
              scheduledImportId: scheduledImport.id,
              scheduleType: scheduledImport.scheduleType,
              frequency: scheduledImport.frequency,
              cronExpression: scheduledImport.cronExpression,
              error: error instanceof Error ? error.message : "Unknown error",
            });
            nextRun = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000); // Default to 24 hours
          }

          // Update execution history
          const executionHistory = scheduledImport.executionHistory || [];
          executionHistory.unshift({
            executedAt: currentTime,
            status: "success",
            jobId: urlFetchJob.id,
            duration: Date.now() - startTime,
          });

          // Keep only last 10 executions
          if (executionHistory.length > 10) {
            executionHistory.splice(10);
          }

          // Update statistics
          const stats = scheduledImport.statistics || {
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            averageDuration: 0,
          };
          stats.totalRuns++;
          stats.successfulRuns++;

          // Update the scheduled import record
          const updateData: any = {
            lastRun: currentTime,
            nextRun,
            lastStatus: "running",
            currentRetries: 0,
            executionHistory,
            statistics: stats,
          };

          await payload.update({
            collection: "scheduled-imports",
            id: scheduledImport.id,
            data: updateData,
          });

          triggeredCount++;

          logger.info("Triggered scheduled import", {
            scheduledImportId: scheduledImport.id,
            scheduledImportName: scheduledImport.name,
            urlFetchJobId: urlFetchJob.id,
            nextRun: nextRun ? nextRun.toISOString() : null,
            url: scheduledImport.sourceUrl,
            scheduleType: scheduledImport.scheduleType,
            frequency: scheduledImport.frequency,
          });
        } catch (error) {
          errorCount++;
          logError(error, "Failed to trigger scheduled import", {
            scheduledImportId: scheduledImport.id,
            name: scheduledImport.name,
            url: scheduledImport.sourceUrl,
          });

          // Update scheduled import with error status
          try {
            const stats = scheduledImport.statistics || {
              totalRuns: 0,
              successfulRuns: 0,
              failedRuns: 0,
              averageDuration: 0,
            };
            stats.totalRuns++;
            stats.failedRuns++;

            await payload.update({
              collection: "scheduled-imports",
              id: scheduledImport.id,
              data: {
                lastStatus: "failed",
                lastError: error instanceof Error ? error.message : "Unknown error",
                currentRetries: (scheduledImport.currentRetries || 0) + 1,
                statistics: stats,
              },
            });
          } catch (updateError) {
            logError(updateError, "Failed to update scheduled import error status");
          }

          // Continue with other scheduled imports even if one fails
          continue;
        }
      }

      logger.info("Schedule manager job completed", {
        jobId: job.id,
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
      logError(error, "Schedule manager job failed", { jobId: job.id });
      throw error;
    }
  },
};
