/**
 * @module Provides error recovery mechanisms for failed import jobs.
 *
 * This service handles recovery from various failure scenarios in the import pipeline.
 * It provides retry logic, error classification, and automatic recovery strategies
 * to improve system resilience and reduce manual intervention requirements.
 *
 * Key responsibilities:
 * - Retry failed jobs with exponential backoff
 * - Classify errors as recoverable vs permanent
 * - Reset job state for recovery attempts
 * - Track retry attempts and failure patterns
 * - Provide manual recovery tools for operators
 */
import type { Payload } from "payload";

import { JOB_TYPES, type JobType, PROCESSING_STAGE, type ProcessingStage } from "@/lib/constants/import-constants";
import { logError, logger } from "@/lib/logger";
import type { ImportJob } from "@/payload-types";

interface ErrorLogState {
  lastError?: string;
  recoveryAttempt?: {
    attempt: number;
    previousError?: string;
    recoveryStage: string;
    classification: string;
  };
  [key: string]: unknown;
}

const getErrorLogState = (job: { errorLog?: unknown }): ErrorLogState | null => {
  if (job.errorLog && typeof job.errorLog === "object" && !Array.isArray(job.errorLog)) {
    return job.errorLog as ErrorLogState;
  }
  return null;
};

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface ErrorClassification {
  type: "recoverable" | "permanent" | "user-action-required";
  reason: string;
  suggestedAction?: string;
  retryable: boolean;
}

export interface RecoveryResult {
  success: boolean;
  action: string;
  error?: string;
  retryScheduled?: boolean;
  nextRetryAt?: Date;
}

/**
 * Service for handling import job error recovery
 */
