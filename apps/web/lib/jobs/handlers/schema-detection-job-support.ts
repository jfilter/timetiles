/**
 * Shared helpers for the schema detection job handler.
 *
 * @module
 * @category Jobs/Handlers
 */

import type { Payload } from "payload";

import { BATCH_SIZES, COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { streamBatchesFromFile } from "@/lib/ingest/file-readers";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { applyTransformsBatch } from "@/lib/ingest/transforms";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { createJobLogger } from "@/lib/logger";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import type { SchemaDetectionService } from "@/lib/services/schema-detection/service";
import type { DetectionContext } from "@/lib/services/schema-detection/types";
import { createPairedDateInference } from "@/lib/services/schema-detection/utilities/date-pairs";
import { detectFlatFieldMappings, toFlatMappings } from "@/lib/services/schema-detection/utilities/flat-mappings";
import { detectIdFields } from "@/lib/services/schema-detection/utilities/geo";
import { asSystem } from "@/lib/services/system-payload";
import type { FieldStatistics, SchemaBuilderState } from "@/lib/types/schema-detection";
import type { Dataset, IngestJob } from "@/payload-types";

export type FlatFieldMappings = ReturnType<typeof detectFlatFieldMappings>;

const mergeFieldMappings = (detectedMappings: FlatFieldMappings, dataset: Dataset | null): FlatFieldMappings => {
  const pickOverride = <K extends keyof FlatFieldMappings>(key: K): FlatFieldMappings[K] =>
    dataset?.fieldMappingOverrides?.[key] ?? detectedMappings[key];

  return {
    titlePath: pickOverride("titlePath"),
    descriptionPath: pickOverride("descriptionPath"),
    locationNamePath: pickOverride("locationNamePath"),
    timestampPath: pickOverride("timestampPath"),
    endTimestampPath: pickOverride("endTimestampPath"),
    latitudePath: pickOverride("latitudePath"),
    longitudePath: pickOverride("longitudePath"),
    locationPath: pickOverride("locationPath"),
  };
};

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

interface FinalFieldDetection {
  detectedMappings: FlatFieldMappings;
  detectedLanguage: string | null;
  idFields: string[];
}

const detectFieldMappingsWithService = async (
  service: SchemaDetectionService,
  schemaBuilder: ProgressiveSchemaBuilder,
  finalState: SchemaBuilderState,
  dataset: Dataset | null,
  logger: ReturnType<typeof createJobLogger>
): Promise<FinalFieldDetection> => {
  const context: DetectionContext = {
    fieldStats: finalState.fieldStats,
    sampleData: finalState.dataSamples as Record<string, unknown>[],
    headers: Object.keys(finalState.fieldStats),
    config: { enabled: true, priority: 1 },
  };

  const result = await service.detect(null, context);

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

  schemaBuilder.detectEnumFields();

  const detectedMappings = toFlatMappings(result.fieldMappings);
  applyDatasetLanguageFallback(detectedMappings, finalState.fieldStats, result.language.code, dataset?.language);

  logger.info("Detection service completed", {
    detector: "default",
    language: result.language.code,
    languageConfidence: result.language.confidence,
    idFields: result.patterns.idFields.length,
    enumFields: result.patterns.enumFields.length,
  });

  return {
    detectedMappings,
    detectedLanguage: result.language.isReliable ? result.language.code : null,
    idFields: result.patterns.idFields,
  };
};

const detectFieldMappingsFallback = (
  schemaBuilder: ProgressiveSchemaBuilder,
  finalState: SchemaBuilderState,
  dataset: Dataset | null
): FinalFieldDetection => {
  schemaBuilder.detectEnumFields();
  return {
    detectedMappings: detectFlatFieldMappings(finalState.fieldStats, dataset?.language ?? "eng"),
    detectedLanguage: null,
    idFields: detectIdFields(finalState.fieldStats),
  };
};

const detectFinalFieldMappings = async (
  payload: Payload,
  schemaBuilder: ProgressiveSchemaBuilder,
  finalState: SchemaBuilderState,
  dataset: Dataset | null,
  logger: ReturnType<typeof createJobLogger>
): Promise<FinalFieldDetection> => {
  const schemaDetection = payload.config?.custom?.schemaDetection as { service: SchemaDetectionService } | undefined;
  const service = schemaDetection?.service;

  if (!service) {
    return detectFieldMappingsFallback(schemaBuilder, finalState, dataset);
  }

  return detectFieldMappingsWithService(service, schemaBuilder, finalState, dataset, logger);
};

const persistFinalSchemaState = async (
  payload: Payload,
  ingestJobId: number | string,
  schemaBuilder: ProgressiveSchemaBuilder,
  finalState: SchemaBuilderState
): Promise<void> => {
  const updatedSchema = await schemaBuilder.getSchema();
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: { schema: updatedSchema, schemaBuilderState: finalState as unknown as Record<string, unknown> },
  });
};

