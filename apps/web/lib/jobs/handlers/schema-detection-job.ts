/**
 * Defines the job handler for detecting the schema from imported data.
 *
 * This single job streams all batches from the import file to progressively build a schema.
 * It skips rows that were identified as duplicates to ensure the schema is based on unique data.
 *
 * Key responsibilities include:
 * - Using a `ProgressiveSchemaBuilder` to infer data types and properties for each column.
 * - Detecting fields that could be used for geocoding (e.g., address, latitude, longitude).
 * - Storing the evolving schema and the builder's state in the `import-jobs` document.
 *
 * After processing all batches, the import job transitions to the `SCHEMA_VALIDATION` stage.
 *
 * @module
 */
/* oxlint-disable complexity -- Schema detection handles multiple column types and validation cases */
import type { Payload } from "payload";

import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { applyTransformsBatch } from "@/lib/services/import-transforms";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import { detectFieldMappings } from "@/lib/services/schema-builder/field-mapping-detection";
import type { ImportTransform } from "@/lib/types/import-transforms";
import { type FieldStatistics, getSchemaBuilderState } from "@/lib/types/schema-detection";
import { streamBatchesFromFile } from "@/lib/utils/file-readers";
import type { Dataset, ImportJob } from "@/payload-types";

import type { SchemaDetectionJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";
import { extractDuplicateRows, loadJobAndFilePath } from "../utils/resource-loading";
import { buildTransformsFromDataset } from "../utils/transform-builders";

// Helper to load dataset and extract active transforms
const loadDatasetAndTransforms = async (
  payload: Payload,
  job: ImportJob,
  logger: ReturnType<typeof createJobLogger>
): Promise<{ dataset: Dataset | null; transforms: ImportTransform[] }> => {
  let transforms: ImportTransform[] = [];
  let dataset: Dataset | null = null;

  try {
    dataset =
      typeof job.dataset === "object"
        ? job.dataset
        : await payload.findByID({ collection: COLLECTION_NAMES.DATASETS, id: job.dataset });

    if (dataset) {
      transforms = buildTransformsFromDataset(dataset);
    }
  } catch (error) {
    // If dataset loading fails, continue with no transforms
    logger.warn("Failed to load dataset for transforms", { error, dataset: job.dataset });
  }

  logger.info("Loaded import transforms", {
    transformCount: transforms.length,
    transforms: transforms.map((t) => ({
      type: t.type,
      // For logging, show from/to for rename-like transforms
      ...("from" in t && { from: t.from }),
      ...("to" in t && { to: t.to }),
    })),
  });

  return { dataset, transforms };
};

// Helper to merge detected mappings with overrides
const mergeFieldMappings = (
  detectedMappings: {
    titlePath: string | null;
    descriptionPath: string | null;
    locationNamePath: string | null;
    timestampPath: string | null;
    latitudePath: string | null;
    longitudePath: string | null;
    locationPath: string | null;
  },
  dataset: Dataset | null
) => ({
  titlePath: dataset?.fieldMappingOverrides?.titlePath ?? detectedMappings.titlePath,
  descriptionPath: dataset?.fieldMappingOverrides?.descriptionPath ?? detectedMappings.descriptionPath,
  locationNamePath: dataset?.fieldMappingOverrides?.locationNamePath ?? detectedMappings.locationNamePath,
  timestampPath: dataset?.fieldMappingOverrides?.timestampPath ?? detectedMappings.timestampPath,
  latitudePath: dataset?.fieldMappingOverrides?.latitudePath ?? detectedMappings.latitudePath,
  longitudePath: dataset?.fieldMappingOverrides?.longitudePath ?? detectedMappings.longitudePath,
  locationPath: dataset?.fieldMappingOverrides?.locationPath ?? detectedMappings.locationPath,
});

// Helper to finalize schema detection: runs enum detection, saves state, detects field mappings
const finalizeSchemaDetection = async (
  payload: Payload,
  importJobId: number | string,
  schemaBuilder: ProgressiveSchemaBuilder | null,
  dataset: Dataset | null,
  logger: ReturnType<typeof createJobLogger>
): Promise<void> => {
  if (!schemaBuilder) {
    // No schema state - just transition
    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: importJobId,
      data: { stage: PROCESSING_STAGE.VALIDATE_SCHEMA },
    });
    return;
  }

  // Run enum detection once at the true end of schema detection
  schemaBuilder.detectEnumFields();
  const finalState = schemaBuilder.getState();

  // Save final state with enum info to database
  const updatedSchema = await schemaBuilder.getSchema();
  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
    data: { schema: updatedSchema, schemaBuilderState: finalState as unknown as Record<string, unknown> },
  });

  // Detect field mappings or use overrides
  const detectedMappings = detectFieldMappings(finalState.fieldStats, dataset?.language ?? "eng");
  const fieldMappings = mergeFieldMappings(detectedMappings, dataset);

  logger.info("Field mappings detected", {
    fieldMappings,
    language: dataset?.language ?? "eng",
    overridesUsed: {
      title: Boolean(dataset?.fieldMappingOverrides?.titlePath),
      description: Boolean(dataset?.fieldMappingOverrides?.descriptionPath),
      locationName: Boolean(dataset?.fieldMappingOverrides?.locationNamePath),
      timestamp: Boolean(dataset?.fieldMappingOverrides?.timestampPath),
      latitude: Boolean(dataset?.fieldMappingOverrides?.latitudePath),
      longitude: Boolean(dataset?.fieldMappingOverrides?.longitudePath),
      location: Boolean(dataset?.fieldMappingOverrides?.locationPath),
    },
  });

  // Store field mappings and transition
  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
    data: { detectedFieldMappings: fieldMappings, stage: PROCESSING_STAGE.VALIDATE_SCHEMA },
  });
};

