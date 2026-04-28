/**
 * Job handler for cleaning up stuck scheduled ingests.
 *
 * Identifies and resets scheduled ingests that have been stuck in "running"
 * status for too long (default 4 hours). The threshold is intentionally generous
 * because `lastRun` records the trigger/queue time, not when processing actually
 * started — there can be significant delay due to queue backlog or worker restarts.
 *
 * Before resetting, also checks whether a Payload job is still actively processing
 * the ingest to avoid killing in-progress work.
 *
 * @module
 * @category Jobs
 */

import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { logError, logger } from "@/lib/logger";
import { asSystem } from "@/lib/services/system-payload";
import { recordScheduledIngestFailure, resolveScheduledIngestStats } from "@/lib/types/run-statistics";
import { parseDateInput } from "@/lib/utils/date";
import type { ScheduledIngest } from "@/payload-types";

import type { JobHandlerContext } from "../utils/job-context";
import { hasActivePayloadJob, isResourceStuck } from "../utils/stuck-detection";

export interface CleanupStuckScheduledIngestsJobInput {
  /** Hours after which a running import is considered stuck (default: 4).
   * Uses 4h because `lastRun` is the trigger time, not when processing started. */
  stuckThresholdHours?: number;
  /** Whether to run in dry-run mode (default: false) */
  dryRun?: boolean;
}

/**
 * Resets a stuck import to failed status.
 */
/**
 * Cancel orphaned workflow jobs for a scheduled ingest.
 *
 * When a workflow gets stuck (e.g., server restart mid-processing), the
 * payload-job record stays pending indefinitely. This blocks concurrency
 * slots and prevents future imports from running. Mark them as completed
 * with an error so the concurrency key is released.
 */
const cancelOrphanedWorkflowJobs = async (
  payload: Payload,
  scheduledIngestId: number | string,
  currentTime: Date,
  thresholdHours: number
): Promise<number> => {
  const orphanedJobCutoff = new Date(currentTime.getTime() - thresholdHours * 60 * 60 * 1000).toISOString();

  try {
    const orphanedJobs = await asSystem(payload).find({
      collection: "payload-jobs" as const,
      where: {
        and: [
          { "input.scheduledIngestId": { equals: String(scheduledIngestId) } },
          { processing: { equals: false } },
          { completedAt: { exists: false } },
          { createdAt: { less_than: orphanedJobCutoff } },
        ],
      },
      limit: 50,
      pagination: false,
    });

    let cancelled = 0;
    for (const job of orphanedJobs.docs) {
      await asSystem(payload).update({
        collection: "payload-jobs" as const,
        id: job.id,
        data: { completedAt: new Date().toISOString(), hasError: true, processing: false },
      });
      cancelled++;
    }
    return cancelled;
  } catch (error) {
    logError(error, "Failed to cancel orphaned workflow jobs", { scheduledIngestId, orphanedJobCutoff });
    return 0;
  }
};

const resetStuckImport = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  currentTime: Date,
  thresholdHours: number
): Promise<void> => {
  try {
    // Calculate how long it was stuck
    const lastRunTime = scheduledIngest.lastRun ? parseDateInput(scheduledIngest.lastRun) : null;
    const stuckDuration = lastRunTime ? currentTime.getTime() - lastRunTime.getTime() : 0;

    // Cancel orphaned workflow jobs to release concurrency slots
    const cancelledJobs = await cancelOrphanedWorkflowJobs(payload, scheduledIngest.id, currentTime, thresholdHours);

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

    // Update statistics (also increments totalRuns — a stuck run is still a run)
    const stats = resolveScheduledIngestStats(scheduledIngest.statistics);
    const updatedStats = recordScheduledIngestFailure(stats);

    // Reset the import status
    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngest.id,
      data: {
        lastStatus: "failed",
        lastError: "Import was stuck and automatically reset by cleanup job",
        executionHistory,
        statistics: updatedStats,
      },
    });

    logger.info("Reset stuck scheduled ingest", {
      scheduledIngestId: scheduledIngest.id,
      name: scheduledIngest.name,
      stuckDurationMinutes: Math.round(stuckDuration / (1000 * 60)),
      cancelledWorkflowJobs: cancelledJobs,
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

    // Default 4h threshold accounts for the gap between trigger time (lastRun) and
    // actual processing start. See stuck-detection.ts for details.
    const stuckThresholdHours = input?.stuckThresholdHours ?? 4;
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
        const lastRunTime = scheduledIngest.lastRun ? parseDateInput(scheduledIngest.lastRun) : null;
        const stuckMinutes = lastRunTime
          ? Math.round((currentTime.getTime() - lastRunTime.getTime()) / (1000 * 60))
          : -1;

        // Secondary safety check: verify no Payload job is actively processing this ingest
        const isActive = await hasActivePayloadJob(payload, "input.scheduledIngestId", scheduledIngest.id);

        if (isActive) {
          logger.info("Scheduled ingest appears stuck but has active Payload job, skipping reset", {
            scheduledIngestId: scheduledIngest.id,
            name: scheduledIngest.name,
            stuckMinutes,
          });
          continue;
        }

        stuckCount++;
        logger.warn("Found stuck scheduled ingest", {
          scheduledIngestId: scheduledIngest.id,
          name: scheduledIngest.name,
          lastRun: lastRunTime?.toISOString(),
          stuckMinutes,
          dryRun,
        });

        if (!dryRun) {
          await resetStuckImport(payload, scheduledIngest, currentTime, thresholdHours);
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
