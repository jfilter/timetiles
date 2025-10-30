/**
 * Defines the job handler for validating the detected schema against the dataset's existing schema.
 *
 * This job is responsible for schema management and versioning. Its main tasks are:
 * - Finalizing the schema detection for the entire file using the state from the previous stage.
 * - Comparing the newly detected schema with the current schema version of the target dataset.
 * - Identifying breaking changes (e.g., type changes, removed fields) and non-breaking changes (e.g., new optional fields).
 * - Determining whether the changes can be automatically approved based on the dataset's configuration.
 *
 * If changes require manual intervention, the job is paused at the `AWAITING_APPROVAL` stage.
 * If auto-approved, a new schema version is created, and the job proceeds to the `GEOCODING` stage.
 *
 * @module
 */
import path from "path";
import type { Payload } from "payload";

import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { QUOTA_TYPES } from "@/lib/constants/quota-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { getQuotaService } from "@/lib/services/quota-service";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import { SchemaVersioningService } from "@/lib/services/schema-versioning";
import { getSchemaBuilderState } from "@/lib/types/schema-detection";
import { readBatchFromFile } from "@/lib/utils/file-readers";
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

// Helper function to extract duplicate row numbers
const extractDuplicateRows = (job: ImportJob): Set<number> => {
  const duplicateRows = new Set<number>();

  // Handle the duplicates field which can be of various types
  const duplicates = job.duplicates;
  if (duplicates && typeof duplicates === "object" && !Array.isArray(duplicates)) {
    // Check for internal duplicates
    if (Array.isArray(duplicates.internal)) {
      duplicates.internal.forEach((d: unknown) => {
        if (typeof d === "object" && d !== null && "rowNumber" in d) {
          duplicateRows.add((d as { rowNumber: number }).rowNumber);
        }
      });
    }
    // Check for external duplicates
    if (Array.isArray(duplicates.external)) {
      duplicates.external.forEach((d: unknown) => {
        if (typeof d === "object" && d !== null && "rowNumber" in d) {
          duplicateRows.add((d as { rowNumber: number }).rowNumber);
        }
      });
    }
  }

  return duplicateRows;
};

// Helper function to process file schema
const processFileSchema = async (
  filePath: string,
  job: { sheetIndex: number; schemaBuilderState?: unknown },
  duplicateRows: Set<number>
): Promise<{ schemaBuilder: ProgressiveSchemaBuilder; detectedSchema: Record<string, unknown> }> => {
  const previousState = getSchemaBuilderState(job);
  const schemaBuilder = new ProgressiveSchemaBuilder(previousState ?? undefined);
  const BATCH_SIZE = BATCH_SIZES.SCHEMA_VALIDATION;
  let batchNumber = 0;

  while (true) {
    const rows = readBatchFromFile(filePath, {
      sheetIndex: job.sheetIndex ?? undefined,
      startRow: batchNumber * BATCH_SIZE,
      limit: BATCH_SIZE,
    });

    if (rows.length === 0) break;

    const nonDuplicateRows = rows.filter((_row, index) => {
      const rowNumber = batchNumber * BATCH_SIZE + index;
      return !duplicateRows.has(rowNumber);
    });

    if (nonDuplicateRows.length > 0) {
      schemaBuilder.processBatch(nonDuplicateRows);
    }

    batchNumber++;
  }

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
): boolean =>
  comparison.hasBreakingChanges || !!dataset.schemaConfig?.locked || !dataset.schemaConfig?.autoApproveNonBreaking;

