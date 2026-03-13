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
 * - If changes require manual approval → `AWAIT_APPROVAL` stage
 * - If changes are auto-approved → `CREATE_SCHEMA_VERSION` stage
 * - If no schema changes → `GEOCODE_BATCH` stage
 *
 * @module
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { QUOTA_TYPES } from "@/lib/constants/quota-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import { getQuotaService } from "@/lib/services/quota-service";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import { compareSchemas, detectTransforms } from "@/lib/services/schema-builder/schema-comparison";
import type { SchemaComparison } from "@/lib/types/schema-detection";
import { getSchemaBuilderState } from "@/lib/types/schema-detection";
import { parseStrictInteger } from "@/lib/utils/event-params";
import { cleanupSidecarFiles } from "@/lib/utils/file-readers";
import type { ImportJob, User } from "@/payload-types";

import type { ValidateSchemaJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";
import { loadJobResources } from "../utils/resource-loading";
import { getImportFilePath } from "../utils/upload-path";

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

// Helper function to determine if approval is required (for non-scheduled imports)
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

/**
 * Check quota limits for the import
 */
const checkImportQuotas = async (payload: Payload, user: User, job: ImportJob, jobIdTyped: number): Promise<void> => {
  const quotaService = getQuotaService(payload);

  // Calculate total events to be imported (considering duplicates)
  const totalRows = job.duplicates?.summary?.totalRows ?? 0;
  const internalDuplicates = job.duplicates?.summary?.internalDuplicates ?? 0;
  const externalDuplicates = job.duplicates?.summary?.externalDuplicates ?? 0;
  const eventsToImport = totalRows - internalDuplicates - externalDuplicates;

  // Check maxEventsPerImport quota
  const eventQuotaCheck = await quotaService.checkQuota(user, QUOTA_TYPES.EVENTS_PER_IMPORT, eventsToImport);

  if (!eventQuotaCheck.allowed) {
    const errorMessage = `This import would create ${eventsToImport} events, exceeding your limit of ${eventQuotaCheck.limit} events per import.`;

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: jobIdTyped,
      data: { stage: PROCESSING_STAGE.FAILED, errors: [{ row: 0, error: errorMessage }] },
    });

    throw new Error(errorMessage);
  }

  // Check total events quota
  const totalEventsCheck = await quotaService.checkQuota(user, QUOTA_TYPES.TOTAL_EVENTS, eventsToImport);

  if (!totalEventsCheck.allowed) {
    const errorMessage = `Creating ${eventsToImport} events would exceed your total events limit (${totalEventsCheck.current}/${totalEventsCheck.limit}).`;

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: jobIdTyped,
      data: { stage: PROCESSING_STAGE.FAILED, errors: [{ row: 0, error: errorMessage }] },
    });

    throw new Error(errorMessage);
  }
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
  importJobId: number | string,
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
    collection: COLLECTION_NAMES.IMPORT_JOBS,
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

  await ProgressTrackingService.completeStage(payload, importJobId, PROCESSING_STAGE.VALIDATE_SCHEMA);

  return {
    output: {
      requiresApproval: false,
      hasBreakingChanges: validationData.isBreaking,
      newFields: validationData.newFields.length,
      failed: true,
      failureReason: schemaModeResult.failureReason,
    },
  };
};

// Apply validation result — determines next stage and updates the job
const applyValidationResult = async (
  payload: Payload,
  jobIdTyped: number,
  importJobId: number | string,
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
  let nextStage: (typeof PROCESSING_STAGE)[keyof typeof PROCESSING_STAGE];
  if (resultData.requiresApproval) {
    nextStage = PROCESSING_STAGE.AWAIT_APPROVAL;
  } else if (resultData.hasChanges) {
    nextStage = PROCESSING_STAGE.CREATE_SCHEMA_VERSION;
  } else {
    nextStage = PROCESSING_STAGE.GEOCODE_BATCH;
  }

  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: jobIdTyped,
    data: {
      schema: resultData.detectedSchema,
      schemaValidation: {
        isCompatible: !resultData.comparison.isBreaking,
        breakingChanges: resultData.breakingChanges,
        newFields: resultData.newFields,
        transformSuggestions: resultData.transformSuggestions,
        requiresApproval: resultData.requiresApproval,
        approvalReason: resultData.approvalReason,
      },
      stage: nextStage,
    },
  });

  await ProgressTrackingService.completeStage(payload, importJobId, PROCESSING_STAGE.VALIDATE_SCHEMA);

  return {
    nextStage,
    output: {
      requiresApproval: resultData.requiresApproval,
      hasBreakingChanges: resultData.comparison.isBreaking,
      newFields: resultData.newFields.length,
    },
  };
};

/** Best-effort sidecar CSV cleanup for error paths. */
const cleanupSidecarsOnError = async (payload: Payload, jobId: number): Promise<void> => {
  try {
    const { job: failedJob, importFile: failedFile } = await loadJobResources(payload, jobId);
    const failedFilePath = getImportFilePath(failedFile.filename ?? "");
    cleanupSidecarFiles(failedFilePath, failedJob.sheetIndex ?? 0);
  } catch {
    // Best-effort cleanup — don't mask the original error
  }
};

export const validateSchemaJob = {
  slug: JOB_TYPES.VALIDATE_SCHEMA,
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as ValidateSchemaJobInput["input"];
    const { importJobId } = input;

    const jobIdTyped = typeof importJobId === "number" ? importJobId : parseStrictInteger(importJobId);
    if (jobIdTyped == null) {
      throw new Error("Invalid import job ID");
    }
    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "validate-schema");
    logger.info("Starting schema validation", { importJobId });
    const startTime = Date.now();

    try {
      const { job, dataset, importFile } = await loadJobResources(payload, jobIdTyped);

      const uniqueRows = job.duplicates?.summary?.uniqueRows ?? 0;
      await ProgressTrackingService.startStage(payload, importJobId, PROCESSING_STAGE.VALIDATE_SCHEMA, uniqueRows);

      // Check event quota
      if (importFile.user) {
        const user =
          typeof importFile.user === "object"
            ? importFile.user
            : await payload.findByID({ collection: "users", id: importFile.user });

        if (user) {
          await checkImportQuotas(payload, user, job, jobIdTyped);
          logger.info("Event quotas validated");
        }
      }

      // Schema detection and comparison
      const { detectedSchema } = await getSchemaFromCache({ schemaBuilderState: job.schemaBuilderState });
      const currentSchema = await getCurrentSchema(payload, dataset.id);
      const comparison = compareSchemas(currentSchema, detectedSchema);
      const transformSuggestions = detectTransforms(currentSchema, detectedSchema, comparison.changes);
      const hasHighConfidenceTransforms = transformSuggestions.some((s) => s.confidence >= 80);
      const { breakingChanges, newFields } = extractSchemaChanges(comparison, detectedSchema);
      const hasChanges = comparison.changes.length > 0;

      // Schema mode evaluation
      const processingOptions = (importFile.processingOptions as ProcessingOptions) ?? {};
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
        return await handleSchemaModeFailure(payload, jobIdTyped, importJobId, schemaModeResult, {
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

      const result = await applyValidationResult(payload, jobIdTyped, importJobId, {
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
        importJobId,
        hasBreakingChanges: comparison.isBreaking,
        requiresApproval,
      });

      return { output: result.output };
    } catch (error) {
      logError(error, "Schema validation failed", { importJobId });

      await cleanupSidecarsOnError(payload, jobIdTyped);

      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: jobIdTyped,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errors: [{ row: 0, error: error instanceof Error ? error.message : "Unknown error" }],
        },
      });

      throw error;
    }
  },
};
