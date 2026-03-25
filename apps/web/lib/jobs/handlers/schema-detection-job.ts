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

import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { cleanupSidecarFiles, streamBatchesFromFile } from "@/lib/ingest/file-readers";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { applyTransformsBatch } from "@/lib/ingest/transforms";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import type { SchemaDetectionService } from "@/lib/services/schema-detection/service";
import type { DetectionContext } from "@/lib/services/schema-detection/types";
import { detectFlatFieldMappings, toFlatMappings } from "@/lib/services/schema-detection/utilities/flat-mappings";
import type { IngestTransform } from "@/lib/types/ingest-transforms";
import type { FieldStatistics, SchemaBuilderState } from "@/lib/types/schema-detection";
import type { Dataset, IngestJob } from "@/payload-types";

import type { SchemaDetectionJobInput } from "../types/job-inputs";
import type { JobHandlerContext, TaskCallbackArgs } from "../utils/job-context";
import { extractDuplicateRows, loadJobAndFilePath } from "../utils/resource-loading";
import { buildTransformsFromDataset } from "../utils/transform-builders";
import type { ReviewChecksConfig } from "../workflows/review-checks";
import {
  REVIEW_REASONS,
  setNeedsReview,
  shouldReviewHighEmptyRows,
  shouldReviewNoLocation,
  shouldReviewNoTimestamp,
} from "../workflows/review-checks";

// Helper to load dataset and extract active transforms
const loadDatasetAndTransforms = async (
  payload: Payload,
  job: IngestJob,
  logger: ReturnType<typeof createJobLogger>
): Promise<{ dataset: Dataset | null; transforms: IngestTransform[] }> => {
  let transforms: IngestTransform[] = [];
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
    endTimestampPath: string | null;
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
  endTimestampPath: dataset?.fieldMappingOverrides?.endTimestampPath ?? detectedMappings.endTimestampPath,
  latitudePath: dataset?.fieldMappingOverrides?.latitudePath ?? detectedMappings.latitudePath,
  longitudePath: dataset?.fieldMappingOverrides?.longitudePath ?? detectedMappings.longitudePath,
  locationPath: dataset?.fieldMappingOverrides?.locationPath ?? detectedMappings.locationPath,
});

/**
 * Fill null field mappings using the dataset's explicit language.
 * Handles mixed-language files (e.g., English content with German column names).
 */
const applyDatasetLanguageFallback = (
  detectedMappings: ReturnType<typeof toFlatMappings>,
  fieldStats: Record<string, unknown>,
  detectedLang: string,
  datasetLang: string | null | undefined
): void => {
  if (!datasetLang || datasetLang === detectedLang) return;
  const fallbackMappings = detectFlatFieldMappings(
    fieldStats as Parameters<typeof detectFlatFieldMappings>[0],
    datasetLang
  );
  for (const key of Object.keys(detectedMappings) as Array<keyof typeof detectedMappings>) {
    detectedMappings[key] ??= fallbackMappings[key];
  }
};

// Helper to finalize schema detection using the pluggable SchemaDetectionService
const finalizeSchemaDetection = async (
  payload: Payload,
  ingestJobId: number | string,
  schemaBuilder: ProgressiveSchemaBuilder | null,
  dataset: Dataset | null,
  logger: ReturnType<typeof createJobLogger>
): Promise<Record<string, string | null | undefined> | null> => {
  if (!schemaBuilder) {
    return null;
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

    // Fill unmapped fields using the dataset's explicit language (for mixed-language files)
    applyDatasetLanguageFallback(detectedMappings, finalState.fieldStats, result.language.code, dataset?.language);

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
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
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
      endTimestamp: Boolean(dataset?.fieldMappingOverrides?.endTimestampPath),
      latitude: Boolean(dataset?.fieldMappingOverrides?.latitudePath),
      longitude: Boolean(dataset?.fieldMappingOverrides?.longitudePath),
      location: Boolean(dataset?.fieldMappingOverrides?.locationPath),
    },
  });

  // Store field mappings (workflow controls stage transition)
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: { detectedFieldMappings: fieldMappings },
  });

  return fieldMappings;
};

// Helper to process batch and update schema
const processBatchSchema = async (
  rows: Record<string, unknown>[],
  previousState: SchemaBuilderState | null,
  globalRowOffset: number,
  duplicateRows: Set<number>,
  transforms: IngestTransform[]
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
  job: IngestJob,
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
  ingestJobId: number | string,
  updatedSchema: Record<string, unknown>,
  currentState: { fieldStats?: Record<string, FieldStatistics> } | null
): Promise<void> => {
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: { schema: updatedSchema, schemaBuilderState: currentState as unknown as Record<string, unknown> },
  });
};