const persistDetectedLanguage = async (
  payload: Payload,
  dataset: Dataset | null,
  detectedLanguage: string | null
): Promise<void> => {
  if (!detectedLanguage || !dataset || dataset.language) return;

  await asSystem(payload).update({
    collection: COLLECTION_NAMES.DATASETS,
    id: typeof dataset.id === "string" ? dataset.id : String(dataset.id),
    data: { language: detectedLanguage },
  });
};

const buildOverridesUsed = (dataset: Dataset | null) => ({
  title: Boolean(dataset?.fieldMappingOverrides?.titlePath),
  description: Boolean(dataset?.fieldMappingOverrides?.descriptionPath),
  locationName: Boolean(dataset?.fieldMappingOverrides?.locationNamePath),
  timestamp: Boolean(dataset?.fieldMappingOverrides?.timestampPath),
  endTimestamp: Boolean(dataset?.fieldMappingOverrides?.endTimestampPath),
  latitude: Boolean(dataset?.fieldMappingOverrides?.latitudePath),
  longitude: Boolean(dataset?.fieldMappingOverrides?.longitudePath),
  location: Boolean(dataset?.fieldMappingOverrides?.locationPath),
});

const logDetectedFieldMappings = (
  logger: ReturnType<typeof createJobLogger>,
  fieldMappings: FlatFieldMappings,
  detectedLanguage: string | null,
  dataset: Dataset | null
): void => {
  logger.info("Field mappings detected", {
    fieldMappings,
    language: detectedLanguage ?? dataset?.language ?? "eng",
    overridesUsed: buildOverridesUsed(dataset),
  });
};

const applyPairedDateHeuristic = async ({
  filePath,
  sheetIndex,
  duplicateRows,
  transforms,
  fieldStats,
  fieldMappings,
  idFields,
  logger,
}: {
  filePath: string;
  sheetIndex: number | null | undefined;
  duplicateRows: Set<number>;
  transforms: IngestTransform[];
  fieldStats: Record<string, FieldStatistics>;
  fieldMappings: FlatFieldMappings;
  idFields: string[];
  logger: ReturnType<typeof createJobLogger>;
}): Promise<void> => {
  const pairedDateInference = createPairedDateInference({
    headers: Object.keys(fieldStats),
    fieldStats,
    existingMappings: { timestampPath: fieldMappings.timestampPath, endTimestampPath: fieldMappings.endTimestampPath },
    reservedPaths: [
      fieldMappings.titlePath,
      fieldMappings.descriptionPath,
      fieldMappings.locationNamePath,
      fieldMappings.latitudePath,
      fieldMappings.longitudePath,
      fieldMappings.locationPath,
    ],
    idFields,
  });

  if (!pairedDateInference.hasCandidates) return;

  let globalRowOffset = 0;

  for await (const rows of streamBatchesFromFile(filePath, {
    sheetIndex: sheetIndex ?? undefined,
    batchSize: BATCH_SIZES.SCHEMA_DETECTION,
  })) {
    const nonDuplicateRows = rows.filter((_row, index) => {
      const rowNumber = globalRowOffset + index;
      return !duplicateRows.has(rowNumber);
    });
    const transformedRows =
      transforms.length > 0 ? applyTransformsBatch(nonDuplicateRows, transforms) : nonDuplicateRows;

    pairedDateInference.processRows(transformedRows);
    globalRowOffset += rows.length;
  }

  const inferredPair = pairedDateInference.getResult();
  if (!inferredPair) return;

  fieldMappings.timestampPath ??= inferredPair.timestampPath;
  fieldMappings.endTimestampPath ??= inferredPair.endTimestampPath;

  logger.info("Applied paired date heuristic", {
    timestampPath: fieldMappings.timestampPath,
    endTimestampPath: fieldMappings.endTimestampPath,
    confidence: inferredPair.confidence,
    confidenceLevel: inferredPair.confidenceLevel,
    comparableRows: inferredPair.comparableRows,
    agreement: inferredPair.agreement,
  });
};

export const finalizeSchemaDetection = async ({
  payload,
  ingestJobId,
  schemaBuilder,
  dataset,
  filePath,
  sheetIndex,
  duplicateRows,
  transforms,
  logger,
}: {
  payload: Payload;
  ingestJobId: number | string;
  schemaBuilder: ProgressiveSchemaBuilder | null;
  dataset: Dataset | null;
  filePath: string;
  sheetIndex: number | null | undefined;
  duplicateRows: Set<number>;
  transforms: IngestTransform[];
  logger: ReturnType<typeof createJobLogger>;
}): Promise<Record<string, string | null | undefined> | null> => {
  if (!schemaBuilder) {
    return null;
  }

  const finalState = schemaBuilder.getState();
  const { detectedMappings, detectedLanguage, idFields } = await detectFinalFieldMappings(
    payload,
    schemaBuilder,
    finalState,
    dataset,
    logger
  );

  await persistFinalSchemaState(payload, ingestJobId, schemaBuilder, finalState);
  await persistDetectedLanguage(payload, dataset, detectedLanguage);

  const fieldMappings = mergeFieldMappings(detectedMappings, dataset);
  await applyPairedDateHeuristic({
    filePath,
    sheetIndex,
    duplicateRows,
    transforms,
    fieldStats: finalState.fieldStats,
    fieldMappings,
    idFields,
    logger,
  });

  logDetectedFieldMappings(logger, fieldMappings, detectedLanguage, dataset);

  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: { detectedFieldMappings: fieldMappings },
  });

  return fieldMappings;
};