export class ErrorRecoveryService {
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 30000, // 30 seconds
    maxDelayMs: 300000, // 5 minutes
    backoffMultiplier: 2,
  };

  /**
   * Attempt to recover a failed import job
   */
  static async recoverFailedJob(
    payload: Payload,
    jobId: string | number,
    retryConfig: Partial<RetryConfig> = {}
  ): Promise<RecoveryResult> {
    const config = { ...this.DEFAULT_RETRY_CONFIG, ...retryConfig };

    try {
      // Get the failed job
      const job = await payload.findByID({
        collection: "import-jobs",
        id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      });

      if (!job) {
        return { success: false, action: "job_not_found", error: "Import job not found" };
      }

      if (job.stage !== PROCESSING_STAGE.FAILED) {
        return { success: false, action: "not_failed", error: "Job is not in failed state" };
      }

      // Classify the error
      const classification = this.classifyError(job);

      if (!classification.retryable) {
        return {
          success: false,
          action: "not_retryable",
          error: `Error is not retryable: ${classification.reason}`,
        };
      }

      // Check retry count
      const retryCount = job.retryAttempts || 0;
      if (retryCount >= config.maxRetries) {
        return {
          success: false,
          action: "max_retries_exceeded",
          error: `Maximum retry attempts (${config.maxRetries}) exceeded`,
        };
      }

      // Calculate retry delay
      const delay = Math.min(config.baseDelayMs * Math.pow(config.backoffMultiplier, retryCount), config.maxDelayMs);

      const nextRetryAt = new Date(Date.now() + delay);

      // Reset job to appropriate recovery stage
      const recoveryStage = this.determineRecoveryStage(job, classification);

      await payload.update({
        collection: "import-jobs",
        id: job.id,
        data: {
          stage: recoveryStage,
          retryAttempts: retryCount + 1,
          lastRetryAt: new Date().toISOString() as any,
          nextRetryAt: nextRetryAt.toISOString() as any,
          errorLog: {
            ...(getErrorLogState(job) || {}),
            recoveryAttempt: {
              attempt: retryCount + 1,
              previousError: getErrorLogState(job)?.lastError,
              recoveryStage,
              classification: classification.type,
            },
          },
        },
      });

      // Retry will be picked up by a periodic job that checks for ready retries

      logger.info("Scheduled job recovery", {
        importJobId: job.id,
        retryAttempt: retryCount + 1,
        recoveryStage,
        nextRetryAt,
      });

      return {
        success: true,
        action: "retry_scheduled",
        retryScheduled: true,
        nextRetryAt,
      };
    } catch (error) {
      logError(error, "Failed to recover import job", { jobId });
      return {
        success: false,
        action: "recovery_failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Classify error type to determine recovery strategy
   */
  private static classifyError(job: ImportJob): ErrorClassification {
    const errorMessage = getErrorLogState(job)?.lastError?.toLowerCase() || "";

    // File access errors - often recoverable
    if (errorMessage.includes("enoent") || errorMessage.includes("file not found")) {
      return {
        type: "permanent",
        reason: "File not found - file may have been deleted",
        retryable: false,
      };
    }

    // Network/database connection errors - usually recoverable
    if (
      errorMessage.includes("connection") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("econnrefused")
    ) {
      return {
        type: "recoverable",
        reason: "Network or database connection issue",
        retryable: true,
      };
    }

    // Memory/resource errors - often recoverable with delay
    if (errorMessage.includes("memory") || errorMessage.includes("resource")) {
      return {
        type: "recoverable",
        reason: "Resource exhaustion - may resolve with delay",
        retryable: true,
      };
    }

    // Schema validation errors - may need user action
    if (errorMessage.includes("schema") || errorMessage.includes("validation")) {
      return {
        type: "user-action-required",
        reason: "Schema or validation error - may need manual review",
        suggestedAction: "Review schema configuration or data format",
        retryable: true, // Allow retry in case of transient validation issues
      };
    }

    // Rate limiting - definitely recoverable
    if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
      return {
        type: "recoverable",
        reason: "Rate limiting - will resolve with delay",
        retryable: true,
      };
    }

    // Permission errors - usually permanent
    if (errorMessage.includes("permission") || errorMessage.includes("unauthorized")) {
      return {
        type: "permanent",
        reason: "Permission denied - needs configuration fix",
        retryable: false,
      };
    }

    // Default to recoverable for unknown errors
    return {
      type: "recoverable",
      reason: "Unknown error - attempting recovery",
      retryable: true,
    };
  }

  /**
   * Determine which stage to restart from based on where failure occurred
   */
  private static determineRecoveryStage(job: ImportJob, classification: ErrorClassification): ProcessingStage {
    // For validation errors, restart from schema validation
    if (classification.type === "user-action-required" && classification.reason.includes("schema")) {
      return PROCESSING_STAGE.VALIDATE_SCHEMA;
    }

    // For most recoverable errors, restart from current stage
    if (job.lastSuccessfulStage) {
      // Restart from the last successful stage
      const stageOrder = [
        PROCESSING_STAGE.ANALYZE_DUPLICATES,
        PROCESSING_STAGE.DETECT_SCHEMA,
        PROCESSING_STAGE.VALIDATE_SCHEMA,
        PROCESSING_STAGE.AWAIT_APPROVAL,
        PROCESSING_STAGE.GEOCODE_BATCH,
        PROCESSING_STAGE.CREATE_EVENTS,
      ];

      const lastSuccessfulIndex = stageOrder.indexOf(job.lastSuccessfulStage);
      if (lastSuccessfulIndex >= 0 && lastSuccessfulIndex < stageOrder.length - 1) {
        return stageOrder[lastSuccessfulIndex + 1]!;
      }
    }

    // Default: restart from analyze duplicates
    return PROCESSING_STAGE.ANALYZE_DUPLICATES;
  }

  /**
   * Process pending retries (should be called periodically)
   */
  static async processPendingRetries(payload: Payload): Promise<void> {
    try {
      // Find jobs that are ready for retry
      const readyJobs = await payload.find({
        collection: "import-jobs",
        where: {
          stage: { equals: PROCESSING_STAGE.FAILED },
          nextRetryAt: { less_than_equal: new Date().toISOString() },
          retryAttempts: { less_than: this.DEFAULT_RETRY_CONFIG.maxRetries },
        },
        limit: 10, // Process up to 10 retries per run
      });

      for (const job of readyJobs.docs) {
        logger.info("Processing scheduled retry", { importJobId: job.id });

        // Classify error and determine recovery stage
        const classification = this.classifyError(job);
        if (!classification.retryable) {
          continue;
        }

        const recoveryStage = this.determineRecoveryStage(job, classification);

        // Update job to recovery stage
        await payload.update({
          collection: "import-jobs",
          id: job.id,
          data: {
            stage: recoveryStage,
            nextRetryAt: null, // Clear the retry schedule
          },
        });

        // Queue the appropriate recovery job
        const jobType = this.getJobTypeForStage(recoveryStage);
        if (jobType) {
          await payload.jobs.queue({
            task: jobType,
            input: { importJobId: job.id, batchNumber: 0 },
          });

          logger.info("Queued recovery job", {
            importJobId: job.id,
            stage: recoveryStage,
            jobType,
          });
        }
      }
    } catch (error) {
      logError(error, "Failed to process pending retries");
    }
  }

  /**
   * Get job type for a given stage (now unified with stage names)
   */
  private static getJobTypeForStage(stage: string): JobType | null {
    // With unified naming, stage names are the same as job types
    switch (stage) {
      case PROCESSING_STAGE.ANALYZE_DUPLICATES:
        return JOB_TYPES.ANALYZE_DUPLICATES;
      case PROCESSING_STAGE.DETECT_SCHEMA:
        return JOB_TYPES.DETECT_SCHEMA;
      case PROCESSING_STAGE.VALIDATE_SCHEMA:
        return JOB_TYPES.VALIDATE_SCHEMA;
      case PROCESSING_STAGE.GEOCODE_BATCH:
        return JOB_TYPES.GEOCODE_BATCH;
      case PROCESSING_STAGE.CREATE_EVENTS:
        return JOB_TYPES.CREATE_EVENTS;
      default:
        return null;
    }
  }

  /**
   * Manually reset a job to a specific stage (for operator intervention)
   */
  static async resetJobToStage(
    payload: Payload,
    jobId: string | number,
    targetStage: ProcessingStage,
    clearRetries = true
  ): Promise<RecoveryResult> {
    try {
      const job = await payload.findByID({
        collection: "import-jobs",
        id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      });

      if (!job) {
        return { success: false, action: "job_not_found", error: "Import job not found" };
      }

      const updateData: Partial<ImportJob> = {
        stage: targetStage,
        lastRetryAt: new Date().toISOString() as any,
        errorLog: {
          ...(getErrorLogState(job) || {}),
          manualReset: {
            resetAt: new Date().toISOString(),
            previousStage: job.stage,
            targetStage,
          },
        },
      };

      if (clearRetries) {
        updateData.retryAttempts = 0;
      }

      await payload.update({
        collection: "import-jobs",
        id: job.id,
        data: updateData,
      });

      logger.info("Manually reset job stage", {
        importJobId: job.id,
        fromStage: job.stage,
        toStage: targetStage,
        clearedRetries: clearRetries,
      });

      return {
        success: true,
        action: "manual_reset",
      };
    } catch (error) {
      logError(error, "Failed to reset job stage", { jobId, targetStage });
      return {
        success: false,
        action: "reset_failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * This method should be configured as a Payload task with a schedule.
   * Add this to your Payload config jobs.tasks array:
   *
   * slug: "process-pending-retries"
   * handler: async ({ req }) => await ErrorRecoveryService.processPendingRetries(req.payload)
   * schedule: [{ cron: "* /5 * * * *", queue: "maintenance" }]
   *
   * The cron expression should be "* /5 * * * *" (remove space) to run every 5 minutes
   */

  /**
   * Get recovery recommendations for failed jobs
   */
  static async getRecoveryRecommendations(payload: Payload): Promise<
    Array<{
      jobId: string | number;
      stage: string;
      classification: ErrorClassification;
      recommendedAction: string;
      retryCount: number;
    }>
  > {
    const failedJobs = await payload.find({
      collection: "import-jobs",
      where: {
        stage: { equals: PROCESSING_STAGE.FAILED },
      },
      limit: 100,
    });

    return failedJobs.docs.map((job) => {
      const classification = this.classifyError(job);
      const retryCount = job.retryAttempts || 0;

      let recommendedAction = "No action recommended";

      if (classification.retryable && retryCount < this.DEFAULT_RETRY_CONFIG.maxRetries) {
        recommendedAction = "Automatic retry available";
      } else if (classification.type === "user-action-required") {
        recommendedAction = classification.suggestedAction || "Manual review required";
      } else if (retryCount >= this.DEFAULT_RETRY_CONFIG.maxRetries) {
        recommendedAction = "Manual intervention required - max retries exceeded";
      }

      return {
        jobId: job.id,
        stage: job.stage,
        classification,
        recommendedAction,
        retryCount,
      };
    });
  }
}