/** Run post-detection review checks (empty rows, missing timestamp/location). */
const runSchemaReviewChecks = async (
  payload: Payload,
  ingestJobId: number | string,
  job: IngestJob,
  totalRowsProcessed: number,
  emptyRowCount: number,
  fieldMappings: Record<string, string | null | undefined> | null,
  lastSchemaBuilder: ProgressiveSchemaBuilder | null
): Promise<{ needsReview: true } | null> => {
  // Load per-source review check overrides from the ingest file
  const ingestFileId = typeof job.ingestFile === "object" ? job.ingestFile?.id : job.ingestFile;
  const ingestFile = ingestFileId
    ? await payload.findByID({ collection: COLLECTION_NAMES.INGEST_FILES, id: ingestFileId })
    : null;
  const reviewChecks = (ingestFile?.processingOptions as Record<string, unknown> | null)?.reviewChecks as
    | ReviewChecksConfig
    | undefined;

  // Review check: high empty row rate
  const emptyCheck = shouldReviewHighEmptyRows(totalRowsProcessed, emptyRowCount, reviewChecks);
  if (emptyCheck.needsReview) {
    await setNeedsReview(payload, ingestJobId, REVIEW_REASONS.HIGH_EMPTY_ROW_RATE, {
      totalRows: totalRowsProcessed,
      emptyRows: emptyRowCount,
      emptyRate: emptyCheck.emptyRate,
    });
    return { needsReview: true };
  }

  // Review check: no timestamp / no location field detected
  if (fieldMappings) {
    const availableColumns = lastSchemaBuilder?.getState()?.fieldStats
      ? Object.keys(lastSchemaBuilder.getState().fieldStats)
      : Object.keys(fieldMappings);

    const timestampCheck = shouldReviewNoTimestamp(fieldMappings, reviewChecks);
    if (timestampCheck.needsReview) {
      await setNeedsReview(payload, ingestJobId, REVIEW_REASONS.NO_TIMESTAMP_DETECTED, {
        detectedMappings: fieldMappings,
        availableColumns,
        message: "No date or time column was detected in your data.",
      });
      return { needsReview: true };
    }

    const locationCheck = shouldReviewNoLocation(fieldMappings, reviewChecks);
    if (locationCheck.needsReview) {
      await setNeedsReview(payload, ingestJobId, REVIEW_REASONS.NO_LOCATION_DETECTED, {
        detectedMappings: fieldMappings,
        availableColumns,
        message: "No location, address, or coordinate columns were detected in your data.",
      });
      return { needsReview: true };
    }
  }

  return null;
};

export const schemaDetectionJob = {
  slug: JOB_TYPES.DETECT_SCHEMA,
  retries: 1,
  outputSchema: [
    { name: "fieldCount", type: "number" as const },
    { name: "totalRowsProcessed", type: "number" as const },
    { name: "needsReview", type: "checkbox" as const },
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
            context: "schema-detection",
          },
        },
      });
    } catch {
      // Best-effort — don't throw in onFail
    }
  },
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as SchemaDetectionJobInput["input"];
    const { ingestJobId } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "schema-detection");
    logger.info("Starting schema detection", { ingestJobId });
    const startTime = Date.now();

    try {
      // Set stage for UI progress display (workflow controls sequencing)
      await payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: { stage: PROCESSING_STAGE.DETECT_SCHEMA },
      });

      // Load resources
      const { job, filePath } = await loadJobAndFilePath(payload, ingestJobId);

      // Initialize stage with total file rows (stream iterates all rows, including duplicates)
      const totalFileRows = job.duplicates?.summary?.totalRows ?? 0;
      await ProgressTrackingService.startStage(payload, ingestJobId, PROCESSING_STAGE.DETECT_SCHEMA, totalFileRows);

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
      let emptyRowCount = 0;

      for await (const rows of streamBatchesFromFile(filePath, {
        sheetIndex: job.sheetIndex ?? undefined,
        batchSize: BATCH_SIZE,
      })) {
        // Count empty rows (all values null/blank) before processing
        for (const row of rows) {
          if (Object.values(row).every((v) => v == null || (typeof v === "string" && v.trim() === ""))) {
            emptyRowCount++;
          }
        }

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
        await updateSchemaState(payload, ingestJobId, updatedSchema, currentState);
        previousState = currentState;

        batchNumber++;
      }

      // Complete stage and finalize
      await ProgressTrackingService.completeStage(payload, ingestJobId, PROCESSING_STAGE.DETECT_SCHEMA);
      const fieldMappings = await finalizeSchemaDetection(payload, ingestJobId, lastSchemaBuilder, dataset, logger);

      logPerformance("Schema detection", Date.now() - startTime, {
        ingestJobId,
        totalBatches: batchNumber,
        totalRowsProcessed,
      });

      // Run post-detection review checks
      const reviewResult = await runSchemaReviewChecks(
        payload,
        ingestJobId,
        job,
        totalRowsProcessed,
        emptyRowCount,
        fieldMappings,
        lastSchemaBuilder
      );
      if (reviewResult) {
        return { output: { needsReview: true, totalBatches: batchNumber, totalRowsProcessed } };
      }

      return { output: { totalBatches: batchNumber, totalRowsProcessed } };
    } catch (error) {
      logError(error, "Schema detection failed", { ingestJobId });

      // Clean up sidecar CSV files on error (Excel → CSV conversions)
      try {
        const { filePath: failedFilePath, job: failedJob } = await loadJobAndFilePath(payload, ingestJobId);
        cleanupSidecarFiles(failedFilePath, failedJob.sheetIndex ?? 0);
      } catch {
        // Best-effort cleanup — don't mask the original error
      }

      // Re-throw — Payload retries up to `retries` count, then onFail handles failure
      throw error;
    }
  },
};
