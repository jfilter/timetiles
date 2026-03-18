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

import { JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { isValidTransition, STAGE_TO_JOB_TYPE } from "@/lib/constants/stage-graph";
import { logger } from "@/lib/logger";
import type { ImportJob } from "@/payload-types";

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
    return isValidTransition(fromStage, toStage);
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
    const jobType = STAGE_TO_JOB_TYPE[job.stage];

    // Stages with no automatic job
    if (jobType === null || jobType === undefined) {
      if (job.stage === PROCESSING_STAGE.AWAIT_APPROVAL) {
        logger.info("Import requires manual approval", { importJobId: job.id });
      } else if (job.stage === PROCESSING_STAGE.COMPLETED) {
        logger.info("Import job completed successfully", { importJobId: job.id });
      } else if (job.stage === PROCESSING_STAGE.FAILED) {
        logger.error("Import job failed", { importJobId: job.id });
      } else {
        logger.warn("Unknown stage for job queuing", { importJobId: job.id, stage: job.stage });
      }
      return { queued: false };
    }

    // Geocode batch needs batchNumber input
    const input =
      jobType === JOB_TYPES.GEOCODE_BATCH ? { importJobId: job.id, batchNumber: 0 } : { importJobId: job.id };

    await payload.jobs.queue({ task: jobType, input });
    return { queued: true, jobType };
  }
}