// Helper function to handle schema approval
const handleSchemaApproval = async (
  payload: Payload,
  requiresApproval: boolean,
  comparison: SchemaComparison,
  detectedSchema: Record<string, unknown>,
  schemaBuilder: ProgressiveSchemaBuilder,
  dataset: {
    id: string | number;
    schemaConfig?: { locked?: boolean | null; autoApproveNonBreaking?: boolean | null } | null;
  },
  importJobId: number | string,
  req?: any
) => {
  if (!requiresApproval && comparison.hasChanges) {
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
  const eventQuotaCheck = await quotaService.checkQuota(user, QUOTA_TYPES.EVENTS_PER_IMPORT, eventsToImport);

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
  const totalEventsCheck = await quotaService.checkQuota(user, QUOTA_TYPES.TOTAL_EVENTS, eventsToImport);

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
        // Get the user who created this import
        const user =
          typeof importFile.user === "object"
            ? importFile.user
            : await payload.findByID({ collection: "users", id: importFile.user });

        if (user) {
          await checkImportQuotas(payload, user, job, jobIdTyped);
          logger.info("Event quotas validated");
        }
      }

      // Setup file path
      const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      const filePath = path.join(uploadDir, importFile.filename ?? "");

      // Extract duplicate rows
      const duplicateRows = extractDuplicateRows(job);

      // Process file schema
      const { schemaBuilder, detectedSchema } = await processFileSchema(
        filePath,
        {
          sheetIndex: job.sheetIndex ?? 0,
          schemaBuilderState: job.schemaBuilderState,
        },
        duplicateRows
      );

      // Get current schema
      const currentSchema = await getCurrentSchema(payload, dataset.id);

      // Compare schemas
      const comparison = compareSchemas(currentSchema, detectedSchema);

      // Check if approval is required
      const requiresApproval = checkRequiresApproval(comparison, dataset);

      // Update job with validation results
      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: jobIdTyped,
        data: {
          schema: detectedSchema,
          schemaValidation: {
            isCompatible: !comparison.hasBreakingChanges,
            breakingChanges: comparison.breakingChanges,
            newFields: comparison.newFields,
            requiresApproval,
            approvalReason: comparison.hasBreakingChanges
              ? "Breaking schema changes detected"
              : "Manual approval required by dataset configuration",
          },
          stage: requiresApproval ? PROCESSING_STAGE.AWAIT_APPROVAL : PROCESSING_STAGE.GEOCODE_BATCH,
        },
      });

      // Handle schema approval if needed
      await handleSchemaApproval(
        payload,
        requiresApproval,
        comparison,
        detectedSchema,
        schemaBuilder,
        dataset,
        importJobId,
        context.req
      );

      logPerformance("Schema validation", Date.now() - startTime, {
        importJobId,
        hasBreakingChanges: comparison.hasBreakingChanges,
        requiresApproval,
      });

      return {
        output: {
          requiresApproval,
          hasBreakingChanges: comparison.hasBreakingChanges,
          newFields: comparison.newFields.length,
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

// Schema comparison logic
interface SchemaComparison {
  hasBreakingChanges: boolean;
  hasChanges: boolean;
  breakingChanges: Array<{
    field: string;
    change: string;
    from?: string;
    to?: string;
  }>;
  newFields: Array<{
    field: string;
    type: string;
    optional: boolean;
  }>;
}

const compareSchemas = (current: Record<string, unknown>, detected: Record<string, unknown>): SchemaComparison => {
  const breakingChanges: SchemaComparison["breakingChanges"] = [];
  const newFields: SchemaComparison["newFields"] = [];

  // Type guards for schema properties
  const currentProps = (current.properties as Record<string, { type: string }>) || {};
  const detectedProps = (detected.properties as Record<string, { type: string }>) || {};

  // Check for type changes (breaking)
  for (const [field, currentType] of Object.entries(currentProps)) {
    const detectedType = detectedProps[field];
    if (detectedType && detectedType.type !== currentType.type) {
      breakingChanges.push({
        field,
        change: "type_change",
        from: currentType.type,
        to: detectedType.type,
      });
    }
  }

  // Check for new fields (non-breaking if optional)
  for (const [field, fieldSchema] of Object.entries(detectedProps)) {
    if (!currentProps[field]) {
      const required = Array.isArray(detected.required) ? detected.required : [];
      newFields.push({
        field,
        type: fieldSchema.type,
        optional: !required.includes(field),
      });
    }
  }

  // Check for removed required fields (breaking)
  const currentRequired = Array.isArray(current.required) ? current.required : [];
  for (const requiredField of currentRequired) {
    if (!detectedProps[requiredField as string]) {
      breakingChanges.push({
        field: requiredField as string,
        change: "required_field_removed",
      });
    }
  }

  return {
    hasBreakingChanges: breakingChanges.length > 0,
    hasChanges: breakingChanges.length > 0 || newFields.length > 0,
    breakingChanges,
    newFields,
  };
};
