/**
 * Defines the job handler for detecting the schema from a batch of imported data.
 *
 * This job processes a batch of rows from the import file to progressively build a schema.
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
/* eslint-disable complexity -- Schema detection handles multiple column types and validation cases */
import type { Payload } from "payload";

import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { applyTransformsBatch } from "@/lib/services/import-transforms";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import { detectFieldMappings } from "@/lib/services/schema-builder/field-mapping-detection";
import type { ImportTransform } from "@/lib/types/import-transforms";
import { type FieldStatistics, getSchemaBuilderState } from "@/lib/types/schema-detection";
import { readBatchFromFile } from "@/lib/utils/file-readers";
import type { Dataset, ImportJob } from "@/payload-types";

import type { SchemaDetectionJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";
import { extractDuplicateRows, loadJobAndFilePath } from "../utils/resource-loading";

// Helper to extract active transforms from dataset
const extractActiveTransforms = (dataset: Dataset): ImportTransform[] => {
  const transforms: ImportTransform[] = [];
  for (const t of dataset.importTransforms ?? []) {
    if (
      typeof t === "object" &&
      t !== null &&
      typeof t.id === "string" &&
      typeof t.type === "string" &&
      typeof t.from === "string" &&
      typeof t.to === "string" &&
      t.active === true
    ) {
      transforms.push({
        id: t.id,
        type: t.type as "rename",
        from: t.from,
        to: t.to,
        active: true,
        autoDetected: Boolean(t.autoDetected),
      });
    }
  }
  return transforms;
};

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
      transforms = extractActiveTransforms(dataset);
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

// eslint-disable-next-line complexity -- Merging detected mappings with overrides has many conditional cases
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
    data: {
      schema: updatedSchema,
      schemaBuilderState: finalState as unknown as Record<string, unknown>,
    },
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
    data: {
      detectedFieldMappings: fieldMappings,
      stage: PROCESSING_STAGE.VALIDATE_SCHEMA,
    },
  });
};

// Helper to handle batch completion (when reading 0 rows - file was exact multiple of batch size)
const handleBatchCompletion = async (
  payload: Payload,
  importJobId: number | string,
  job: ImportJob,
  dataset: Dataset | null,
  logger: ReturnType<typeof createJobLogger>,
  batchNumber: number
): Promise<{ output: { completed: true; batchNumber: number; rowsProcessed: number; hasMore: false } }> => {
  const previousState = getSchemaBuilderState(job);
  const schemaBuilder = previousState ? new ProgressiveSchemaBuilder(previousState) : null;
  await finalizeSchemaDetection(payload, importJobId, schemaBuilder, dataset, logger);
  return { output: { completed: true, batchNumber, rowsProcessed: 0, hasMore: false } };
};

// Helper to queue next batch
const queueNextBatch = async (
  payload: Payload,
  importJobId: number | string,
  batchNumber: number,
  logger: ReturnType<typeof createJobLogger>
): Promise<void> => {
  logger.debug("Queueing next batch", { nextBatch: batchNumber + 1 });
  await payload.jobs.queue({
    task: JOB_TYPES.DETECT_SCHEMA,
    input: { importJobId, batchNumber: batchNumber + 1 },
  });
};

// Helper to complete last batch with field mapping detection
const completeLastBatch = async (
  payload: Payload,
  importJobId: number | string,
  schemaBuilder: ProgressiveSchemaBuilder,
  dataset: Dataset | null,
  logger: ReturnType<typeof createJobLogger>
): Promise<void> => {
  logger.info("Last batch - finalizing schema detection", {
    datasetLanguage: dataset?.language ?? "eng",
  });

  await finalizeSchemaDetection(payload, importJobId, schemaBuilder, dataset, logger);
};

// Helper to process batch and update schema
const processBatchSchema = async (
  rows: Record<string, unknown>[],
  job: ImportJob,
  batchNumber: number,
  duplicateRows: Set<number>,
  transforms: ImportTransform[]
) => {
  const BATCH_SIZE = BATCH_SIZES.SCHEMA_DETECTION;

  // Filter out duplicate rows
  const nonDuplicateRows = rows.filter((_row, index) => {
    const rowNumber = batchNumber * BATCH_SIZE + index;
    return !duplicateRows.has(rowNumber);
  });

  // Apply import transforms before schema building
  const transformedRows = transforms.length > 0 ? applyTransformsBatch(nonDuplicateRows, transforms) : nonDuplicateRows;

  // Build schema progressively
  const previousState = getSchemaBuilderState(job);
  const schemaBuilder = new ProgressiveSchemaBuilder(previousState ?? undefined);

  if (transformedRows.length > 0) {
    schemaBuilder.processBatch(transformedRows);
  }

  const updatedSchema = await schemaBuilder.getSchema();

  return {
    nonDuplicateRows: transformedRows,
    schemaBuilder,
    updatedSchema,
  };
};

