/**
 * Defines the job handler for validating the detected schema against the dataset's existing schema.
 *
 * This job is responsible for schema validation and determining the next processing stage. Its main tasks are:
 * - Finalizing the schema detection using the cached state from the schema detection stage.
 * - Comparing the newly detected schema with the current schema version of the target dataset.
 * - Identifying breaking changes (e.g., type changes, removed fields) and non-breaking changes (e.g., new optional fields).
 * - Determining whether the changes can be automatically approved based on the dataset's configuration.
 *
 * Next stage routing:
 * - If changes require manual approval → `NEEDS_REVIEW` stage
 * - If changes are auto-approved → `CREATE_SCHEMA_VERSION` stage
 * - If no schema changes → `GEOCODE_BATCH` stage
 *
 * @module
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { cleanupSidecarFiles } from "@/lib/ingest/file-readers";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import { compareSchemas, detectTransforms } from "@/lib/services/schema-builder/schema-comparison";
import type { SchemaComparison } from "@/lib/types/schema-detection";
import { getSchemaBuilderState } from "@/lib/types/schema-detection";
import { parseStrictInteger } from "@/lib/utils/event-params";

import type { ValidateSchemaJobInput } from "../types/job-inputs";
import type { JobHandlerContext, TaskCallbackArgs } from "../utils/job-context";
import { loadJobResources } from "../utils/resource-loading";
import { getIngestFilePath } from "../utils/upload-path";

// Helper function to get schema from cached builder state
const getSchemaFromCache = async (job: {
  schemaBuilderState?: unknown;
}): Promise<{ schemaBuilder: ProgressiveSchemaBuilder; detectedSchema: Record<string, unknown> }> => {
  // Use cached schema builder state from schema detection stage
  // This avoids re-reading the entire file
  const previousState = getSchemaBuilderState(job);

  if (!previousState) {
    throw new Error("Schema builder state not found. Schema detection stage must run first.");
  }

  // Create schema builder from cached state
  const schemaBuilder = new ProgressiveSchemaBuilder(previousState);

  // Generate schema from cached state (no file reading needed)
  const detectedSchemaRaw = await schemaBuilder.getSchema();
  const detectedSchema =
    typeof detectedSchemaRaw === "object" && !Array.isArray(detectedSchemaRaw) ? detectedSchemaRaw : {};

  return { schemaBuilder, detectedSchema };
};

// Helper function to get current schema
const getCurrentSchema = async (payload: Payload, datasetId: number | string): Promise<Record<string, unknown>> => {
  const currentSchemaDoc = await payload.find({
    collection: COLLECTION_NAMES.DATASET_SCHEMAS,
    where: { dataset: { equals: datasetId } },
    sort: "-versionNumber",
    limit: 1,
  });

  const currentSchemaRaw = currentSchemaDoc.docs[0]?.schema ?? {};
  return typeof currentSchemaRaw === "object" && !Array.isArray(currentSchemaRaw)
    ? (currentSchemaRaw as Record<string, unknown>)
    : {};
};

type SchemaMode = "strict" | "additive" | "flexible";

interface ProcessingOptions {
  skipDuplicateChecking?: boolean;
  autoApproveSchema?: boolean;
  schemaMode?: SchemaMode;
}

// Schema mode result: determines if import should fail, require approval, or auto-approve
interface SchemaModeResult {
  shouldFail: boolean;
  requiresApproval: boolean;
  failureReason?: string;
  approvalReason?: string;
}

/**
 * Determine the schema validation outcome based on schema mode
 * - strict: Any schema change = FAIL the import
 * - additive: Breaking changes = FAIL, Non-breaking (new fields) = AUTO-APPROVE
 * - flexible: All non-breaking = AUTO-APPROVE, Breaking = FAIL
 */
const evaluateSchemaMode = (
  schemaMode: SchemaMode | undefined,
  comparison: SchemaComparison,
  hasHighConfidenceTransforms: boolean
): SchemaModeResult => {
  const hasChanges = comparison.changes.length > 0;

  // If no schema mode specified, use default dataset-based logic
  if (!schemaMode) {
    return { shouldFail: false, requiresApproval: false };
  }

  switch (schemaMode) {
    case "strict":
      // Any schema change causes failure
      if (hasChanges) {
        return {
          shouldFail: true,
          requiresApproval: false,
          failureReason: `Schema mismatch in strict mode: ${comparison.changes.length} change(s) detected`,
        };
      }
      return { shouldFail: false, requiresApproval: false };

    case "additive":
      // Breaking changes cause failure, non-breaking auto-approve
      if (comparison.isBreaking) {
        return {
          shouldFail: true,
          requiresApproval: false,
          failureReason: "Breaking schema changes not allowed in additive mode",
        };
      }
      // High-confidence transforms suggest field renames - require approval
      if (hasHighConfidenceTransforms) {
        return {
          shouldFail: false,
          requiresApproval: true,
          approvalReason: "Potential field renames detected - please confirm transforms",
        };
      }
      // Non-breaking changes auto-approve
      return { shouldFail: false, requiresApproval: false };

    case "flexible":
      // Breaking changes still fail, but all non-breaking changes auto-approve
      if (comparison.isBreaking) {
        return { shouldFail: true, requiresApproval: false, failureReason: "Breaking schema changes detected" };
      }
      // All non-breaking changes auto-approve (including transforms)
      return { shouldFail: false, requiresApproval: false };

    default:
      return { shouldFail: false, requiresApproval: false };
  }
};

