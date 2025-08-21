/**
 * Job handler for cleaning up stuck scheduled imports.
 *
 * Identifies and resets scheduled imports that have been stuck in "running"
 * status for too long (default 2 hours). This prevents permanent blocking
 * of scheduled imports due to job failures or system crashes.
 *
 * @module
 * @category Jobs
 */

import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/import-constants";
import { logError, logger } from "@/lib/logger";
import type { ScheduledImport } from "@/payload-types";

import type { JobHandlerContext } from "../utils/job-context";

export interface CleanupStuckScheduledImportsJobInput {
  /** Hours after which a running import is considered stuck (default: 2) */
  stuckThresholdHours?: number;
  /** Whether to run in dry-run mode (default: false) */
  dryRun?: boolean;
}

/**
 * Determines if an import is stuck based on last run time
 */
const isImportStuck = (scheduledImport: ScheduledImport, currentTime: Date, thresholdHours: number): boolean => {
  if (scheduledImport.lastStatus !== "running") {
    return false;
  }

  if (!scheduledImport.lastRun) {
    // If status is running but no lastRun, it's definitely stuck
    return true;
  }

  const lastRunTime = new Date(scheduledImport.lastRun);
  const timeDiffMs = currentTime.getTime() - lastRunTime.getTime();
  const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

  return timeDiffHours >= thresholdHours;
};

/**
 * Resets a stuck import to failed status
 */
const resetStuckImport = async (
  payload: Payload,
  scheduledImport: ScheduledImport,
  currentTime: Date
): Promise<void> => {
  try {
    // Calculate how long it was stuck
    const stuckDuration = scheduledImport.lastRun
      ? currentTime.getTime() - new Date(scheduledImport.lastRun).getTime()
      : 0;

    // Update execution history with failure
    const executionHistory = scheduledImport.executionHistory ?? [];
    executionHistory.unshift({
      executedAt: currentTime.toISOString(),
      status: "failed",
      error: `Import was stuck in running state for ${Math.round(stuckDuration / (1000 * 60))} minutes`,
      duration: stuckDuration,
    });

    // Keep only last 10 executions
    if (executionHistory.length > 10) {
      executionHistory.splice(10);
    }

    // Update statistics
    const stats = scheduledImport.statistics ?? {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageDuration: 0,
    };
    stats.failedRuns = (stats.failedRuns ?? 0) + 1;

    // Reset the import status
    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_IMPORTS,
      id: scheduledImport.id,
      data: {
        lastStatus: "failed",
        lastError: "Import was stuck and automatically reset by cleanup job",
        executionHistory,
        statistics: stats,
      },
    });

    logger.info("Reset stuck scheduled import", {
      scheduledImportId: scheduledImport.id,
      name: scheduledImport.name,
      stuckDurationMinutes: Math.round(stuckDuration / (1000 * 60)),
    });
  } catch (error) {
    logError(error, "Failed to reset stuck import", {
      scheduledImportId: scheduledImport.id,
      name: scheduledImport.name,
    });
    throw error;
  }
};

export const cleanupStuckScheduledImportsJob = {
  slug: "cleanup-stuck-scheduled-imports",
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as CleanupStuckScheduledImportsJobInput;

    if (!payload) {
      throw new Error("Payload not available in job context");
    }

    const stuckThresholdHours = input?.stuckThresholdHours ?? 2;
    const dryRun = input?.dryRun ?? false;
    const currentTime = new Date();

    try {
      logger.info("Starting cleanup stuck scheduled imports job", {
        jobId: context.job?.id ?? context.id,
        stuckThresholdHours,
        dryRun,
      });

      // Find all scheduled imports with "running" status
      const runningImports = await payload.find({
        collection: COLLECTION_NAMES.SCHEDULED_IMPORTS,
        where: {
          lastStatus: {
            equals: "running",
          },
        },
        limit: 1000,
      });

      logger.info("Found running scheduled imports", {
        count: runningImports.docs.length,
      });

      const processResult = await processStuckImports(
        runningImports.docs,
        payload,
        currentTime,
        stuckThresholdHours,
        dryRun
      );

      const result = {
        success: true,
        totalRunning: runningImports.docs.length,
        stuckCount: processResult.stuckCount,
        resetCount: processResult.resetCount,
        dryRun,
        errors: processResult.errors.length > 0 ? processResult.errors : undefined,
      };

      logger.info("Cleanup stuck scheduled imports job completed", {
        jobId: context.job?.id ?? context.id,
        ...result,
      });

      return { output: result };
    } catch (error) {
      logError(error, "Cleanup stuck scheduled imports job failed", {
        jobId: context.job?.id ?? context.id,
      });
      throw error;
    }
  },
};

/**
 * Process all stuck imports
 */
const processStuckImports = async (
  imports: ScheduledImport[],
  payload: Payload,
  currentTime: Date,
  thresholdHours: number,
  dryRun: boolean
): Promise<{ stuckCount: number; resetCount: number; errors: Array<{ id: string; name: string; error: string }> }> => {
  let stuckCount = 0;
  let resetCount = 0;
  const errors: Array<{ id: string; name: string; error: string }> = [];

  for (const scheduledImport of imports) {
    try {
      if (isImportStuck(scheduledImport, currentTime, thresholdHours)) {
        stuckCount++;

        const lastRunTime = scheduledImport.lastRun ? new Date(scheduledImport.lastRun) : null;
        const stuckMinutes = lastRunTime
          ? Math.round((currentTime.getTime() - lastRunTime.getTime()) / (1000 * 60))
          : -1;

        logger.warn("Found stuck scheduled import", {
          scheduledImportId: scheduledImport.id,
          name: scheduledImport.name,
          lastRun: lastRunTime?.toISOString(),
          stuckMinutes,
          dryRun,
        });

        if (!dryRun) {
          await resetStuckImport(payload, scheduledImport, currentTime);
          resetCount++;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push({
        id: scheduledImport.id.toString(),
        name: scheduledImport.name,
        error: errorMessage,
      });
      logError(error, "Failed to process scheduled import in cleanup", {
        scheduledImportId: scheduledImport.id,
        name: scheduledImport.name,
      });
    }
  }

  return { stuckCount, resetCount, errors };
};
