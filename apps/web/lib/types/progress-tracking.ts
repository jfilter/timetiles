/**
 * Type definitions for the enhanced progress tracking system.
 *
 * This module defines the structure of progress data that is stored in the database
 * and returned via API endpoints. It provides detailed per-stage tracking with
 * batch information, performance metrics, and time estimates.
 *
 * @module
 * @category Types
 */

/**
 * Status of a processing stage.
 *
 * - `pending`: Stage has not started yet
 * - `in_progress`: Stage is currently being processed
 * - `completed`: Stage has finished successfully
 * - `skipped`: Stage was skipped (e.g., validation passed, no geocoding needed)
 */
export type StageStatus = "pending" | "in_progress" | "completed" | "skipped";

/**
 * Detailed progress information for a single processing stage.
 *
 * This structure tracks all aspects of stage progress including rows processed,
 * batch information, performance metrics, and time estimates.
 */
export type StageProgress = {
  /** Current status of the stage */
  status: StageStatus;

  /** Timestamp when the stage was started (null if not started) */
  startedAt: Date | null;

  /** Timestamp when the stage was completed (null if not completed) */
  completedAt: Date | null;

  /** Number of rows processed so far in this stage */
  rowsProcessed: number;

  /** Total number of rows to process in this stage */
  rowsTotal: number;

  /** Number of batches completed so far */
  batchesProcessed: number;

  /** Total number of batches expected for this stage */
  batchesTotal: number;

  /** Number of rows processed in the current batch */
  currentBatchRows: number;

  /** Total number of rows in the current batch */
  currentBatchTotal: number;

  /** Processing rate in rows per second (null if not available) */
  rowsPerSecond: number | null;

  /** Estimated seconds remaining for this stage (null if not available) */
  estimatedSecondsRemaining: number | null;
};

/**
 * Complete progress information for an import job.
 *
 * This structure contains per-stage progress details, overall weighted progress,
 * and estimated completion time for the entire import job.
 */
export type DetailedProgress = {
  /** Progress information for each stage, keyed by stage name */
  stages: Record<string, StageProgress>;

  /** Overall progress percentage (0-100), weighted by stage time estimates */
  overallPercentage: number;

  /** Estimated completion time for the entire import (null if not available) */
  estimatedCompletionTime: Date | null;
};

/**
 * Batch progress information for a specific stage.
 *
 * This is a convenience type used when updating batch-specific progress.
 */
export type BatchProgress = {
  /** Current batch number (1-indexed) */
  current: number;

  /** Total number of batches */
  total: number;

  /** Progress within the current batch */
  currentBatch: {
    /** Rows processed in current batch */
    rowsProcessed: number;

    /** Total rows in current batch */
    rowsTotal: number;

    /** Percentage complete for current batch (0-100) */
    percentage: number;
  };
};

/**
 * Performance metrics for a stage.
 *
 * This type contains calculated performance information that can be used
 * to estimate time remaining and display processing rates.
 */
export type PerformanceMetrics = {
  /** Processing rate in rows per second */
  rowsPerSecond: number | null;

  /** Estimated seconds remaining for the stage */
  estimatedSecondsRemaining: number | null;

  /** Average time per batch in milliseconds */
  averageBatchTimeMs: number | null;
};