// Helper to initialize stage on first batch
const initializeStageIfNeeded = async (
  payload: Payload,
  importJobId: number | string,
  job: ImportJob,
  batchNumber: number
): Promise<void> => {
  if (batchNumber === 0) {
    const uniqueRows = job.duplicates?.summary?.uniqueRows ?? 0;
    await ProgressTrackingService.startStage(payload, importJobId, PROCESSING_STAGE.DETECT_SCHEMA, uniqueRows);
  }
};

// Helper to update progress after batch processing
const updateBatchProgress = async (
  payload: Payload,
  importJobId: number | string,
  batchNumber: number,
  rowsInBatch: number,
  nonDuplicateRows: number
): Promise<void> => {
  const BATCH_SIZE = BATCH_SIZES.SCHEMA_DETECTION;
  const rowsProcessedSoFar = (batchNumber + 1) * BATCH_SIZE - (rowsInBatch < BATCH_SIZE ? BATCH_SIZE - rowsInBatch : 0);

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
    data: {
      schema: updatedSchema,
      schemaBuilderState: currentState as unknown as Record<string, unknown>,
    },
  });
};

// Helper to handle next batch
const handleNextBatch = async (
  payload: Payload,
  importJobId: number | string,
  batchNumber: number,
  logger: ReturnType<typeof createJobLogger>
): Promise<void> => {
  await queueNextBatch(payload, importJobId, batchNumber, logger);
};

// Helper to handle completion after last batch
const handleCompletion = async (
  payload: Payload,
  importJobId: number | string,
  schemaBuilder: ProgressiveSchemaBuilder,
  dataset: Dataset | null,
  logger: ReturnType<typeof createJobLogger>
): Promise<void> => {
  await ProgressTrackingService.completeStage(payload, importJobId, PROCESSING_STAGE.DETECT_SCHEMA);
  await completeLastBatch(payload, importJobId, schemaBuilder, dataset, logger);
};

export const schemaDetectionJob = {
  slug: JOB_TYPES.DETECT_SCHEMA,
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as SchemaDetectionJobInput["input"];
    const { importJobId, batchNumber } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "schema-detection");
    logger.info("Starting schema detection batch", { importJobId, batchNumber });
    const startTime = Date.now();

    try {
      // Load resources
      const { job, filePath } = await loadJobAndFilePath(payload, importJobId);
      await initializeStageIfNeeded(payload, importJobId, job, batchNumber);

      // Load dataset and extract active transforms
      const { dataset, transforms } = await loadDatasetAndTransforms(payload, job, logger);
      const duplicateRows = extractDuplicateRows(job);

      // Read batch from file
      const BATCH_SIZE = BATCH_SIZES.SCHEMA_DETECTION;
      const rows = readBatchFromFile(filePath, {
        sheetIndex: job.sheetIndex ?? undefined,
        startRow: batchNumber * BATCH_SIZE,
        limit: BATCH_SIZE,
      });

      // Check if we're done
      if (rows.length === 0) {
        return await handleBatchCompletion(payload, importJobId, job, dataset, logger, batchNumber);
      }

      // Process batch and build schema
      const { nonDuplicateRows, schemaBuilder, updatedSchema } = await processBatchSchema(
        rows,
        job,
        batchNumber,
        duplicateRows,
        transforms
      );

      logger.debug("Schema detection batch processed", {
        batchNumber,
        rowsProcessed: nonDuplicateRows.length,
        totalRows: rows.length,
      });

      // Check if this is the last batch
      const hasMore = rows.length === BATCH_SIZE;

      // Update progress
      await updateBatchProgress(payload, importJobId, batchNumber, rows.length, nonDuplicateRows.length);

      // Handle next batch or completion
      if (hasMore) {
        // Save intermediate state for next batch
        const currentState = schemaBuilder.getState();
        await updateSchemaState(payload, importJobId, updatedSchema, currentState);
        await handleNextBatch(payload, importJobId, batchNumber, logger);
      } else {
        // Final state (with enum detection) saved by finalizeSchemaDetection
        await handleCompletion(payload, importJobId, schemaBuilder, dataset, logger);
      }

      logPerformance("Schema detection batch", Date.now() - startTime, {
        importJobId,
        batchNumber,
        rowsProcessed: nonDuplicateRows.length,
        totalRowsInBatch: rows.length,
        duplicatesSkipped: rows.length - nonDuplicateRows.length,
        hasMore,
      });

      return {
        output: {
          batchNumber,
          rowsProcessed: rows.length,
          hasMore,
        },
      };
    } catch (error) {
      logError(error, "Batch processing failed", { importJobId, batchNumber });

      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errors: [
            {
              row: batchNumber * BATCH_SIZES.SCHEMA_DETECTION,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          ],
        },
      });

      throw error;
    }
  },
};
