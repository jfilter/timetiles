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
import { cleanupSidecarFiles, streamBatchesFromFile } from "@/lib/import/file-readers";
import { ProgressTrackingService } from "@/lib/import/progress-tracking";
import { applyTransformsBatch } from "@/lib/import/transforms";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import type { SchemaDetectionService } from "@/lib/services/schema-detection/service";
import type { DetectionContext } from "@/lib/services/schema-detection/types";
import { detectFlatFieldMappings, toFlatMappings } from "@/lib/services/schema-detection/utilities/flat-mappings";
import type { ImportTransform } from "@/lib/types/import-transforms";
import type { FieldStatistics, SchemaBuilderState } from "@/lib/types/schema-detection";
import type { Dataset, ImportJob } from "@/payload-types";

import type { SchemaDetectionJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";
import { extractDuplicateRows, failImportJob, loadJobAndFilePath } from "../utils/resource-loading";
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

// Helper to finalize schema detection using the pluggable SchemaDetectionService
const finalizeSchemaDetection = async (
  payload: Payload,
  importJobId: number | string,
  schemaBuilder: ProgressiveSchemaBuilder | null,
  dataset: Dataset | null,
  logger: ReturnType<typeof createJobLogger>
): Promise<void> => {
  if (!schemaBuilder) {
    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: importJobId,
      data: { stage: PROCESSING_STAGE.VALIDATE_SCHEMA },
    });
    return;
  }

  const finalState = schemaBuilder.getState();

  // Try the pluggable detection service (registered by schemaDetectionPlugin)
  // SchemaDetectionService is registered by the plugin at payload.config.custom.schemaDetection
  // In unit tests, payload.config may not exist, so access defensively
  const schemaDetection = payload.config?.custom?.schemaDetection as { service: SchemaDetectionService } | undefined;
  const service = schemaDetection?.service;

  let detectedMappings;
  let detectedLanguage: string | null = null;

  if (service) {
    const context: DetectionContext = {
      fieldStats: finalState.fieldStats,
      sampleData: finalState.dataSamples as Record<string, unknown>[],
      headers: Object.keys(finalState.fieldStats),
      config: { enabled: true, priority: 1 },
    };

    const result = await service.detect(null, context);

    // Enrich field stats with enum info from detection results
    for (const fieldPath of result.patterns.enumFields) {
      const stats = finalState.fieldStats[fieldPath];
      if (!stats?.uniqueSamples) continue;
      stats.isEnumCandidate = true;
      const valueCounts = new Map<unknown, number>();
      for (const sample of stats.uniqueSamples) {
        valueCounts.set(sample, (valueCounts.get(sample) ?? 0) + 1);
      }
      stats.enumValues = Array.from(valueCounts.entries()).map(([value, count]) => ({
        value,
        count,
        percent: (count / stats.occurrences) * 100,
      }));
    }

    detectedMappings = toFlatMappings(result.fieldMappings);

    // When the dataset has an explicit language that differs from the auto-detected
    // content language, fill any null fields using dataset-language-aware detection.
    // This handles mixed-language files (e.g., English content with German column names).
    const datasetLang = dataset?.language;
    if (datasetLang && datasetLang !== result.language.code) {
      const datasetLangMappings = detectFlatFieldMappings(finalState.fieldStats, datasetLang);
      for (const key of Object.keys(detectedMappings) as Array<keyof typeof detectedMappings>) {
        detectedMappings[key] ??= datasetLangMappings[key];
      }
    }

    if (result.language.isReliable) {
      detectedLanguage = result.language.code;
    }

    logger.info("Detection service completed", {
      detector: "default",
      language: result.language.code,
      languageConfidence: result.language.confidence,
      idFields: result.patterns.idFields.length,
      enumFields: result.patterns.enumFields.length,
    });
  } else {
    // Fallback: manual detection (for test environments without plugin)
    schemaBuilder.detectEnumFields();
    detectedMappings = detectFlatFieldMappings(finalState.fieldStats, dataset?.language ?? "eng");
  }

  // Save final state with enum info to database
  const updatedSchema = await schemaBuilder.getSchema();
  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
    data: { schema: updatedSchema, schemaBuilderState: finalState as unknown as Record<string, unknown> },
  });

  // Auto-detect language on dataset if not already set
  if (detectedLanguage && dataset && !dataset.language) {
    await payload.update({
      collection: COLLECTION_NAMES.DATASETS,
      id: typeof dataset.id === "string" ? dataset.id : String(dataset.id),
      data: { language: detectedLanguage },
      overrideAccess: true,
    });
  }

  // Merge detected mappings with dataset overrides
  const fieldMappings = mergeFieldMappings(detectedMappings, dataset);

  logger.info("Field mappings detected", {
    fieldMappings,
    language: detectedLanguage ?? dataset?.language ?? "eng",
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
  previousState: SchemaBuilderState | null,
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
  job: ImportJob,
  rowsProcessedSoFar: number,
  batchNumber: number,
  nonDuplicateRows: number
): Promise<void> => {
  await ProgressTrackingService.updateStageProgress(
    payload,
    job,
    PROCESSING_STAGE.DETECT_SCHEMA,
    rowsProcessedSoFar,
    nonDuplicateRows
  );

  await ProgressTrackingService.completeBatch(payload, job, PROCESSING_STAGE.DETECT_SCHEMA, batchNumber + 1);
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

      // Initialize stage with total file rows (stream iterates all rows, including duplicates)
      const totalFileRows = job.duplicates?.summary?.totalRows ?? 0;
      await ProgressTrackingService.startStage(payload, importJobId, PROCESSING_STAGE.DETECT_SCHEMA, totalFileRows);

      // Load dataset and extract active transforms
      const { dataset, transforms } = await loadDatasetAndTransforms(payload, job, logger);
      const duplicateRows = extractDuplicateRows(job);

      const BATCH_SIZE = BATCH_SIZES.SCHEMA_DETECTION;
      let batchNumber = 0;
      let totalRowsProcessed = 0;
      let lastSchemaBuilder: ProgressiveSchemaBuilder | null = null;
      // Single-job pattern always processes all rows from scratch.
      // Persisted schemaBuilderState is saved for observability but never used to seed.
      let previousState: SchemaBuilderState | null = null;

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
        await updateBatchProgress(payload, job, totalRowsProcessed, batchNumber, nonDuplicateRows.length);

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

      // Clean up sidecar CSV files on error (Excel → CSV conversions)
      try {
        const { filePath: failedFilePath, job: failedJob } = await loadJobAndFilePath(payload, importJobId);
        cleanupSidecarFiles(failedFilePath, failedJob.sheetIndex ?? 0);
      } catch {
        // Best-effort cleanup — don't mask the original error
      }

      await failImportJob(payload, importJobId, error, "schema-detection");

      throw error;
    }
  },
};
