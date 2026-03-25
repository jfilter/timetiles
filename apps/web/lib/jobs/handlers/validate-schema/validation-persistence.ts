/**
 * Persistence helpers for the validate-schema job.
 *
 * Handles writing validation results back to the database, including
 * schema mode failures, approval results, concurrent review guards,
 * and sidecar file cleanup.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { cleanupSidecarFiles } from "@/lib/ingest/file-readers";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import type { createJobLogger } from "@/lib/logger";
import type { detectTransforms } from "@/lib/services/schema-builder/schema-comparison";
import type { SchemaComparison } from "@/lib/types/schema-detection";

import { loadJobResources } from "../../utils/resource-loading";
import { getIngestFilePath } from "../../utils/upload-path";
import type { SchemaModeResult } from "./schema-evaluation";

// Handle schema mode failure -- updates job to FAILED and returns early result
export const handleSchemaModeFailure = async (
  payload: Payload,
  jobIdTyped: number,
  ingestJobId: number | string,
  schemaModeResult: SchemaModeResult,
  validationData: {
    detectedSchema: Record<string, unknown>;
    breakingChanges: { field: string; change: string }[];
    newFields: { field: string; type: string; optional: boolean }[];
    transformSuggestions: ReturnType<typeof detectTransforms>;
    isBreaking: boolean;
  }
) => {
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: jobIdTyped,
    data: {
      schema: validationData.detectedSchema,
      schemaValidation: {
        isCompatible: false,
        breakingChanges: validationData.breakingChanges,
        newFields: validationData.newFields,
        transformSuggestions: validationData.transformSuggestions,
        requiresApproval: false,
        approvalReason: schemaModeResult.failureReason,
      },
      stage: PROCESSING_STAGE.FAILED,
      errors: [{ row: 0, error: schemaModeResult.failureReason ?? "Schema validation failed" }],
    },
  });

  await ProgressTrackingService.completeStage(payload, ingestJobId, PROCESSING_STAGE.VALIDATE_SCHEMA);

  // Strict-mode violation is a permanent failure -- throw so processSheets skips this sheet
  throw new Error(schemaModeResult.failureReason ?? "Schema validation failed in strict mode");
};

// Apply validation result -- updates the job with validation data
// Workflow handler controls stage sequencing; this only sets stage for needs-review (pause)
export const applyValidationResult = async (
  payload: Payload,
  jobIdTyped: number,
  ingestJobId: number | string,
  resultData: {
    detectedSchema: Record<string, unknown>;
    comparison: SchemaComparison;
    breakingChanges: { field: string; change: string }[];
    newFields: { field: string; type: string; optional: boolean }[];
    transformSuggestions: ReturnType<typeof detectTransforms>;
    requiresApproval: boolean;
    approvalReason: string;
    hasChanges: boolean;
  }
) => {
  const updateData: Record<string, unknown> = {
    schema: resultData.detectedSchema,
    schemaValidation: {
      isCompatible: !resultData.comparison.isBreaking,
      breakingChanges: resultData.breakingChanges,
      newFields: resultData.newFields,
      transformSuggestions: resultData.transformSuggestions,
      requiresApproval: resultData.requiresApproval,
      approvalReason: resultData.approvalReason,
    },
  };

  // Only set stage when pausing for review -- workflow handles all other transitions
  if (resultData.requiresApproval) {
    updateData.stage = PROCESSING_STAGE.NEEDS_REVIEW;
  }

  await payload.update({ collection: COLLECTION_NAMES.INGEST_JOBS, id: jobIdTyped, data: updateData });

  await ProgressTrackingService.completeStage(payload, ingestJobId, PROCESSING_STAGE.VALIDATE_SCHEMA);

  if (resultData.requiresApproval) {
    return {
      output: {
        needsReview: true,
        requiresApproval: true,
        hasBreakingChanges: resultData.comparison.isBreaking,
        newFields: resultData.newFields.length,
      },
    };
  }

  return {
    output: {
      hasChanges: resultData.hasChanges,
      hasBreakingChanges: resultData.comparison.isBreaking,
      newFields: resultData.newFields.length,
    },
  };
};

/**
 * Check if another ingest job for the same dataset is currently in NEEDS_REVIEW state.
 * This prevents schema drift when one import pauses for review while another sneaks through.
 */
export const hasConflictingReviewJob = async (
  payload: Payload,
  datasetId: number | string,
  currentJobId: number
): Promise<{ conflicting: boolean; conflictingJobId?: number }> => {
  const reviewJobs = await payload.find({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    where: {
      and: [
        { dataset: { equals: datasetId } },
        { stage: { equals: PROCESSING_STAGE.NEEDS_REVIEW } },
        { id: { not_equals: currentJobId } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  });

  if (reviewJobs.docs.length > 0) {
    return { conflicting: true, conflictingJobId: reviewJobs.docs[0]?.id };
  }

  return { conflicting: false };
};

/** Pause this job if another import for the same dataset is already in NEEDS_REVIEW. */
export const guardAgainstConcurrentReview = async (
  payload: Payload,
  datasetId: number | string,
  jobIdTyped: number,
  ingestJobId: number | string,
  logger: ReturnType<typeof createJobLogger>
) => {
  const { conflicting, conflictingJobId } = await hasConflictingReviewJob(payload, datasetId, jobIdTyped);
  if (!conflicting) return null;

  logger.info("Another import for this dataset is pending review, pausing this job", {
    ingestJobId,
    datasetId,
    conflictingJobId,
  });

  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: jobIdTyped,
    data: {
      stage: PROCESSING_STAGE.NEEDS_REVIEW,
      schemaValidation: {
        isCompatible: true,
        breakingChanges: [],
        newFields: [],
        transformSuggestions: [],
        requiresApproval: true,
        approvalReason: `Another import for this dataset is pending review (job #${conflictingJobId}). Please resolve that import first.`,
      },
    },
  });

  await ProgressTrackingService.completeStage(payload, ingestJobId, PROCESSING_STAGE.VALIDATE_SCHEMA);

  return { output: { needsReview: true, requiresApproval: true, hasBreakingChanges: false, newFields: 0 } };
};

/** Best-effort sidecar CSV cleanup for error paths. */
export const cleanupSidecarsOnError = async (payload: Payload, jobId: number): Promise<void> => {
  try {
    const { job: failedJob, ingestFile: failedFile } = await loadJobResources(payload, jobId);
    const failedFilePath = getIngestFilePath(failedFile.filename ?? "");
    cleanupSidecarFiles(failedFilePath, failedJob.sheetIndex ?? 0);
  } catch {
    // Best-effort cleanup -- don't mask the original error
  }
};
