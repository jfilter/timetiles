/**
 * Provides detailed progress tracking with per-stage metrics for import jobs.
 *
 * This service provides comprehensive progress tracking including:
 * - Per-stage progress with batch information
 * - Processing rates (rows/second)
 * - Time estimates (ETA for completion)
 * - Weighted overall progress based on stage time estimates
 *
 * Key responsibilities:
 * - Initialize detailed progress structures for all stages
 * - Track progress within each stage and batch
 * - Calculate weighted overall progress
 * - Estimate time remaining based on processing rates
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import {
  BATCH_SIZES,
  COLLECTION_NAMES,
  PROCESSING_STAGE,
  type ProcessingStage,
} from "@/lib/constants/import-constants";
import { STAGE_TIME_WEIGHTS } from "@/lib/constants/stage-time-weights";
import type { StageProgress } from "@/lib/types/progress-tracking";

/**
 * Centralized progress tracking service for detailed per-stage tracking.
 */
export class ProgressTrackingService {
  /**
   * Serialize stages for database storage, converting Date objects to ISO strings.
   */
  private static serializeStages(stages: Record<string, StageProgress>): Record<string, unknown> {
    const serialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(stages)) {
      serialized[key] = {
        ...value,
        startedAt: value.startedAt ? value.startedAt.toISOString() : null,
        completedAt: value.completedAt ? value.completedAt.toISOString() : null,
      };
    }
    return serialized;
  }

  /**
   * Convert serialized stage data back to StageProgress objects with Date objects.
   */
  /**
   * Safely deserialize a date field from database storage.
   */
  private static deserializeDate(dateValue: unknown): Date | null {
    if (!dateValue || dateValue === "null") {
      return null;
    }
    if (dateValue instanceof Date) {
      return dateValue;
    }
    const parsed = new Date(dateValue as string);
    return !isNaN(parsed.getTime()) ? parsed : null;
  }

  /**
   * Type guard to check if value is a stages record.
   */
  private static isStagesRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private static deserializeStages(stages: unknown): Record<string, StageProgress> {
    const deserialized: Record<string, StageProgress> = {};

    if (!this.isStagesRecord(stages)) {
      return deserialized;
    }

    for (const [key, value] of Object.entries(stages)) {
      const stage = value as Record<string, unknown>;

      deserialized[key] = {
        ...stage,
        startedAt: this.deserializeDate(stage.startedAt),
        completedAt: this.deserializeDate(stage.completedAt),
      } as StageProgress;
    }
    return deserialized;
  }

  /**
   * Initialize progress tracking for all stages at job start.
   *
   * This should be called once when the job begins (during ANALYZE_DUPLICATES).
   * It sets up the progress structure for all 8 stages with "pending" status.
   *
   * @param payload - Payload instance
   * @param jobId - Import job ID
   * @param totalRows - Total number of rows in the import file
   */
  static async initializeStageProgress(payload: Payload, jobId: string | number, totalRows: number): Promise<void> {
    const stages: Record<string, StageProgress> = {};

    // Initialize all stages as pending
    const allStages: ProcessingStage[] = [
      PROCESSING_STAGE.ANALYZE_DUPLICATES,
      PROCESSING_STAGE.DETECT_SCHEMA,
      PROCESSING_STAGE.VALIDATE_SCHEMA,
      PROCESSING_STAGE.AWAIT_APPROVAL,
      PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
      PROCESSING_STAGE.GEOCODE_BATCH,
      PROCESSING_STAGE.CREATE_EVENTS,
    ];

    for (const stage of allStages) {
      const batchSize = this.getBatchSizeForStage(stage);
      const estimatedBatches = batchSize ? Math.ceil(totalRows / batchSize) : 1;

      stages[stage] = {
        status: "pending",
        startedAt: null,
        completedAt: null,
        rowsProcessed: 0,
        rowsTotal: totalRows,
        batchesProcessed: 0,
        batchesTotal: estimatedBatches,
        currentBatchRows: 0,
        currentBatchTotal: batchSize ?? totalRows,
        rowsPerSecond: null,
        estimatedSecondsRemaining: null,
      };
    }

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      data: {
        progress: {
          stages: this.serializeStages(stages),
          overallPercentage: 0,
          estimatedCompletionTime: null,
        },
      },
    });
  }

  /**
   * Mark a stage as started and update its metadata.
   *
   * This should be called when a job handler begins processing a stage.
   * It marks the stage as "in_progress" and sets the start timestamp.
   *
   * @param payload - Payload instance
   * @param jobId - Import job ID
   * @param stage - Processing stage name
   * @param rowsTotal - Total rows for this stage (may differ from file total after deduplication)
   */
  static async startStage(
    payload: Payload,
    jobId: string | number,
    stage: ProcessingStage,
    rowsTotal: number
  ): Promise<void> {
    const job = await payload.findByID({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
    });

    const stages = job.progress?.stages ? this.deserializeStages(job.progress.stages) : {};
    const batchSize = this.getBatchSizeForStage(stage);
    const estimatedBatches = batchSize ? Math.ceil(rowsTotal / batchSize) : 1;

    stages[stage] = {
      ...stages[stage],
      status: "in_progress",
      startedAt: new Date(),
      rowsTotal,
      batchesTotal: estimatedBatches,
      currentBatchTotal: batchSize ?? rowsTotal,
    } as StageProgress;

    const estimatedCompletionTime = this.estimateCompletionTime(stages);

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      data: {
        stage,
        progress: {
          stages: this.serializeStages(stages),
          overallPercentage: this.calculateWeightedProgress(stages),
          estimatedCompletionTime: estimatedCompletionTime ? estimatedCompletionTime.toISOString() : null,
        },
      },
    });
  }

  /**
   * Update progress within a stage.
   *
   * This should be called after processing each batch to update:
   * - Rows processed
   * - Current batch progress
   * - Processing rate
   * - Time remaining estimate
   *
   * @param payload - Payload instance
   * @param jobId - Import job ID
   * @param stage - Processing stage name
   * @param rowsProcessed - Total rows processed so far in this stage
   * @param currentBatchRows - Rows processed in current batch
   */
  static async updateStageProgress(
    payload: Payload,
    jobId: string | number,
    stage: ProcessingStage,
    rowsProcessed: number,
    currentBatchRows: number
  ): Promise<void> {
    const job = await payload.findByID({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
    });

    const stages = job.progress?.stages ? this.deserializeStages(job.progress.stages) : {};
    const stageData = stages[stage];

    if (!stageData) {
      throw new Error(`Stage ${stage} not initialized`);
    }

    // Calculate processing rate
    const timeElapsed = stageData.startedAt ? (Date.now() - new Date(stageData.startedAt).getTime()) / 1000 : 0;
    const rowsPerSecond = timeElapsed > 0 ? rowsProcessed / timeElapsed : null;

    // Estimate time remaining
    const rowsRemaining = stageData.rowsTotal - rowsProcessed;
    const estimatedSecondsRemaining = rowsPerSecond && rowsPerSecond > 0 ? rowsRemaining / rowsPerSecond : null;

    stages[stage] = {
      ...stageData,
      rowsProcessed,
      currentBatchRows,
      rowsPerSecond,
      estimatedSecondsRemaining,
    };

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      data: {
        progress: {
          stages: this.serializeStages(stages),
          overallPercentage: this.calculateWeightedProgress(stages),
          estimatedCompletionTime: this.estimateCompletionTime(stages)?.toISOString() ?? null,
        },
      },
    });
  }

  /**
   * Mark a batch as completed within a stage.
   *
   * This should be called after each batch is fully processed to:
   * - Increment batch counter
   * - Reset current batch row count
   *
   * @param payload - Payload instance
   * @param jobId - Import job ID
   * @param stage - Processing stage name
   * @param batchNumber - Batch number just completed (1-indexed)
   */
  static async completeBatch(
    payload: Payload,
    jobId: string | number,
    stage: ProcessingStage,
    batchNumber: number
  ): Promise<void> {
    const job = await payload.findByID({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
    });

    const stages = job.progress?.stages ? this.deserializeStages(job.progress.stages) : {};
    const stageData = stages[stage];

    if (!stageData) {
      throw new Error(`Stage ${stage} not initialized`);
    }

    stages[stage] = {
      ...stageData,
      batchesProcessed: batchNumber,
      currentBatchRows: 0,
    };

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      data: {
        progress: {
          stages: this.serializeStages(stages),
          overallPercentage: this.calculateWeightedProgress(stages),
          estimatedCompletionTime: this.estimateCompletionTime(stages)?.toISOString() ?? null,
        },
      },
    });
  }

  /**
   * Mark a stage as completed.
   *
   * This should be called when a stage finishes successfully.
   * It marks the stage as "completed" and sets the completion timestamp.
   *
   * @param payload - Payload instance
   * @param jobId - Import job ID
   * @param stage - Processing stage name
   */
  static async completeStage(payload: Payload, jobId: string | number, stage: ProcessingStage): Promise<void> {
    const job = await payload.findByID({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
    });

    const stages = job.progress?.stages ? this.deserializeStages(job.progress.stages) : {};
    const stageData = stages[stage];

    if (!stageData) {
      throw new Error(`Stage ${stage} not initialized`);
    }

    stages[stage] = {
      ...stageData,
      status: "completed",
      completedAt: new Date(),
      rowsProcessed: stageData.rowsTotal,
      estimatedSecondsRemaining: 0,
    };

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      data: {
        progress: {
          stages: this.serializeStages(stages),
          overallPercentage: this.calculateWeightedProgress(stages),
          estimatedCompletionTime: this.estimateCompletionTime(stages)?.toISOString() ?? null,
        },
      },
    });
  }

  /**
   * Mark a stage as skipped.
   *
   * This should be called when a stage is intentionally skipped
   * (e.g., validation passed, no geocoding needed).
   *
   * @param payload - Payload instance
   * @param jobId - Import job ID
   * @param stage - Processing stage name
   */
  static async skipStage(payload: Payload, jobId: string | number, stage: ProcessingStage): Promise<void> {
    const job = await payload.findByID({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
    });

    const stages = job.progress?.stages ? this.deserializeStages(job.progress.stages) : {};
    const stageData = stages[stage];

    if (!stageData) {
      throw new Error(`Stage ${stage} not initialized`);
    }

    stages[stage] = {
      ...stageData,
      status: "skipped",
      completedAt: new Date(),
      estimatedSecondsRemaining: 0,
    };

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      data: {
        progress: {
          stages: this.serializeStages(stages),
          overallPercentage: this.calculateWeightedProgress(stages),
          estimatedCompletionTime: this.estimateCompletionTime(stages)?.toISOString() ?? null,
        },
      },
    });
  }

  /**
   * Calculate weighted overall progress across all stages.
   *
   * Each stage contributes to overall progress based on its time weight.
   * Stages with higher weights (slower stages) contribute more to overall %.
   *
   * @param stages - Stage progress data
   * @returns Overall progress percentage (0-100)
   */
  static calculateWeightedProgress(stages: Record<string, StageProgress>): number {
    let totalWeightedProgress = 0;
    let totalWeight = 0;

    for (const [stageName, stageData] of Object.entries(stages)) {
      const weight = STAGE_TIME_WEIGHTS[stageName as ProcessingStage] || 0;

      // Skip stages with zero weight (AWAIT_APPROVAL, COMPLETED, FAILED)
      if (weight === 0) continue;

      totalWeight += weight;

      // Calculate stage progress percentage
      let stageProgress = 0;
      if (stageData.status === "completed") {
        stageProgress = 100;
      } else if (stageData.status === "skipped") {
        stageProgress = 100; // Skipped stages count as complete for progress purposes
      } else if (stageData.status === "in_progress" && stageData.rowsTotal > 0) {
        stageProgress = (stageData.rowsProcessed / stageData.rowsTotal) * 100;
      }

      // Add weighted contribution
      totalWeightedProgress += stageProgress * weight;
    }

    if (totalWeight === 0) return 0;

    return Math.round(totalWeightedProgress / totalWeight);
  }

  /**
   * Estimate completion time based on current processing rates.
   *
   * Uses processing rates from in-progress stages and estimates for
   * remaining stages based on average rate and stage weights.
   *
   * @param stages - Stage progress data
   * @returns Estimated completion timestamp or null if cannot estimate
   */
  static estimateCompletionTime(stages: Record<string, StageProgress>): Date | null {
    let totalEstimatedSeconds = 0;
    let hasValidEstimate = false;

    for (const [stageName, stageData] of Object.entries(stages)) {
      const weight = STAGE_TIME_WEIGHTS[stageName as ProcessingStage] || 0;

      // Skip stages with zero weight
      if (weight === 0) continue;

      if (stageData.status === "completed" || stageData.status === "skipped") {
        // Already complete, no time needed
        continue;
      } else if (stageData.status === "in_progress" && stageData.estimatedSecondsRemaining !== null) {
        // Use actual estimate for current stage - validate it's not NaN
        if (!isNaN(stageData.estimatedSecondsRemaining) && isFinite(stageData.estimatedSecondsRemaining)) {
          totalEstimatedSeconds += stageData.estimatedSecondsRemaining;
          hasValidEstimate = true;
        }
      } else if (stageData.status === "pending") {
        // For pending stages, use weight as rough estimate (weight * some factor)
        // This is a rough estimate; could be improved with historical data
        totalEstimatedSeconds += weight * 10; // Assume ~10 seconds per weight unit
      }
    }

    if (
      !hasValidEstimate ||
      totalEstimatedSeconds <= 0 ||
      isNaN(totalEstimatedSeconds) ||
      !isFinite(totalEstimatedSeconds)
    ) {
      return null;
    }

    const now = new Date();
    const estimatedDate = new Date(now.getTime() + totalEstimatedSeconds * 1000);

    // Validate the resulting date is valid
    if (isNaN(estimatedDate.getTime())) {
      return null;
    }

    return estimatedDate;
  }

  /**
   * Get the batch size for a specific stage.
   *
   * @param stage - Processing stage name
   * @returns Batch size for the stage, or null if stage doesn't use batching
   */
  static getBatchSizeForStage(stage: ProcessingStage): number | null {
    switch (stage) {
      case PROCESSING_STAGE.ANALYZE_DUPLICATES:
        return BATCH_SIZES.DUPLICATE_ANALYSIS;
      case PROCESSING_STAGE.DETECT_SCHEMA:
        return BATCH_SIZES.SCHEMA_DETECTION;
      case PROCESSING_STAGE.CREATE_EVENTS:
        return BATCH_SIZES.EVENT_CREATION;
      case PROCESSING_STAGE.VALIDATE_SCHEMA:
      case PROCESSING_STAGE.AWAIT_APPROVAL:
      case PROCESSING_STAGE.CREATE_SCHEMA_VERSION:
      case PROCESSING_STAGE.GEOCODE_BATCH:
        return null; // These stages don't use fixed batch sizes
      default:
        return null;
    }
  }

  /**
   * Update row totals for post-deduplication stages.
   *
   * After deduplication, the total rows for remaining stages should be
   * updated to reflect only unique rows.
   *
   * @param payload - Payload instance
   * @param jobId - Import job ID
   * @param uniqueRows - Number of unique rows after deduplication
   */
  static async updatePostDeduplicationTotals(
    payload: Payload,
    jobId: string | number,
    uniqueRows: number
  ): Promise<void> {
    const job = await payload.findByID({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
    });

    const stages = job.progress?.stages ? this.deserializeStages(job.progress.stages) : {};

    // Update totals for post-deduplication stages
    const postDeduplicationStages: ProcessingStage[] = [
      PROCESSING_STAGE.DETECT_SCHEMA,
      PROCESSING_STAGE.VALIDATE_SCHEMA,
      PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
      PROCESSING_STAGE.GEOCODE_BATCH,
      PROCESSING_STAGE.CREATE_EVENTS,
    ];

    for (const stage of postDeduplicationStages) {
      if (stages[stage]) {
        const batchSize = this.getBatchSizeForStage(stage);
        const estimatedBatches = batchSize ? Math.ceil(uniqueRows / batchSize) : 1;

        stages[stage] = {
          ...stages[stage],
          rowsTotal: uniqueRows,
          batchesTotal: estimatedBatches,
        };
      }
    }

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      data: {
        progress: {
          stages: this.serializeStages(stages),
          overallPercentage: this.calculateWeightedProgress(stages),
          estimatedCompletionTime: this.estimateCompletionTime(stages)?.toISOString() ?? null,
        },
      },
    });
  }
}