const processBatchSchema = async ({
  rows,
  previousState,
  globalRowOffset,
  duplicateRows,
  transforms,
  builderConfig,
}: {
  rows: Record<string, unknown>[];
  previousState: SchemaBuilderState | null;
  globalRowOffset: number;
  duplicateRows: Set<number>;
  transforms: IngestTransform[];
  builderConfig?: Partial<{ enumThreshold: number; enumMode: "count" | "percentage" }>;
}) => {
  const nonDuplicateRows = rows.filter((_row, index) => {
    const rowNumber = globalRowOffset + index;
    return !duplicateRows.has(rowNumber);
  });
  const transformedRows = transforms.length > 0 ? applyTransformsBatch(nonDuplicateRows, transforms) : nonDuplicateRows;
  const schemaBuilder = new ProgressiveSchemaBuilder(previousState ?? undefined, builderConfig);

  if (transformedRows.length > 0) {
    schemaBuilder.processBatch(transformedRows);
  }

  const updatedSchema = await schemaBuilder.getSchema();
  return { nonDuplicateRows: transformedRows, schemaBuilder, updatedSchema };
};

const updateBatchProgress = async (
  payload: Payload,
  job: IngestJob,
  rowsProcessedSoFar: number,
  batchNumber: number
): Promise<void> => {
  await ProgressTrackingService.updateAndCompleteBatch(
    payload,
    job,
    PROCESSING_STAGE.DETECT_SCHEMA,
    rowsProcessedSoFar,
    batchNumber + 1
  );
};

const updateSchemaState = async (
  payload: Payload,
  ingestJobId: number | string,
  updatedSchema: Record<string, unknown>,
  currentState: { fieldStats?: Record<string, FieldStatistics> } | null
): Promise<void> => {
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: { schema: updatedSchema, schemaBuilderState: currentState },
  });
};

const isEmptyRow = (row: Record<string, unknown>): boolean =>
  Object.values(row).every((value) => value == null || (typeof value === "string" && value.trim() === ""));

export const runSchemaDetectionBatches = async ({
  payload,
  ingestJobId,
  job,
  filePath,
  dataset,
  duplicateRows,
  transforms,
  logger,
}: {
  payload: Payload;
  ingestJobId: number | string;
  job: IngestJob;
  filePath: string;
  dataset: Dataset | null;
  duplicateRows: Set<number>;
  transforms: IngestTransform[];
  logger: ReturnType<typeof createJobLogger>;
}): Promise<{
  batchNumber: number;
  totalRowsProcessed: number;
  lastSchemaBuilder: ProgressiveSchemaBuilder | null;
  emptyRowCount: number;
}> => {
  let batchNumber = 0;
  let totalRowsProcessed = 0;
  let lastSchemaBuilder: ProgressiveSchemaBuilder | null = null;
  let previousState: SchemaBuilderState | null = null;
  let emptyRowCount = 0;

  for await (const rows of streamBatchesFromFile(filePath, {
    sheetIndex: job.sheetIndex ?? undefined,
    batchSize: BATCH_SIZES.SCHEMA_DETECTION,
  })) {
    emptyRowCount += rows.filter(isEmptyRow).length;

    const { nonDuplicateRows, schemaBuilder, updatedSchema } = await processBatchSchema({
      rows,
      previousState,
      globalRowOffset: totalRowsProcessed,
      duplicateRows,
      transforms,
      builderConfig: {
        enumThreshold: dataset?.schemaConfig?.enumThreshold ?? undefined,
        enumMode: (dataset?.schemaConfig?.enumMode as "count" | "percentage") ?? undefined,
      },
    });

    totalRowsProcessed += rows.length;
    lastSchemaBuilder = schemaBuilder;

    logger.debug("Schema detection batch processed", {
      batchNumber,
      rowsProcessed: nonDuplicateRows.length,
      totalRows: rows.length,
    });

    await updateBatchProgress(payload, job, totalRowsProcessed, batchNumber);

    const currentState = schemaBuilder.getState();
    await updateSchemaState(payload, ingestJobId, updatedSchema, currentState);
    previousState = currentState;
    batchNumber++;
  }

  return { batchNumber, totalRowsProcessed, lastSchemaBuilder, emptyRowCount };
};

export const syncDatasetTemporalFlag = async (
  payload: Payload,
  dataset: Dataset | null,
  fieldMappings: Record<string, string | null | undefined> | null
): Promise<void> => {
  if (!dataset) return;

  const hasTimestamp = Boolean(fieldMappings?.timestampPath);
  if (dataset.hasTemporalData === hasTimestamp) return;

  await asSystem(payload).update({
    collection: COLLECTION_NAMES.DATASETS,
    id: typeof dataset.id === "string" ? dataset.id : String(dataset.id),
    data: { hasTemporalData: hasTimestamp },
  });
};
