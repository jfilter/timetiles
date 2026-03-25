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
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import { compareSchemas, detectTransforms } from "@/lib/services/schema-builder/schema-comparison";
import { getSchemaBuilderState } from "@/lib/types/schema-detection";
import { parseStrictInteger } from "@/lib/utils/event-params";

import type { ValidateSchemaJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";
import { cleanupSidecarsForJob, createStandardOnFail, loadJobResources, setJobStage } from "../utils/resource-loading";
import type { ProcessingOptions } from "./validate-schema/schema-evaluation";
import {
  determineRequiresApproval,
  evaluateSchemaMode,
  extractSchemaChanges,
  getApprovalReason,
} from "./validate-schema/schema-evaluation";
import {
  applyValidationResult,
  guardAgainstConcurrentReview,
  handleSchemaModeFailure,
} from "./validate-schema/validation-persistence";

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
  onFail: createStandardOnFail("validate-schema"),
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
      await setJobStage(payload, ingestJobId, PROCESSING_STAGE.VALIDATE_SCHEMA);

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

      await cleanupSidecarsForJob(payload, jobIdTyped);

      // Re-throw — Payload retries up to `retries` count, then onFail handles failure.
      // JobCancelledError (e.g. quota exceeded) skips retries entirely.
      throw error;
    }
  },
};