// Helper function to determine if approval is required (for non-scheduled ingests)
const checkRequiresApproval = (
  comparison: SchemaComparison,
  dataset: { schemaConfig?: { locked?: boolean | null; autoApproveNonBreaking?: boolean | null } | null }
): boolean => comparison.isBreaking || !!dataset.schemaConfig?.locked || !dataset.schemaConfig?.autoApproveNonBreaking;

// Helper function to determine approval requirement based on schema mode and dataset config
const determineRequiresApproval = (
  schemaModeRequiresApproval: boolean | undefined,
  schemaMode: string | undefined,
  comparison: SchemaComparison,
  dataset: { schemaConfig?: { locked?: boolean | null; autoApproveNonBreaking?: boolean | null } | null },
  hasHighConfidenceTransforms: boolean
): boolean => {
  // If schema mode explicitly requires approval, return true
  if (schemaModeRequiresApproval) {
    return true;
  }
  // If schema mode is set but doesn't require approval, it handled the decision
  if (schemaMode) {
    return false;
  }
  // Fall back to dataset config check
  return checkRequiresApproval(comparison, dataset) || hasHighConfidenceTransforms;
};

// Helper function to get approval reason
const getApprovalReason = (hasHighConfidenceTransforms: boolean, isBreaking: boolean): string => {
  if (hasHighConfidenceTransforms) {
    return "Potential field renames detected";
  }
  if (isBreaking) {
    return "Breaking schema changes detected";
  }
  return "Manual approval required by dataset configuration";
};

/** Transform SchemaComparison changes into structured breaking/new-field lists for job output */
const extractSchemaChanges = (comparison: SchemaComparison, detectedSchema: Record<string, unknown>) => {
  const breakingChanges = comparison.changes
    .filter((c) => c.severity === "error")
    .map((c) => ({
      field: c.path,
      change: c.type,
      ...(typeof c.details === "object" && c.details !== null ? (c.details as Record<string, unknown>) : {}),
    }));

  const newFields = comparison.changes
    .filter((c) => c.type === "new_field")
    .map((c) => {
      // Get the type from the detected schema properties
      const properties = detectedSchema.properties as Record<string, unknown> | undefined;
      const fieldSchema = properties?.[c.path] as Record<string, unknown> | undefined;
      const fieldType = fieldSchema?.type && typeof fieldSchema.type === "string" ? fieldSchema.type : "unknown";

      return {
        field: c.path,
        type: fieldType,
        optional:
          typeof c.details === "object" && c.details !== null && "required" in c.details ? !c.details.required : true,
      };
    });

  return { breakingChanges, newFields };
};

// Handle schema mode failure — updates job to FAILED and returns early result
const handleSchemaModeFailure = async (
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

  // Strict-mode violation is a permanent failure — throw so processSheets skips this sheet
  throw new Error(schemaModeResult.failureReason ?? "Schema validation failed in strict mode");
};

