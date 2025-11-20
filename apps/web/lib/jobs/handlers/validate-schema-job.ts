/**
 * Defines the job handler for validating the detected schema against the dataset's existing schema.
 *
 * This job is responsible for schema management and versioning. Its main tasks are:
 * - Finalizing the schema detection using the cached state from the schema detection stage.
 * - Comparing the newly detected schema with the current schema version of the target dataset.
 * - Identifying breaking changes (e.g., type changes, removed fields) and non-breaking changes (e.g., new optional fields).
 * - Determining whether the changes can be automatically approved based on the dataset's configuration.
 *
 * If changes require manual intervention, the job is paused at the `AWAITING_APPROVAL` stage.
 * If auto-approved, a new schema version is created, and the job proceeds to the `GEOCODING` stage.
 *
 * @module
 */
import type { Payload, PayloadRequest } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { QUOTA_TYPES } from "@/lib/constants/quota-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { getQuotaService } from "@/lib/services/quota-service";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import { compareSchemas } from "@/lib/services/schema-builder/schema-comparison";
import { SchemaVersioningService } from "@/lib/services/schema-versioning";
import type { SchemaComparison } from "@/lib/types/schema-detection";
import { getSchemaBuilderState } from "@/lib/types/schema-detection";
import type { ImportJob, User } from "@/payload-types";

import type { ValidateSchemaJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";

// Helper function to load required resources
const loadResources = async (payload: Payload, importJobId: number) => {
  const job = await payload.findByID({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
  });

  if (!job) {
    throw new Error(`Import job not found: ${importJobId}`);
  }

  const dataset =
    typeof job.dataset === "object"
      ? job.dataset
      : await payload.findByID({ collection: COLLECTION_NAMES.DATASETS, id: job.dataset });

  if (!dataset) {
    throw new Error("Dataset not found");
  }

  const importFile =
    typeof job.importFile === "object"
      ? job.importFile
      : await payload.findByID({ collection: COLLECTION_NAMES.IMPORT_FILES, id: job.importFile });

  if (!importFile) {
    throw new Error("Import file not found");
  }

  return { job, dataset, importFile };
};

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
    where: {
      dataset: { equals: datasetId },
    },
    sort: "-version",
    limit: 1,
  });

  const currentSchemaRaw = currentSchemaDoc.docs[0]?.schema ?? {};
  return typeof currentSchemaRaw === "object" && !Array.isArray(currentSchemaRaw)
    ? (currentSchemaRaw as Record<string, unknown>)
    : {};
};

// Helper function to determine if approval is required
const checkRequiresApproval = (
  comparison: SchemaComparison,
  dataset: { schemaConfig?: { locked?: boolean | null; autoApproveNonBreaking?: boolean | null } | null }
): boolean => comparison.isBreaking || !!dataset.schemaConfig?.locked || !dataset.schemaConfig?.autoApproveNonBreaking;

// Helper function to handle schema approval
const handleSchemaApproval = async (options: {
  payload: Payload;
  requiresApproval: boolean;
  comparison: SchemaComparison;
  detectedSchema: Record<string, unknown>;
  schemaBuilder: ProgressiveSchemaBuilder;
  dataset: {
    id: string | number;
    schemaConfig?: { locked?: boolean | null; autoApproveNonBreaking?: boolean | null } | null;
  };
  importJobId: number | string;
  req?: PayloadRequest;
}) => {
  const { payload, requiresApproval, comparison, detectedSchema, schemaBuilder, dataset, importJobId, req } = options;
  const hasChanges = comparison.changes.length > 0;
  if (!requiresApproval && hasChanges) {
    const schemaVersion = await SchemaVersioningService.createSchemaVersion(payload, {
      dataset: dataset.id,
      schema: detectedSchema,
      fieldMetadata: schemaBuilder.getState().fieldStats,
      autoApproved: true,
      approvedBy: null, // No user for auto-approval
      importSources: [],
      req,
    });

    await SchemaVersioningService.linkImportToSchemaVersion(payload, importJobId, schemaVersion.id, req);
  }
};

/**
 * Check quota limits for the import
 */
