/**
 * Provides error recovery mechanisms for failed import jobs.
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
 * - Provide manual recovery tools for operators.
 *
 * @module
 */
import type { Payload } from "payload";

import {
  COLLECTION_NAMES,
  JOB_TYPES,
  type JobType,
  PROCESSING_STAGE,
  type ProcessingStage,
} from "@/lib/constants/import-constants";
import { QUOTA_TYPES } from "@/lib/constants/quota-constants";
import { logError, logger } from "@/lib/logger";
import { getQuotaService } from "@/lib/services/quota-service";
import type { ImportJob } from "@/payload-types";

// Constants
const IMPORT_JOBS_COLLECTION = "import-jobs";

/**
 * Internal representation of error log state.
 *
 * @internal
 */
interface ErrorLogState {
  /** Most recent error message */
  lastError?: string;
  /** Information about recovery attempts */
  recoveryAttempt?: {
    /** Current attempt number */
    attempt: number;
    /** Error from previous attempt */
    previousError?: string;
    /** Stage being recovered to */
    recoveryStage: string;
    /** Error classification type */
    classification: string;
  };
  /** Additional dynamic error log fields */
  [key: string]: unknown;
}

/**
 * Safely extracts error log state from a job object.
 *
 * @param job - Job object that may contain error log
 * @returns Parsed error log state or null if invalid
 * @internal
 */
const getErrorLogState = (job: { errorLog?: unknown }): ErrorLogState | null => {
  if (job.errorLog && typeof job.errorLog === "object" && !Array.isArray(job.errorLog)) {
    return job.errorLog as ErrorLogState;
  }
  return null;
};

/**
 * Configuration for retry behavior.
 *
 * @public
 */
export interface RetryConfig {
  /** Maximum number of retry attempts before giving up */
  maxRetries: number;
  /** Initial delay in milliseconds before first retry */
  baseDelayMs: number;
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (e.g., 2 = double delay each time) */
  backoffMultiplier: number;
}

/**
 * Result of error classification analysis.
 *
 * @public
 */
export interface ErrorClassification {
  /** Category of error determining recovery strategy */
  type: "recoverable" | "permanent" | "user-action-required";
  /** Human-readable explanation of the error */
  reason: string;
  /** Optional suggestion for user to resolve the issue */
  suggestedAction?: string;
  /** Whether this error can be retried automatically */
  retryable: boolean;
}

/**
 * Result of recovery operation.
 *
 * @public
 */
export interface RecoveryResult {
  /** Whether the recovery operation succeeded */
  success: boolean;
  /** Action taken or error code (e.g., "retry_scheduled", "job_not_found", "quota_exceeded") */
  action: string;
  /** Error message if recovery failed */
  error?: string;
  /** Whether a retry was successfully scheduled */
  retryScheduled?: boolean;
  /** Timestamp when the next retry will occur */
  nextRetryAt?: Date;
}

/**
 * Service for handling import job error recovery.
 *
 * Provides automatic and manual recovery mechanisms for failed import jobs,
 * including error classification, exponential backoff retry scheduling,
 * quota enforcement, and operator intervention tools.
 *
 * @public
 *
 * @example
 * Basic usage - automatic retry:
 * ```typescript
 * import { ErrorRecoveryService } from "@/lib/services/error-recovery";
 *
 * const result = await ErrorRecoveryService.recoverFailedJob(payload, jobId);
 * if (result.success) {
 *   console.log(`Retry scheduled for ${result.nextRetryAt}`);
 * }
 * ```
 *
 * @example
 * Manual reset by administrator:
 * ```typescript
 * await ErrorRecoveryService.resetJobToStage(
 *   payload,
 *   jobId,
 *   PROCESSING_STAGE.GEOCODE_BATCH,
 *   true // Clear retry counter
 * );
 * ```
 *
 * @example
 * Get recommendations for all failed jobs:
 * ```typescript
 * const recommendations = await ErrorRecoveryService.getRecoveryRecommendations(payload);
 * const autoRetryable = recommendations.filter(r => r.recommendedAction === "Automatic retry available");
 * ```
 */