// Apply validation result — updates the job with validation data
// Workflow handler controls stage sequencing; this only sets stage for needs-review (pause)
const applyValidationResult = async (
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

  // Only set stage when pausing for review — workflow handles all other transitions
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
const guardAgainstConcurrentReview = async (
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
const cleanupSidecarsOnError = async (payload: Payload, jobId: number): Promise<void> => {
  try {
    const { job: failedJob, ingestFile: failedFile } = await loadJobResources(payload, jobId);
    const failedFilePath = getIngestFilePath(failedFile.filename ?? "");
    cleanupSidecarFiles(failedFilePath, failedJob.sheetIndex ?? 0);
  } catch {
    // Best-effort cleanup — don't mask the original error
  }
};

export const validateSchemaJob = {
  slug: JOB_TYPES.VALIDATE_SCHEMA,
  retries: 1,
  outputSchema: [
    { name: "needsReview", type: "checkbox" as const },
    { name: "requiresApproval", type: "checkbox" as const },
    { name: "hasBreakingChanges", type: "checkbox" as const },
    { name: "hasChanges", type: "checkbox" as const },
    { name: "newFields", type: "number" as const },
    { name: "failed", type: "checkbox" as const },
    { name: "failureReason", type: "text" as const },
    { name: "reason", type: "text" as const },
  ],
  onFail: async (args: TaskCallbackArgs) => {
    const ingestJobId = (args.input as Record<string, unknown> | undefined)?.ingestJobId;
    if (typeof ingestJobId !== "string" && typeof ingestJobId !== "number") return;
    try {
      await args.req.payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errorLog: {
            lastError: typeof args.job.error === "string" ? args.job.error : "Task failed after all retries",
            context: "validate-schema",
          },
        },
      });
    } catch {
      // Best-effort — don't throw in onFail
    }
  },
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as ValidateSchemaJobInput["input"];
    const { ingestJobId } = input;

    const jobIdTyped = typeof ingestJobId === "number" ? ingestJobId : parseStrictInteger(ingestJobId);
    if (jobIdTyped == null) {
      throw new Error("Invalid import job ID");
    }
    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "validate-schema");
    logger.info("Starting schema validation", { ingestJobId });
    const startTime = Date.now();

    try {
      // Set stage for UI progress display (workflow controls sequencing)
      await payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: { stage: PROCESSING_STAGE.VALIDATE_SCHEMA },
      });

      const { job, dataset, ingestFile } = await loadJobResources(payload, jobIdTyped);

      // Schema drift guard: if another import for the same dataset is pending review,
      // pause this one too to prevent concurrent schema conflicts.
      const driftResult = await guardAgainstConcurrentReview(payload, dataset.id, jobIdTyped, ingestJobId, logger);
      if (driftResult) return driftResult;

      const uniqueRows = job.duplicates?.summary?.uniqueRows ?? 0;
      await ProgressTrackingService.startStage(payload, ingestJobId, PROCESSING_STAGE.VALIDATE_SCHEMA, uniqueRows);

      // Schema detection and comparison
      const { detectedSchema } = await getSchemaFromCache({ schemaBuilderState: job.schemaBuilderState });
      const currentSchema = await getCurrentSchema(payload, dataset.id);
      const comparison = compareSchemas(currentSchema, detectedSchema);
      const transformSuggestions = detectTransforms(currentSchema, detectedSchema, comparison.changes);
      const hasHighConfidenceTransforms = transformSuggestions.some((s) => s.confidence >= 80);
      const { breakingChanges, newFields } = extractSchemaChanges(comparison, detectedSchema);
      const hasChanges = comparison.changes.length > 0;

      // Schema mode evaluation
      const processingOptions = (ingestFile.processingOptions as ProcessingOptions) ?? {};
      const schemaModeResult = evaluateSchemaMode(
        processingOptions.schemaMode,
        comparison,
        hasHighConfidenceTransforms
      );

      if (schemaModeResult.shouldFail) {
        logger.warn("Schema validation failed due to schema mode", {
          schemaMode: processingOptions.schemaMode,
          reason: schemaModeResult.failureReason,
        });
        return await handleSchemaModeFailure(payload, jobIdTyped, ingestJobId, schemaModeResult, {
          detectedSchema,
          breakingChanges,
          newFields,
          transformSuggestions,
          isBreaking: comparison.isBreaking,
        });
      }

      const requiresApproval = determineRequiresApproval(
        schemaModeResult.requiresApproval,
        processingOptions.schemaMode,
        comparison,
        dataset,
        hasHighConfidenceTransforms
      );
      const approvalReason =
        schemaModeResult.approvalReason ?? getApprovalReason(hasHighConfidenceTransforms, comparison.isBreaking);

      const result = await applyValidationResult(payload, jobIdTyped, ingestJobId, {
        detectedSchema,
        comparison,
        breakingChanges,
        newFields,
        transformSuggestions,
        requiresApproval,
        approvalReason,
        hasChanges,
      });

      logPerformance("Schema validation", Date.now() - startTime, {
        ingestJobId,
        hasBreakingChanges: comparison.isBreaking,
        requiresApproval,
      });

      return result;
    } catch (error) {
      logError(error, "Schema validation failed", { ingestJobId });

      await cleanupSidecarsOnError(payload, jobIdTyped);

      // Re-throw — Payload retries up to `retries` count, then onFail handles failure.
      // JobCancelledError (e.g. quota exceeded) skips retries entirely.
      throw error;
    }
  },
};
