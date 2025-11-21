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

// Type for valid transform
type ValidTransform = {
  id: string;
  type: string;
  from: string;
  to: string;
  active?: boolean | null;
  autoDetected?: boolean | null;
};

// Helper to extract active transforms from dataset
const extractActiveTransforms = (dataset: Dataset): ImportTransform[] => {
  return (dataset.importTransforms ?? [])
    .filter(
      (t: unknown): t is ValidTransform =>
        typeof t === "object" && t !== null && "type" in t && "from" in t && "to" in t && "id" in t
    )
    .filter((t) => t.active === true)
    .map((t) => ({
      id: t.id,
      type: t.type as "rename",
      from: t.from,
      to: t.to,
      active: true,
      autoDetected: t.autoDetected ?? false,
    }));
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
      from: t.from,
      to: t.to,
      type: t.type,
    })),
  });

  return { dataset, transforms };
};

// Helper to merge detected mappings with overrides
const mergeFieldMappings = (
  detectedMappings: { titlePath: string | null; descriptionPath: string | null; timestampPath: string | null },
  dataset: Dataset | null
) => ({
  titlePath: dataset?.fieldMappingOverrides?.titlePath ?? detectedMappings.titlePath,
  descriptionPath: dataset?.fieldMappingOverrides?.descriptionPath ?? detectedMappings.descriptionPath,
  timestampPath: dataset?.fieldMappingOverrides?.timestampPath ?? detectedMappings.timestampPath,
});

// Helper to detect and store field mappings
const detectAndStoreFieldMappings = async (
  payload: Payload,
  importJobId: number | string,
  fieldStats: Record<string, FieldStatistics> | undefined,
  dataset: Dataset | null,
  logger: ReturnType<typeof createJobLogger>
): Promise<void> => {
  if (!fieldStats) {
    // No schema state - just transition
    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: importJobId,
      data: { stage: PROCESSING_STAGE.VALIDATE_SCHEMA },
    });
    return;
  }

  // Detect field mappings or use overrides
  const detectedMappings = detectFieldMappings(fieldStats, dataset?.language ?? "eng");
  const fieldMappings = mergeFieldMappings(detectedMappings, dataset);

  logger.info("Field mappings detected", {
    fieldMappings,
    language: dataset?.language ?? "eng",
    overridesUsed: {
      title: Boolean(dataset?.fieldMappingOverrides?.titlePath),
      description: Boolean(dataset?.fieldMappingOverrides?.descriptionPath),
      timestamp: Boolean(dataset?.fieldMappingOverrides?.timestampPath),
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

// Helper to handle batch completion
const handleBatchCompletion = async (
  payload: Payload,
  importJobId: number | string,
  job: ImportJob,
  dataset: Dataset | null,
  logger: ReturnType<typeof createJobLogger>,
  batchNumber: number
): Promise<{ output: { completed: true; batchNumber: number; rowsProcessed: number; hasMore: false } }> => {
  const previousState = getSchemaBuilderState(job);
  await detectAndStoreFieldMappings(payload, importJobId, previousState?.fieldStats, dataset, logger);
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
  currentState: { fieldStats?: Record<string, FieldStatistics> } | null,
  dataset: Dataset | null,
  logger: ReturnType<typeof createJobLogger>
): Promise<void> => {
  logger.info("Last batch - detecting field mappings", {
    hasFieldStats: Boolean(currentState?.fieldStats),
    fieldStatsKeys: currentState?.fieldStats ? Object.keys(currentState.fieldStats) : [],
    datasetLanguage: dataset?.language ?? "eng",
  });

  await detectAndStoreFieldMappings(payload, importJobId, currentState?.fieldStats, dataset, logger);
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

      // Load dataset and extract active transforms
      const { dataset, transforms } = await loadDatasetAndTransforms(payload, job, logger);

      // Extract duplicate rows
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
        BATCH_SIZE,
      });

      // Get current state BEFORE updating
      const currentState = schemaBuilder.getState();
      logger.debug("Schema builder state", {
        hasState: Boolean(currentState),
        hasFieldStats: Boolean(currentState?.fieldStats),
        fieldStatsKeys: currentState?.fieldStats ? Object.keys(currentState.fieldStats) : [],
        schemaKeys: updatedSchema ? Object.keys(updatedSchema) : [],
      });

      // Update job progress
      const hasMore = rows.length === BATCH_SIZE;
      logger.debug("Checking if more batches needed", {
        rowsLength: rows.length,
        BATCH_SIZE,
        hasMore,
      });

      await ProgressTrackingService.updateJobProgress(
        payload,
        importJobId,
        "schema_detection",
        nonDuplicateRows.length,
        job,
        {
          schema: updatedSchema,
          schemaBuilderState: currentState,
        }
      );

      // Handle next steps
      if (hasMore) {
        await queueNextBatch(payload, importJobId, batchNumber, logger);
      } else {
        await completeLastBatch(payload, importJobId, currentState, dataset, logger);
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

      // Update job status to failed
      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errors: [
            {
              row: batchNumber * 10000,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          ],
        },
      });

      throw error;
    }
  },
};