export class ErrorRecoveryService {
  /**
   * Default retry configuration.
   * - 3 max retries
   * - 30 second initial delay
   * - 2x exponential backoff
   * - 5 minute maximum delay
   *
   * @private
   */
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 30000, // 30 seconds
    maxDelayMs: 300000, // 5 minutes
    backoffMultiplier: 2,
  };

  /**
   * Validates job state and retry eligibility.
   *
   * Checks if the job is in a failed state, if the error is retryable,
   * and if the maximum retry attempts have not been exceeded.
   *
   * @param job - The import job to validate
   * @param classification - Error classification result
   * @param retryCount - Current number of retry attempts
   * @param config - Retry configuration with max attempts
   * @returns Recovery result with error details if validation fails, null if validation passes
   * @private
   */
  private static validateJobForRetry(
    job: ImportJob,
    classification: ErrorClassification,
    retryCount: number,
    config: RetryConfig
  ): RecoveryResult | null {
    if (job.stage !== PROCESSING_STAGE.FAILED) {
      return { success: false, action: "not_failed", error: "Job is not in failed state" };
    }

    if (!classification.retryable) {
      return {
        success: false,
        action: "not_retryable",
        error: `Error is not retryable: ${classification.reason}`,
      };
    }

    if (retryCount >= config.maxRetries) {
      return {
        success: false,
        action: "max_retries_exceeded",
        error: `Maximum retry attempts (${config.maxRetries}) exceeded`,
      };
    }

    return null; // Validation passed
  }

  /**
   * Checks user quota before allowing retry.
   *
   * Verifies that the user associated with the import file has not exceeded
   * their daily import quota. This prevents users from bypassing quota limits
   * through retry mechanisms.
   *
   * @param payload - Payload CMS instance for database access
   * @param job - The import job being retried
   * @param retryCount - Current number of retry attempts
   * @returns Recovery result with quota error if quota exceeded, null if quota check passes or no user associated
   * @private
   */
  private static async checkRetryQuota(
    payload: Payload,
    job: ImportJob,
    retryCount: number
  ): Promise<RecoveryResult | null> {
    const importFileId = typeof job.importFile === "object" ? job.importFile.id : job.importFile;
    const importFile = await payload.findByID({
      collection: COLLECTION_NAMES.IMPORT_FILES,
      id: importFileId,
      overrideAccess: true,
    });

    if (!importFile.user) {
      return null; // No quota check needed
    }

    const userId = typeof importFile.user === "object" ? importFile.user.id : importFile.user;
    const user = await payload.findByID({
      collection: "users",
      id: userId,
      overrideAccess: true,
    });

    const quotaService = getQuotaService(payload);
    const quotaCheck = quotaService.checkQuota(user, QUOTA_TYPES.IMPORT_JOBS_PER_DAY, 1);

    if (!quotaCheck.allowed) {
      logger.warn("Retry blocked due to quota limit", {
        importJobId: job.id,
        userId,
        retryAttempt: retryCount + 1,
        quotaLimit: quotaCheck.limit,
        currentUsage: quotaCheck.current,
      });

      return {
        success: false,
        action: "quota_exceeded",
        error: "User has exceeded their daily import quota. Retry will be attempted after quota resets.",
      };
    }

    return null; // Quota check passed
  }

  /**
   * Attempt to recover a failed import job.
   *
   * This is the primary entry point for the error recovery system. It:
   * 1. Validates the job exists and is in a failed state
   * 2. Classifies the error to determine if it's retryable
   * 3. Checks retry count hasn't exceeded the maximum
   * 4. Verifies user quota if applicable
   * 5. Calculates exponential backoff delay
   * 6. Updates the job to retry from the appropriate recovery stage
   *
   * @param payload - Payload CMS instance for database access
   * @param jobId - ID of the failed import job to recover
   * @param retryConfig - Optional retry configuration to override defaults
   * @returns Recovery result indicating success/failure and next retry time
   *
   * @example
   * ```typescript
   * const result = await ErrorRecoveryService.recoverFailedJob(payload, 123);
   * if (result.success) {
   *   console.log(`Retry scheduled for ${result.nextRetryAt}`);
   * } else {
   *   console.error(`Recovery failed: ${result.error}`);
   * }
   * ```
   *
   * Notes:
   * - Uses exponential backoff: 30s, 60s, 120s (base 30s, multiplier 2x, max 5min)
   * - Default max retries: 3
   * - Respects user quota limits to prevent abuse
   * - Jobs are not automatically executed; they're scheduled for pickup by process-pending-retries job
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
        collection: IMPORT_JOBS_COLLECTION,
        id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      });

      // Check if job exists first
      if (!job) {
        return { success: false, action: "job_not_found", error: "Import job not found" };
      }

      // Classify the error
      const classification = this.classifyError(job);
      const retryCount = job.retryAttempts ?? 0;

      // Validate job state and retry eligibility
      const validationError = this.validateJobForRetry(job, classification, retryCount, config);
      if (validationError) {
        return validationError;
      }

      // Check quota before allowing retry
      const quotaError = await this.checkRetryQuota(payload, job, retryCount);
      if (quotaError) {
        return quotaError;
      }

      // Calculate retry delay
      const delay = Math.min(config.baseDelayMs * Math.pow(config.backoffMultiplier, retryCount), config.maxDelayMs);
      const nextRetryAt = new Date(Date.now() + delay);
      const recoveryStage = this.determineRecoveryStage(job, classification);

      await payload.update({
        collection: IMPORT_JOBS_COLLECTION,
        id: job.id,
        data: {
          stage: recoveryStage,
          retryAttempts: retryCount + 1,
          lastRetryAt: new Date().toISOString(),
          nextRetryAt: nextRetryAt.toISOString(),
          errorLog: {
            ...(getErrorLogState(job) ?? {}),
            recoveryAttempt: {
              attempt: retryCount + 1,
              previousError: getErrorLogState(job)?.lastError,
              recoveryStage,
              classification: classification.type,
            },
          },
        },
      });

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
   * Classify error type to determine recovery strategy.
   *
   * Analyzes the error message from the job's error log and categorizes it into:
   * - **recoverable**: Transient errors that should resolve with retry (network, rate limits, resources)
   * - **permanent**: Errors that won't resolve with retry (file not found, permissions)
   * - **user-action-required**: Errors that may need user intervention (schema issues, quota limits)
   *
   * @param job - The import job with error information
   * @returns Error classification with type, reason, and retry eligibility
   *
   * Error patterns recognized:
   * - Network/DB: "connection", "timeout", "econnrefused" → recoverable
   * - Resources: "memory", "resource" → recoverable
   * - Rate limits: "rate limit", "429" → recoverable
   * - File errors: "enoent", "file not found" → permanent
   * - Permissions: "permission", "unauthorized" → permanent
   * - Quota: "quota", "limit exceeded" → user-action-required (not retryable)
   * - Schema: "schema", "validation" → user-action-required (retryable)
   * - Unknown errors default to recoverable
   *
   * @private
   */
  private static classifyError(job: ImportJob): ErrorClassification {
    const errorMessage = getErrorLogState(job)?.lastError?.toLowerCase() ?? "";

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

    // Quota errors - cannot retry until quota resets
    if (errorMessage.includes("quota") || errorMessage.includes("limit exceeded")) {
      return {
        type: "user-action-required",
        reason: "Quota limit exceeded - will retry after quota resets",
        suggestedAction: "Wait for daily quota reset or upgrade plan",
        retryable: false, // Don't retry quota errors
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
   * Determine which stage to restart from based on where failure occurred.
   *
   * Selects the optimal recovery point in the import pipeline to minimize
   * wasted processing while ensuring data integrity. For most errors,
   * restarts from the stage immediately after the last successful stage.
   *
   * @param job - The import job being recovered
   * @param classification - Error classification result
   * @returns Processing stage to restart from
   *
   * Recovery stage selection rules:
   * - Schema validation errors → restart from VALIDATE_SCHEMA
   * - Other errors → restart from stage after lastSuccessfulStage
   * - No lastSuccessfulStage → restart from ANALYZE_DUPLICATES (beginning)
   *
   * Stage order: ANALYZE_DUPLICATES → DETECT_SCHEMA → VALIDATE_SCHEMA →
   *              AWAIT_APPROVAL → GEOCODE_BATCH → CREATE_EVENTS
   *
   * @private
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
   * Process pending retries (should be called periodically).
   *
   * Scans for failed jobs that are scheduled for retry (based on nextRetryAt)
   * and automatically restarts them from the appropriate recovery stage.
   * This method should be invoked by a scheduled background job every 5 minutes.
   *
   * @param payload - Payload CMS instance for database access
   * @returns Promise that resolves when processing is complete
   *
   * Implementation notes:
   * - Processes up to 10 retries per invocation to avoid overwhelming the system
   * - Only processes jobs where nextRetryAt <= current time
   * - Skips jobs with non-retryable error classifications
   * - Clears nextRetryAt after queueing to prevent duplicate processing
   * - Should be configured as a Payload scheduled task running every 5 minutes
   *
   * @example
   * Configure in payload.config.ts (cron runs every 5 minutes):
   * ```typescript
   * jobs: {
   *   tasks: [
   *     {
   *       slug: "process-pending-retries",
   *       handler: async ({ req }) => {
   *         await ErrorRecoveryService.processPendingRetries(req.payload);
   *       },
   *       schedule: [{ cron: "0,5,10,15,20,25,30,35,40,45,50,55 * * * *", queue: "maintenance" }]
   *     }
   *   ]
   * }
   * ```
   */
  static async processPendingRetries(payload: Payload): Promise<void> {
    try {
      // Find jobs that are ready for retry
      const readyJobs = await payload.find({
        collection: IMPORT_JOBS_COLLECTION,
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
          collection: IMPORT_JOBS_COLLECTION,
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
   * Get job type for a given stage.
   *
   * Maps processing stages to their corresponding background job types
   * for queueing during recovery. With unified naming, stage names match
   * job type names.
   *
   * @param stage - Processing stage name
   * @returns Corresponding job type constant or null if stage has no associated job
   * @private
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
   * Manually reset a job to a specific stage (for operator intervention).
   *
   * Allows administrators to manually override the automatic recovery logic
   * and force a job to restart from a specific stage. Useful for debugging,
   * testing, or handling edge cases that the automatic system can't resolve.
   *
   * @param payload - Payload CMS instance for database access
   * @param jobId - ID of the import job to reset
   * @param targetStage - Processing stage to reset the job to
   * @param clearRetries - Whether to reset retry counter to 0 (default: true)
   * @returns Recovery result indicating success or failure
   *
   * @example
   * ```typescript
   * // Reset job to geocoding stage and clear retry count
   * const result = await ErrorRecoveryService.resetJobToStage(
   *   payload,
   *   123,
   *   PROCESSING_STAGE.GEOCODE_BATCH,
   *   true
   * );
   * ```
   *
   * Important notes:
   * - Records manual reset in error log with timestamp and stage information
   * - Bypasses all validation checks (use with caution)
   * - Does not queue jobs automatically - job will be picked up by normal processing
   * - Should only be used by administrators via the reset API endpoint
   * - If clearRetries is false, retry count is preserved (useful for debugging retry logic)
   */
  static async resetJobToStage(
    payload: Payload,
    jobId: string | number,
    targetStage: ProcessingStage,
    clearRetries = true
  ): Promise<RecoveryResult> {
    try {
      const job = await payload.findByID({
        collection: IMPORT_JOBS_COLLECTION,
        id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      });

      if (!job) {
        return { success: false, action: "job_not_found", error: "Import job not found" };
      }

      const updateData: Partial<ImportJob> = {
        stage: targetStage,
        lastRetryAt: new Date().toISOString(),
        errorLog: {
          ...(getErrorLogState(job) ?? {}),
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
        collection: IMPORT_JOBS_COLLECTION,
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
   * schedule: [{ cron: "* /5 * * * *", queue: "maintenance" }].
   *
   * The cron expression should be "* /5 * * * *" (remove space) to run every 5 minutes.
   */

  /**
   * Get recovery recommendations for failed jobs.
   *
   * Analyzes all failed jobs in the system and provides actionable
   * recommendations for each. Used by the recommendations API endpoint
   * to help administrators understand which jobs need attention.
   *
   * @param payload - Payload CMS instance for database access
   * @returns Array of job recommendations with classifications and suggested actions
   *
   * @example
   * ```typescript
   * const recommendations = await ErrorRecoveryService.getRecoveryRecommendations(payload);
   * recommendations.forEach(rec => {
   *   console.log(`Job ${rec.jobId}: ${rec.recommendedAction}`);
   * });
   * ```
   *
   * Recommendation categories:
   * - "Automatic retry available" - Job can be retried automatically
   * - "Manual review required" - User action needed (from classification.suggestedAction)
   * - "Manual intervention required - max retries exceeded" - Retry limit hit
   * - "No action recommended" - Non-retryable permanent error
   *
   * Limited to 100 failed jobs per query to prevent performance issues.
   * Access control should be applied by the calling API endpoint.
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
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      where: {
        stage: { equals: PROCESSING_STAGE.FAILED },
      },
      limit: 100,
    });

    return failedJobs.docs.map((job) => {
      const classification = this.classifyError(job);
      const retryCount = job.retryAttempts ?? 0;

      let recommendedAction = "No action recommended";

      if (classification.retryable && retryCount < this.DEFAULT_RETRY_CONFIG.maxRetries) {
        recommendedAction = "Automatic retry available";
      } else if (classification.type === "user-action-required") {
        recommendedAction = classification.suggestedAction ?? "Manual review required";
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