const checkImportQuotas = async (payload: Payload, user: User, job: ImportJob, jobIdTyped: number): Promise<void> => {
  const quotaService = getQuotaService(payload);

  // Calculate total events to be imported (considering duplicates)
  const totalRows = job.progress?.total ?? 0;
  const duplicateCount = (job.duplicates as { summary?: { total?: number } })?.summary?.total ?? 0;
  const eventsToImport = totalRows - duplicateCount;

  // Check maxEventsPerImport quota
  const eventQuotaCheck = quotaService.checkQuota(user, QUOTA_TYPES.EVENTS_PER_IMPORT, eventsToImport);

  if (!eventQuotaCheck.allowed) {
    const errorMessage = `This import would create ${eventsToImport} events, exceeding your limit of ${eventQuotaCheck.limit} events per import.`;

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: jobIdTyped,
      data: {
        stage: PROCESSING_STAGE.FAILED,
        errors: [{ row: 0, error: errorMessage }],
      },
    });

    throw new Error(errorMessage);
  }

  // Check total events quota
  const totalEventsCheck = quotaService.checkQuota(user, QUOTA_TYPES.TOTAL_EVENTS, eventsToImport);

  if (!totalEventsCheck.allowed) {
    const errorMessage = `Creating ${eventsToImport} events would exceed your total events limit (${totalEventsCheck.current}/${totalEventsCheck.limit}).`;

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: jobIdTyped,
      data: {
        stage: PROCESSING_STAGE.FAILED,
        errors: [{ row: 0, error: errorMessage }],
      },
    });

    throw new Error(errorMessage);
  }
};

// Extract schema changes for backward compatibility
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

export const validateSchemaJob = {
  slug: JOB_TYPES.VALIDATE_SCHEMA,
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as ValidateSchemaJobInput["input"];
    const { importJobId } = input;

    const jobIdTyped = typeof importJobId === "string" ? parseInt(importJobId, 10) : importJobId;
    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "validate-schema");
    logger.info("Starting schema validation", { importJobId });
    const startTime = Date.now();

    try {
      // Load all required resources
      const { job, dataset, importFile } = await loadResources(payload, jobIdTyped);

      // Check event quota against the number of rows to be imported
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

      // Get schema from cached builder state (no file reading needed)
      const { schemaBuilder, detectedSchema } = await getSchemaFromCache({
        schemaBuilderState: job.schemaBuilderState,
      });

      // Get current schema and compare
      const currentSchema = await getCurrentSchema(payload, dataset.id);
      const comparison = compareSchemas(currentSchema, detectedSchema);
      const requiresApproval = checkRequiresApproval(comparison, dataset);

      // Extract changes
      const { breakingChanges, newFields } = extractSchemaChanges(comparison, detectedSchema);

      // Update job with validation results
      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: jobIdTyped,
        data: {
          schema: detectedSchema,
          schemaValidation: {
            isCompatible: !comparison.isBreaking,
            breakingChanges,
            newFields,
            requiresApproval,
            approvalReason: comparison.isBreaking
              ? "Breaking schema changes detected"
              : "Manual approval required by dataset configuration",
          },
          stage: requiresApproval ? PROCESSING_STAGE.AWAIT_APPROVAL : PROCESSING_STAGE.GEOCODE_BATCH,
        },
      });

      // Handle schema approval if needed
      await handleSchemaApproval({
        payload,
        requiresApproval,
        comparison,
        detectedSchema,
        schemaBuilder,
        dataset,
        importJobId,
        req: context.req as PayloadRequest | undefined,
      });

      logPerformance("Schema validation", Date.now() - startTime, {
        importJobId,
        hasBreakingChanges: comparison.isBreaking,
        requiresApproval,
      });

      return {
        output: {
          requiresApproval,
          hasBreakingChanges: comparison.isBreaking,
          newFields: newFields.length,
        },
      };
    } catch (error) {
      logError(error, "Schema validation failed", { importJobId });

      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: jobIdTyped,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errors: [
            {
              row: 0,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          ],
        },
      });

      throw error;
    }
  },
};
