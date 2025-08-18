/**
 * @module Defines the job handler for validating the detected schema against the dataset's existing schema.
 *
 * This job is responsible for schema management and versioning. Its main tasks are:
 * - Finalizing the schema detection for the entire file using the state from the previous stage.
 * - Comparing the newly detected schema with the current schema version of the target dataset.
 * - Identifying breaking changes (e.g., type changes, removed fields) and non-breaking changes (e.g., new optional fields).
 * - Determining whether the changes can be automatically approved based on the dataset's configuration.
 *
 * If changes require manual intervention, the job is paused at the `AWAITING_APPROVAL` stage.
 * If auto-approved, a new schema version is created, and the job proceeds to the `GEOCODING` stage.
 */
import path from "path";
import type { Payload } from "payload";

import { BATCH_SIZES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import { SchemaVersioningService } from "@/lib/services/schema-versioning";
import { getSchemaBuilderState } from "@/lib/types/schema-detection";
import { readBatchFromFile } from "@/lib/utils/file-readers";

import type { ValidateSchemaJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";

export const validateSchemaJob = {
  slug: JOB_TYPES.VALIDATE_SCHEMA,
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as ValidateSchemaJobInput["input"];
    const { importJobId } = input;

    // Ensure importJobId is properly typed
    const jobIdTyped = typeof importJobId === "string" ? parseInt(importJobId, 10) : importJobId;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "validate-schema");
    logger.info("Starting schema validation", { importJobId });
    const startTime = Date.now();

    try {
      // Get import job
      const job = await payload.findByID({
        collection: "import-jobs",
        id: jobIdTyped,
      });

      if (!job) {
        throw new Error(`Import job not found: ${importJobId}`);
      }

      // Get dataset configuration
      const dataset =
        typeof job.dataset === "object"
          ? job.dataset
          : await payload.findByID({ collection: "datasets", id: job.dataset });

      if (!dataset) {
        throw new Error("Dataset not found");
      }

      // Get file details
      const importFile =
        typeof job.importFile === "object"
          ? job.importFile
          : await payload.findByID({ collection: "import-files", id: job.importFile });

      if (!importFile) {
        throw new Error("Import file not found");
      }

      const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      const filePath = path.join(uploadDir, importFile.filename || "");

      // Get duplicate row numbers to skip
      const duplicateRows = new Set<number>();
      if (job.duplicates?.internal && Array.isArray(job.duplicates.internal)) {
        for (const d of job.duplicates.internal) {
          duplicateRows.add((d as { rowNumber: number }).rowNumber);
        }
      }
      if (job.duplicates?.external && Array.isArray(job.duplicates.external)) {
        for (const d of job.duplicates.external) {
          duplicateRows.add((d as { rowNumber: number }).rowNumber);
        }
      }

      // Re-build schema using progressive state from schema detection phase
      const previousState = getSchemaBuilderState(job);
      const schemaBuilder = new ProgressiveSchemaBuilder(previousState ?? undefined);
      const BATCH_SIZE = BATCH_SIZES.SCHEMA_VALIDATION;
      let batchNumber = 0;

      while (true) {
        const rows = await readBatchFromFile(filePath, {
          sheetIndex: job.sheetIndex ?? undefined,
          startRow: batchNumber * BATCH_SIZE,
          limit: BATCH_SIZE,
        });

        if (rows.length === 0) break;

        // Filter out duplicate rows before schema analysis
        const nonDuplicateRows = rows.filter((row, index) => {
          const rowNumber = batchNumber * BATCH_SIZE + index;
          return !duplicateRows.has(rowNumber);
        });

        // Process schema for non-duplicate rows only
        if (nonDuplicateRows.length > 0) {
          await schemaBuilder.processBatch(nonDuplicateRows);
        }

        batchNumber++;
      }

      const detectedSchemaRaw = await schemaBuilder.getSchema();
      const detectedSchema =
        typeof detectedSchemaRaw === "object" && !Array.isArray(detectedSchemaRaw)
          ? (detectedSchemaRaw as Record<string, unknown>)
          : {};

      // Get current schema from dataset-schemas collection
      const currentSchemaDoc = await payload.find({
        collection: "dataset-schemas",
        where: {
          dataset: { equals: dataset.id },
        },
        sort: "-version",
        limit: 1,
      });

      const currentSchemaRaw = currentSchemaDoc.docs[0]?.schema || {};
      const currentSchema =
        typeof currentSchemaRaw === "object" && !Array.isArray(currentSchemaRaw)
          ? (currentSchemaRaw as Record<string, unknown>)
          : {};

      // Compare schemas
      const comparison = compareSchemas(currentSchema, detectedSchema);

      // Determine if auto-approval is possible
      const canAutoApprove =
        dataset.schemaConfig?.autoGrow &&
        !comparison.hasBreakingChanges &&
        comparison.newFields.every((f: any) => f.optional);

      const requiresApproval =
        comparison.hasBreakingChanges || dataset.schemaConfig?.locked || !dataset.schemaConfig?.autoApproveNonBreaking;

      // Update job with validation results
      await payload.update({
        collection: "import-jobs",
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

      // If auto-approved, create new schema version
      if (!requiresApproval && comparison.hasChanges) {
        const schemaVersion = await SchemaVersioningService.createSchemaVersion(payload, {
          dataset: dataset.id,
          schema: detectedSchema,
          fieldMetadata: schemaBuilder.getState().fieldStats,
          autoApproved: true,
          approvedBy: 1, // System user
          importSources: [], // Keep empty to avoid circular dependency
        });

        await SchemaVersioningService.linkImportToSchemaVersion(payload, importJobId, schemaVersion.id);
      }

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

      // Update job status to failed
      await payload.update({
        collection: "import-jobs",
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
  const currentProps = (current.properties as Record<string, any>) || {};
  const detectedProps = (detected.properties as Record<string, any>) || {};

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
