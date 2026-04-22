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
import type { IngestFileStatus } from "@/lib/constants/ingest-constants";

import type { TransformSuggestion } from "./transforms";

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

// ---------------------------------------------------------------------------
// API response types (shared between progress route and client hook)
// ---------------------------------------------------------------------------

/** Formatted stage information for API response. */
export interface FormattedStage {
  name: string;
  displayName: string;
  status: StageStatus;
  progress: number;
  weight: number;
  startedAt: string | null;
  completedAt: string | null;
  batches: { current: number; total: number };
  currentBatch: { rowsProcessed: number; rowsTotal: number; percentage: number };
  performance: { rowsPerSecond: number | null; estimatedSecondsRemaining: number | null };
}

/** Formatted job progress for API response. */
export interface FormattedJobProgress {
  id: string | number;
  datasetId: string | number;
  datasetName?: string;
  currentStage: string;
  overallProgress: number;
  estimatedCompletionTime: string | null;
  stages: FormattedStage[];
  errors: number;
  duplicates: { internal: number; external: number };
  schemaValidation?: {
    isCompatible?: boolean | null;
    breakingChanges?: { field: string; change: string }[];
    newFields?: { field: string; type: string; optional: boolean }[];
    transformSuggestions?: TransformSuggestion[];
    requiresApproval?: boolean | null;
    approvalReason?: string | null;
    approved?: boolean | null;
    approvedBy?: number | null;
    approvedAt?: string | null;
  } | null;
  reviewReason?: string | null;
  reviewDetails?: Record<string, unknown> | null;
  results?: { totalEvents?: number; duplicatesSkipped?: number; geocoded?: number; errors?: number } | null;
}

/** Full progress API response shape. */
export interface ProgressApiResponse {
  type: string;
  id: number;
  status: IngestFileStatus;
  originalName: string;
  catalogId: number | null;
  datasetsCount: number;
  datasetsProcessed: number;
  overallProgress: number;
  estimatedCompletionTime: string | null;
  jobs: FormattedJobProgress[];
  errorLog?: string | null;
  completedAt?: string | null;
}
