/**
 * Job handler for cleaning up stuck scheduled ingests.
 *
 * Identifies and resets scheduled ingests that have been stuck in "running"
 * status for too long (default 2 hours). This prevents permanent blocking
 * of scheduled ingests due to job failures or system crashes.
 *
 * @module
 * @category Jobs
 */

import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { logError, logger } from "@/lib/logger";
import { parseDateInput } from "@/lib/utils/date";
import type { ScheduledIngest } from "@/payload-types";

import type { JobHandlerContext } from "../utils/job-context";
import { isResourceStuck } from "../utils/stuck-detection";

export interface CleanupStuckScheduledIngestsJobInput {
  /** Hours after which a running import is considered stuck (default: 2) */
  stuckThresholdHours?: number;
  /** Whether to run in dry-run mode (default: false) */
  dryRun?: boolean;
}

/**
 * Resets a stuck import to failed status.
 */
const resetStuckImport = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  currentTime: Date
): Promise<void> => {
  try {
    // Calculate how long it was stuck
    const lastRunTime = scheduledIngest.lastRun ? parseDateInput(scheduledIngest.lastRun) : null;
    const stuckDuration = lastRunTime ? currentTime.getTime() - lastRunTime.getTime() : 0;

    // Update execution history with failure
    const executionHistory = scheduledIngest.executionHistory ?? [];
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
    const stats = scheduledIngest.statistics ?? { totalRuns: 0, successfulRuns: 0, failedRuns: 0, averageDuration: 0 };
    stats.failedRuns = (stats.failedRuns ?? 0) + 1;

    // Reset the import status
    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngest.id,
      data: {
        lastStatus: "failed",
        lastError: "Import was stuck and automatically reset by cleanup job",
        executionHistory,
        statistics: stats,
      },
    });

    logger.info("Reset stuck scheduled ingest", {
      scheduledIngestId: scheduledIngest.id,
      name: scheduledIngest.name,
      stuckDurationMinutes: Math.round(stuckDuration / (1000 * 60)),
    });
  } catch (error) {
    logError(error, "Failed to reset stuck import", {
      scheduledIngestId: scheduledIngest.id,
      name: scheduledIngest.name,
    });
    throw error;
  }
};

export const cleanupStuckScheduledIngestsJob = {
  slug: "cleanup-stuck-scheduled-ingests",
  schedule: [{ cron: "0 * * * *", queue: "maintenance" as const }],
  concurrency: () => "cleanup-stuck-scheduled-ingests",
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as CleanupStuckScheduledIngestsJobInput;

    const stuckThresholdHours = input?.stuckThresholdHours ?? 2;
    const dryRun = input?.dryRun ?? false;
    const currentTime = new Date();

    try {
      logger.info("Starting cleanup stuck scheduled ingests job", {
        jobId: context.job?.id,
        stuckThresholdHours,
        dryRun,
      });

      // Find all scheduled ingests with "running" status
      const runningImports = await payload.find({
        collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
        where: { lastStatus: { equals: "running" } },
        limit: 1000,
        pagination: false,
      });

      logger.info("Found running scheduled ingests", { count: runningImports.docs.length });

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

      logger.info("Cleanup stuck scheduled ingests job completed", { jobId: context.job?.id, ...result });

      return { output: result };
    } catch (error) {
      logError(error, "Cleanup stuck scheduled ingests job failed", { jobId: context.job?.id });
      throw error;
    }
  },
};

/**
 * Process all stuck imports.
 */
const processStuckImports = async (
  imports: ScheduledIngest[],
  payload: Payload,
  currentTime: Date,
  thresholdHours: number,
  dryRun: boolean
): Promise<{ stuckCount: number; resetCount: number; errors: Array<{ id: string; name: string; error: string }> }> => {
  let stuckCount = 0;
  let resetCount = 0;
  const errors: Array<{ id: string; name: string; error: string }> = [];

  for (const scheduledIngest of imports) {
    try {
      if (
        isResourceStuck(scheduledIngest.lastStatus, "running", scheduledIngest.lastRun, currentTime, thresholdHours)
      ) {
        stuckCount++;

        const lastRunTime = scheduledIngest.lastRun ? parseDateInput(scheduledIngest.lastRun) : null;
        const stuckMinutes = lastRunTime
          ? Math.round((currentTime.getTime() - lastRunTime.getTime()) / (1000 * 60))
          : -1;

        logger.warn("Found stuck scheduled ingest", {
          scheduledIngestId: scheduledIngest.id,
          name: scheduledIngest.name,
          lastRun: lastRunTime?.toISOString(),
          stuckMinutes,
          dryRun,
        });

        if (!dryRun) {
          await resetStuckImport(payload, scheduledIngest, currentTime);
          resetCount++;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push({ id: scheduledIngest.id.toString(), name: scheduledIngest.name, error: errorMessage });
      logError(error, "Failed to process scheduled ingest in cleanup", {
        scheduledIngestId: scheduledIngest.id,
        name: scheduledIngest.name,
      });
    }
  }

  return { stuckCount, resetCount, errors };
};
