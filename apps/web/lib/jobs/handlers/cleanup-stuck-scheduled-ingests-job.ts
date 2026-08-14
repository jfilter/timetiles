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

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { failIngestJob } from "@/lib/jobs/utils/resource-loading";
import { logError, logger } from "@/lib/logger";
import { asSystem } from "@/lib/services/system-payload";
import { recordScheduledIngestFailure, resolveScheduledIngestStats } from "@/lib/types/run-statistics";
import { parseDateInput } from "@/lib/utils/date";
import type { ScheduledIngest } from "@/payload-types";

import type { JobHandlerContext } from "../utils/job-context";
import { cancelOrphanedWorkflowJobs, hasActivePayloadJob, isResourceStuck } from "../utils/stuck-detection";
import { updateScheduledIngestPaused, updateScheduledIngestSuccess } from "./url-fetch-job/scheduled-ingest-utils";

export interface CleanupStuckScheduledIngestsJobInput {
  /** Hours after which a running import is considered stuck (default: 4).
   * Uses 4h because `lastRun` is the trigger time, not when processing started. */
  stuckThresholdHours?: number;
  /** Whether to run in dry-run mode (default: false) */
  dryRun?: boolean;
}

/**
 * Fail the run's downstream ingest state left over by an abandoned scheduled-ingest run.
 *
 * A worker that dies mid-workflow leaves the ingest-file in a non-terminal status
 * (parsing/processing) and its ingest-jobs at whatever stage they were mid-flight —
 * nothing else ever revisits them: `ingest-files-cleanup-job` Pass A only reclaims
 * completed/failed rows, and Pass B skips any file still referenced by a row. Without
 * this, the CSV on disk and the stale rows leak forever for every killed run. Mirrors
 * `failStuckScraperRuns` in cleanup-stuck-scrapers-job.ts.
 */
const failStuckIngestFile = async (payload: Payload, scheduledIngestId: number | string): Promise<number> => {
  const sys = asSystem(payload);
  const stuckFiles = await sys.find({
    collection: COLLECTION_NAMES.INGEST_FILES,
    where: { scheduledIngest: { equals: scheduledIngestId }, status: { not_in: ["completed", "failed"] } },
    limit: 0,
    pagination: false,
  });

  for (const file of stuckFiles.docs) {
    const stuckJobs = await sys.find({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      where: {
        ingestFile: { equals: file.id },
        stage: { not_in: [PROCESSING_STAGE.COMPLETED, PROCESSING_STAGE.FAILED] },
      },
      pagination: false,
    });
    for (const job of stuckJobs.docs) {
      await failIngestJob(payload, job.id, new Error("Worker stopped before reporting a result"), "reaper");
    }

    await sys.update({
      collection: COLLECTION_NAMES.INGEST_FILES,
      id: file.id,
      data: { status: "failed", errorLog: "Import was stuck and automatically reset by cleanup job" },
    });
  }

  return stuckFiles.docs.length;
};

/** What a finished-but-unreconciled run should have written for itself. */
interface UnreconciledOutcome {
  status: "success" | "paused";
  ingestFileId: number | string;
  duration: number;
  reason: string;
}

const getReviewReason = (reviewJob: { reviewReason?: unknown }): string =>
  typeof reviewJob.reviewReason === "string" && reviewJob.reviewReason.length > 0
    ? reviewJob.reviewReason
    : "manual review required";

/**
 * Reconstruct the outcome of a run that finished but never got its status written.
 *
 * The workflow's `reconcileLifecycle` gives up after its backoff, so a DB outage in
 * the last seconds of a healthy run strands the schedule at `lastStatus: "running"`
 * with nothing actually wrong. The run's own ingest state is the marker that tells
 * that apart from a worker that died mid-import: an ingest file from this run that
 * reached `completed` means the import worked, and a job parked at NEEDS_REVIEW means
 * it is waiting on a human. Recording either as failed burns a retry towards
 * auto-disable — and for a review it also destroys the pending review, because
 * `failStuckIngestFile` fails every non-terminal job it finds.
 */
const resolveUnreconciledOutcome = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  currentTime: Date
): Promise<UnreconciledOutcome | null> => {
  const sys = asSystem(payload);
  const files = await sys.find({
    collection: COLLECTION_NAMES.INGEST_FILES,
    where: { scheduledIngest: { equals: scheduledIngest.id } },
    sort: "-createdAt",
    limit: 1,
    depth: 0,
  });

  const file = files.docs[0];
  if (!file) return null;

  // Only the run that is stuck right now counts. A completed file from an earlier
  // run says nothing about this one.
  const lastRunTime = scheduledIngest.lastRun ? parseDateInput(scheduledIngest.lastRun) : null;
  const createdAt = parseDateInput(file.createdAt);
  if (lastRunTime && createdAt && createdAt.getTime() < lastRunTime.getTime()) return null;

  const finishedAt = parseDateInput(file.updatedAt) ?? currentTime;
  const duration = lastRunTime ? Math.max(0, finishedAt.getTime() - lastRunTime.getTime()) : 0;

  if (file.status === "completed") {
    return { status: "success", ingestFileId: file.id, duration, reason: "" };
  }

  const reviewJobs = await sys.find({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    where: { ingestFile: { equals: file.id }, stage: { equals: PROCESSING_STAGE.NEEDS_REVIEW } },
    limit: 1,
  });

  const reviewJob = reviewJobs.docs[0];
  if (reviewJob) {
    return {
      status: "paused",
      ingestFileId: file.id,
      duration,
      reason: `Scheduled ingest paused for review: ${getReviewReason(reviewJob)}`,
    };
  }

  return null;
};

