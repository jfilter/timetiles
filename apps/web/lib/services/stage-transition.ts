/**
 * Provides atomic stage transition management for import jobs.
 *
 * This service ensures that stage transitions and job queuing happen atomically
 * to prevent race conditions and duplicate job creation. It manages the entire
 * transition lifecycle including validation, queuing, and state tracking.
 *
 * Key responsibilities:
 * - Atomic stage transition processing
 * - Stage transition validation
 * - Centralized job queuing logic.
 *
 * @module
 */
import type { Payload } from "payload";

import { JOB_TYPES, PROCESSING_STAGE, type ProcessingStage } from "@/lib/constants/import-constants";
import { logger } from "@/lib/logger";
import type { ImportJob } from "@/payload-types";

// Valid stage transitions map
const VALID_STAGE_TRANSITIONS: Partial<Record<ProcessingStage, ProcessingStage[]>> = {
  [PROCESSING_STAGE.ANALYZE_DUPLICATES]: [PROCESSING_STAGE.DETECT_SCHEMA],
  [PROCESSING_STAGE.DETECT_SCHEMA]: [PROCESSING_STAGE.VALIDATE_SCHEMA],
  [PROCESSING_STAGE.VALIDATE_SCHEMA]: [
    PROCESSING_STAGE.AWAIT_APPROVAL,
    PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
    PROCESSING_STAGE.GEOCODE_BATCH,
  ],
  [PROCESSING_STAGE.AWAIT_APPROVAL]: [PROCESSING_STAGE.CREATE_SCHEMA_VERSION],
  [PROCESSING_STAGE.CREATE_SCHEMA_VERSION]: [PROCESSING_STAGE.GEOCODE_BATCH],
  [PROCESSING_STAGE.GEOCODE_BATCH]: [PROCESSING_STAGE.CREATE_EVENTS],
  [PROCESSING_STAGE.CREATE_EVENTS]: [PROCESSING_STAGE.COMPLETED],
  [PROCESSING_STAGE.COMPLETED]: [], // Terminal state
  [PROCESSING_STAGE.FAILED]: [
    // Recovery stages - must match isValidRecoveryStage() in import-jobs/hooks.ts
    PROCESSING_STAGE.ANALYZE_DUPLICATES,
    PROCESSING_STAGE.DETECT_SCHEMA,
    PROCESSING_STAGE.VALIDATE_SCHEMA,
    PROCESSING_STAGE.GEOCODE_BATCH,
  ],
};

export interface StageTransitionResult {
  success: boolean;
  jobQueued?: boolean;
  queuedJobType?: string;
  error?: string;
}

/**
 * Service to handle stage transitions atomically.
 */
export class StageTransitionService {
  /**
   * Validate stage transition.
   */
  static validateStageTransition(fromStage: string, toStage: string): boolean {
    // Allow transitions to failed state from any stage
    if (toStage === PROCESSING_STAGE.FAILED) return true;

    // Allow staying in the same stage (for updates)
    if (fromStage === toStage) return true;

    // Check if transition is valid
    const validTransitions = VALID_STAGE_TRANSITIONS[fromStage as ProcessingStage] ?? [];
    return validTransitions.includes(toStage as ProcessingStage);
  }

  /**
   * Process stage transition and queue appropriate jobs atomically.
   */
  static async processStageTransition(
    payload: Payload,
    job: ImportJob,
    previousJob: ImportJob | undefined
  ): Promise<StageTransitionResult> {
    const jobId = String(job.id);

    // Skip if no stage change
    if (job.stage === previousJob?.stage) {
      return { success: true };
    }

    // Validate transition
    if (previousJob?.stage && !this.validateStageTransition(previousJob.stage, job.stage)) {
      const error = `Invalid stage transition from '${previousJob.stage}' to '${job.stage}'`;
      logger.error(error, { importJobId: jobId });
      return { success: false, error };
    }

    try {
      logger.info("Processing stage transition", {
        importJobId: jobId,
        fromStage: previousJob?.stage,
        toStage: job.stage,
      });

      // Queue appropriate job based on new stage
      const queueResult = await this.queueStageJob(payload, job);

      return { success: true, jobQueued: queueResult.queued, queuedJobType: queueResult.jobType };
    } catch (error) {
      logger.error("Stage transition failed", {
        importJobId: jobId,
        fromStage: previousJob?.stage,
        toStage: job.stage,
        error,
      });

      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  /**
   * Queue appropriate job for the current stage.
   */
  private static async queueStageJob(payload: Payload, job: ImportJob): Promise<{ queued: boolean; jobType?: string }> {
    switch (job.stage) {
      case PROCESSING_STAGE.ANALYZE_DUPLICATES:
        await payload.jobs.queue({ task: JOB_TYPES.ANALYZE_DUPLICATES, input: { importJobId: job.id } });
        return { queued: true, jobType: JOB_TYPES.ANALYZE_DUPLICATES };

      case PROCESSING_STAGE.DETECT_SCHEMA:
        await payload.jobs.queue({ task: JOB_TYPES.DETECT_SCHEMA, input: { importJobId: job.id } });
        return { queued: true, jobType: JOB_TYPES.DETECT_SCHEMA };

      case PROCESSING_STAGE.VALIDATE_SCHEMA:
        await payload.jobs.queue({ task: JOB_TYPES.VALIDATE_SCHEMA, input: { importJobId: job.id } });
        return { queued: true, jobType: JOB_TYPES.VALIDATE_SCHEMA };

      case PROCESSING_STAGE.AWAIT_APPROVAL:
        // Send notification to user
        logger.info("Import requires manual approval", { importJobId: job.id });
        // No automatic advancement from this stage
        return { queued: false };

      case PROCESSING_STAGE.CREATE_SCHEMA_VERSION:
        await payload.jobs.queue({ task: JOB_TYPES.CREATE_SCHEMA_VERSION, input: { importJobId: job.id } });
        return { queued: true, jobType: JOB_TYPES.CREATE_SCHEMA_VERSION };

      case PROCESSING_STAGE.GEOCODE_BATCH:
        await payload.jobs.queue({ task: JOB_TYPES.GEOCODE_BATCH, input: { importJobId: job.id, batchNumber: 0 } });
        return { queued: true, jobType: JOB_TYPES.GEOCODE_BATCH };

      case PROCESSING_STAGE.CREATE_EVENTS:
        await payload.jobs.queue({ task: JOB_TYPES.CREATE_EVENTS, input: { importJobId: job.id } });
        return { queued: true, jobType: JOB_TYPES.CREATE_EVENTS };

      case PROCESSING_STAGE.COMPLETED:
        logger.info("Import job completed successfully", { importJobId: job.id });
        return { queued: false };

      case PROCESSING_STAGE.FAILED:
        logger.error("Import job failed", { importJobId: job.id });
        return { queued: false };

      default:
        logger.warn("Unknown stage for job queuing", { importJobId: job.id, stage: job.stage });
        return { queued: false };
    }
  }
}
