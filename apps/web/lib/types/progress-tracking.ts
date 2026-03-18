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