/** Write the status the finished run could not write itself. */
const applyUnreconciledOutcome = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  outcome: UnreconciledOutcome
): Promise<void> => {
  if (outcome.status === "success") {
    await updateScheduledIngestSuccess(payload, scheduledIngest, outcome.ingestFileId, outcome.duration);
    return;
  }

  await updateScheduledIngestPaused(payload, scheduledIngest, outcome.ingestFileId, outcome.duration, outcome.reason);
};

/**
 * How far past the stuck threshold the schedule is released even if the dependent
 * cleanup keeps failing.
 *
 * `lastStatus = "running"` is the only handle this reaper has: the scheduler skips
 * such rows and the atomic claim rejects them, so a schedule stuck there can never
 * run again. Doing the dependent cleanup first is right for a transient failure,
 * but a deterministic one would otherwise keep the schedule dead forever.
 * Mirrors FORCE_RESET_THRESHOLD_MULTIPLE in cleanup-stuck-scrapers-job.
 */
const FORCE_RESET_THRESHOLD_MULTIPLE = 6;

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
    const mayForce = stuckDuration > thresholdHours * FORCE_RESET_THRESHOLD_MULTIPLE * 60 * 60 * 1000;

    // Cancel orphaned workflow jobs to release concurrency slots, and fail the run's
    // downstream ingest-file/ingest-jobs state so it isn't left dangling non-terminal.
    let cancelledJobs = 0;
    let failedFiles = 0;
    try {
      cancelledJobs = await cancelOrphanedWorkflowJobs(
        payload,
        "input.scheduledIngestId",
        scheduledIngest.id,
        currentTime,
        thresholdHours
      );
      failedFiles = await failStuckIngestFile(payload, scheduledIngest.id);
    } catch (error) {
      if (!mayForce) throw error;
      // A schedule that can never run again is worse than a leftover job record.
      logError(error, "Releasing stuck scheduled ingest despite failed dependent cleanup", {
        scheduledIngestId: scheduledIngest.id,
        name: scheduledIngest.name,
        stuckDurationMinutes: Math.round(stuckDuration / (1000 * 60)),
      });
    }

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
      failedIngestFiles: failedFiles,
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
        // 0 lifts the limit; a number would cap the reaper itself — see cleanup-stuck-scrapers-job.
        limit: 0,
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
        // Omitted when nothing was reconciled — the common case reports the same
        // shape it always did.
        reconciledCount: processResult.reconciledCount > 0 ? processResult.reconciledCount : undefined,
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

/** What a single running schedule turned out to be. */
type StuckImportOutcome = "not-stuck" | "active" | "reconciled" | "stuck";

/**
 * Classify one running schedule and resolve it.
 *
 * Reset failures propagate: the caller records them per schedule and leaves
 * `lastStatus` alone, so the next pass revisits the same row.
 */
const processStuckImport = async (
  scheduledIngest: ScheduledIngest,
  payload: Payload,
  currentTime: Date,
  thresholdHours: number,
  dryRun: boolean
): Promise<StuckImportOutcome> => {
  if (!isResourceStuck(scheduledIngest.lastStatus, "running", scheduledIngest.lastRun, currentTime, thresholdHours)) {
    return "not-stuck";
  }

  const lastRunTime = scheduledIngest.lastRun ? parseDateInput(scheduledIngest.lastRun) : null;
  const stuckMinutes = lastRunTime ? Math.round((currentTime.getTime() - lastRunTime.getTime()) / (1000 * 60)) : -1;

  // Secondary safety check: verify no Payload job is actively processing this ingest
  const isActive = await hasActivePayloadJob(payload, "input.scheduledIngestId", scheduledIngest.id);
  if (isActive) {
    logger.info("Scheduled ingest appears stuck but has active Payload job, skipping reset", {
      scheduledIngestId: scheduledIngest.id,
      name: scheduledIngest.name,
      stuckMinutes,
    });
    return "active";
  }

  // Not every schedule sitting at "running" is stuck: one whose run finished while
  // the status write kept failing only lost its bookkeeping.
  const unreconciled = await resolveUnreconciledOutcome(payload, scheduledIngest, currentTime);
  if (unreconciled) {
    logger.info("Scheduled ingest run had already finished; reconciling its status instead of failing it", {
      scheduledIngestId: scheduledIngest.id,
      name: scheduledIngest.name,
      outcome: unreconciled.status,
      ingestFileId: unreconciled.ingestFileId,
      stuckMinutes,
      dryRun,
    });
    if (!dryRun) {
      await applyUnreconciledOutcome(payload, scheduledIngest, unreconciled);
    }
    return "reconciled";
  }

  logger.warn("Found stuck scheduled ingest", {
    scheduledIngestId: scheduledIngest.id,
    name: scheduledIngest.name,
    lastRun: lastRunTime?.toISOString(),
    stuckMinutes,
    dryRun,
  });

  if (!dryRun) {
    await resetStuckImport(payload, scheduledIngest, currentTime, thresholdHours);
  }

  return "stuck";
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
): Promise<{
  stuckCount: number;
  resetCount: number;
  reconciledCount: number;
  errors: Array<{ id: string; name: string; error: string }>;
}> => {
  let stuckCount = 0;
  let resetCount = 0;
  let reconciledCount = 0;
  const errors: Array<{ id: string; name: string; error: string }> = [];

  for (const scheduledIngest of imports) {
    try {
      const outcome = await processStuckImport(scheduledIngest, payload, currentTime, thresholdHours, dryRun);

      if (outcome === "reconciled") reconciledCount++;
      if (outcome === "stuck") {
        stuckCount++;
        if (!dryRun) resetCount++;
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

  return { stuckCount, resetCount, reconciledCount, errors };
};
