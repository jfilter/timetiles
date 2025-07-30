/**
 * @module Provides standardized progress tracking utilities for import jobs.
 *
 * This service ensures consistent progress calculation across all job handlers.
 * It defines standard progress tracking patterns and prevents inconsistencies
 * between different stages of the import pipeline.
 *
 * Key responsibilities:
 * - Standardizing progress calculation based on rows vs unique rows
 * - Providing consistent progress update patterns
 * - Ensuring all handlers use the same base for total calculations
 */
import type { Payload } from "payload";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import type { ImportJob } from "@/payload-types";

export interface ProgressInfo {
  current: number;
  total: number;
  batchNumber: number;
}

export interface DuplicationSummary {
  totalRows: number;
  uniqueRows: number;
  internalDuplicates: number;
  externalDuplicates: number;
}

/**
 * Centralized progress tracking service to ensure consistency across job handlers
 */
export class ProgressTrackingService {
  /**
   * Get the appropriate total count based on whether deduplication is enabled
   * This ensures all stages use consistent totals
   */
  static getTotalForStage(job: ImportJob, stage: string): number {
    // For stages after deduplication, use unique rows if available
    const postDeduplicationStages = [
      PROCESSING_STAGE.DETECT_SCHEMA,
      PROCESSING_STAGE.VALIDATE_SCHEMA,
      PROCESSING_STAGE.AWAIT_APPROVAL,
      PROCESSING_STAGE.GEOCODE_BATCH,
      PROCESSING_STAGE.CREATE_EVENTS,
    ];

    if (job.duplicates?.summary && postDeduplicationStages.includes(stage as any)) {
      return job.duplicates.summary.uniqueRows || 0;
    }

    // For initial stages or when deduplication disabled, use original total
    return job.progress?.total || 0;
  }

  /**
   * Calculate progress for deduplication stage
   */
  static createDeduplicationProgress(
    totalRows: number,
    uniqueRows: number,
    internalDuplicates: number,
    externalDuplicates: number,
  ): DuplicationSummary {
    return {
      totalRows,
      uniqueRows,
      internalDuplicates,
      externalDuplicates,
    };
  }

  /**
   * Update job progress with standardized calculation
   */
  static async updateJobProgress(
    payload: Payload,
    jobId: string | number,
    stage: string,
    processedCount: number,
    job: ImportJob,
    additionalData: Record<string, unknown> = {},
  ): Promise<void> {
    const total = this.getTotalForStage(job, stage);
    const currentProgress = (job.progress?.current || 0) + processedCount;

    await payload.update({
      collection: "import-jobs",
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      data: {
        progress: {
          current: currentProgress,
          total,
          batchNumber: (job.progress?.batchNumber || 0) + 1,
        },
        ...additionalData,
      },
    });
  }

  /**
   * Update geocoding progress specifically
   */
  static async updateGeocodingProgress(
    payload: Payload,
    jobId: string | number,
    processedCount: number,
    job: ImportJob,
    geocodingResults: Record<string, unknown>,
  ): Promise<void> {
    const total = this.getTotalForStage(job, PROCESSING_STAGE.GEOCODE_BATCH);
    const currentProgress = (job.geocodingProgress?.current || 0) + processedCount;

    await payload.update({
      collection: "import-jobs",
      id: typeof jobId === "string" ? parseInt(jobId, 10) : jobId,
      data: {
        geocodingResults,
        geocodingProgress: {
          current: currentProgress,
          total,
        },
      },
    });
  }

  /**
   * Initialize progress for new import job
   */
  static createInitialProgress(totalRows: number): ProgressInfo {
    return {
      current: 0,
      total: totalRows,
      batchNumber: 0,
    };
  }

  /**
   * Check if job stage is complete based on progress
   */
  static isStageComplete(job: ImportJob, stage: string): boolean {
    if (stage === PROCESSING_STAGE.GEOCODE_BATCH && job.geocodingProgress) {
      return (job.geocodingProgress.current || 0) >= (job.geocodingProgress.total || 0);
    }

    if (job.progress) {
      const total = this.getTotalForStage(job, stage);
      return (job.progress.current || 0) >= total;
    }

    return false;
  }

  /**
   * Calculate percentage completion for display
   */
  static getCompletionPercentage(job: ImportJob, stage: string): number {
    if (stage === PROCESSING_STAGE.GEOCODE_BATCH && job.geocodingProgress) {
      const total = job.geocodingProgress.total || 0;
      const current = job.geocodingProgress.current || 0;
      if (total === 0) return 100;
      return Math.round((current / total) * 100);
    }

    if (job.progress) {
      const total = this.getTotalForStage(job, stage);
      const current = job.progress.current || 0;
      if (total === 0) return 100;
      return Math.round((current / total) * 100);
    }

    return 0;
  }
}