// Helper to process batch and update schema
const processBatchSchema = async (
  rows: Record<string, unknown>[],
  previousState: ReturnType<typeof getSchemaBuilderState>,
  globalRowOffset: number,
  duplicateRows: Set<number>,
  transforms: ImportTransform[]
) => {
  // Filter out duplicate rows
  const nonDuplicateRows = rows.filter((_row, index) => {
    const rowNumber = globalRowOffset + index;
    return !duplicateRows.has(rowNumber);
  });

  // Apply import transforms before schema building
  const transformedRows = transforms.length > 0 ? applyTransformsBatch(nonDuplicateRows, transforms) : nonDuplicateRows;

  // Build schema progressively
  const schemaBuilder = new ProgressiveSchemaBuilder(previousState ?? undefined);

  if (transformedRows.length > 0) {
    schemaBuilder.processBatch(transformedRows);
  }

  const updatedSchema = await schemaBuilder.getSchema();

  return { nonDuplicateRows: transformedRows, schemaBuilder, updatedSchema };
};

// Helper to update progress after batch processing
const updateBatchProgress = async (
  payload: Payload,
  importJobId: number | string,
  rowsProcessedSoFar: number,
  batchNumber: number,
  nonDuplicateRows: number
): Promise<void> => {
  await ProgressTrackingService.updateStageProgress(
    payload,
    importJobId,
    PROCESSING_STAGE.DETECT_SCHEMA,
    rowsProcessedSoFar,
    nonDuplicateRows
  );

  await ProgressTrackingService.completeBatch(payload, importJobId, PROCESSING_STAGE.DETECT_SCHEMA, batchNumber + 1);
};

// Helper to update schema state in database
const updateSchemaState = async (
  payload: Payload,
  importJobId: number | string,
  updatedSchema: Record<string, unknown>,
  currentState: { fieldStats?: Record<string, FieldStatistics> } | null
): Promise<void> => {
  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
    data: { schema: updatedSchema, schemaBuilderState: currentState as unknown as Record<string, unknown> },
  });
};

export const schemaDetectionJob = {
  slug: JOB_TYPES.DETECT_SCHEMA,
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as SchemaDetectionJobInput["input"];
    const { importJobId } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "schema-detection");
    logger.info("Starting schema detection", { importJobId });
    const startTime = Date.now();

    try {
      // Load resources
      const { job, filePath } = await loadJobAndFilePath(payload, importJobId);

      // Initialize stage
      const uniqueRows = job.duplicates?.summary?.uniqueRows ?? 0;
      await ProgressTrackingService.startStage(payload, importJobId, PROCESSING_STAGE.DETECT_SCHEMA, uniqueRows);

      // Load dataset and extract active transforms
      const { dataset, transforms } = await loadDatasetAndTransforms(payload, job, logger);
      const duplicateRows = extractDuplicateRows(job);

      const BATCH_SIZE = BATCH_SIZES.SCHEMA_DETECTION;
      let batchNumber = 0;
      let totalRowsProcessed = 0;
      let lastSchemaBuilder: ProgressiveSchemaBuilder | null = null;
      let previousState = getSchemaBuilderState(job);

      for await (const rows of streamBatchesFromFile(filePath, {
        sheetIndex: job.sheetIndex ?? undefined,
        batchSize: BATCH_SIZE,
      })) {
        // Process batch and build schema
        const { nonDuplicateRows, schemaBuilder, updatedSchema } = await processBatchSchema(
          rows,
          previousState,
          totalRowsProcessed,
          duplicateRows,
          transforms
        );

        totalRowsProcessed += rows.length;
        lastSchemaBuilder = schemaBuilder;

        logger.debug("Schema detection batch processed", {
          batchNumber,
          rowsProcessed: nonDuplicateRows.length,
          totalRows: rows.length,
        });

        // Update progress
        await updateBatchProgress(payload, importJobId, totalRowsProcessed, batchNumber, nonDuplicateRows.length);

        // Save intermediate state for observability
        const currentState = schemaBuilder.getState();
        await updateSchemaState(payload, importJobId, updatedSchema, currentState);
        previousState = currentState;

        batchNumber++;
      }

      // Complete stage and finalize
      await ProgressTrackingService.completeStage(payload, importJobId, PROCESSING_STAGE.DETECT_SCHEMA);
      await finalizeSchemaDetection(payload, importJobId, lastSchemaBuilder, dataset, logger);

      logPerformance("Schema detection", Date.now() - startTime, {
        importJobId,
        totalBatches: batchNumber,
        totalRowsProcessed,
      });

      return { output: { totalBatches: batchNumber, totalRowsProcessed } };
    } catch (error) {
      logError(error, "Schema detection failed", { importJobId });

      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errors: [{ row: 0, error: error instanceof Error ? error.message : "Unknown error" }],
        },
      });

      throw error;
    }
  },
};
