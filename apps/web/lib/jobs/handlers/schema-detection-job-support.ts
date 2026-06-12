/**
 * Shared helpers for the schema detection job handler.
 *
 * @module
 * @category Jobs/Handlers
 */

import type { Payload } from "payload";

import { BATCH_SIZES, COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { streamBatchesFromFile } from "@/lib/ingest/file-readers";
import { interpretRows, planFromOps, readInterpretationPlan } from "@/lib/ingest/interpret";
import type { NumberColumnInput } from "@/lib/ingest/plan-builder";
import { buildDetectionPlan, planToFieldMappings } from "@/lib/ingest/plan-builder";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { createJobLogger } from "@/lib/logger";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import type { SchemaDetectionService } from "@/lib/services/schema-detection/service";
import type { DetectionContext } from "@/lib/services/schema-detection/types";
import { checkDateOrder } from "@/lib/services/schema-detection/utilities/date-order";
import { createPairedDateInference } from "@/lib/services/schema-detection/utilities/date-pairs";
import { detectFlatFieldMappings, toFlatMappings } from "@/lib/services/schema-detection/utilities/flat-mappings";
import { detectIdFields } from "@/lib/services/schema-detection/utilities/geo";
import { asSystem } from "@/lib/services/system-payload";
import type { FieldStatistics, SchemaBuilderState } from "@/lib/types/schema-detection";
import { classifyNumericFormat, decideNumberFormat } from "@/lib/utils/number-parsing";
import type { Dataset, IngestJob } from "@/payload-types";

import { backfillResolvedRolesToDataset } from "./schema-detection-role-backfill";

export type FlatFieldMappings = ReturnType<typeof detectFlatFieldMappings>;

/**
 * Override-eligible mapping keys = the flat-mapping keys. The authored dataset
 * plan, projected to the flat shape via `planToFieldMappings`, shares this key
 * set, so a single `keyof` suffices.
 */
type OverridePathKey = keyof FlatFieldMappings;

/**
 * Read the dataset's AUTHORED plan roles/policies as the flat override source.
 *
 * Replaces the former `dataset.fieldMappingOverrides` read. A confirmed order
 * (from an ambiguous review, written by the approve-route to the dataset plan)
 * wins over re-detection on resume — detection re-runs and would otherwise
 * re-derive "ambiguous", losing the chosen order.
 */
const mergeFieldMappings = (detectedMappings: FlatFieldMappings, dataset: Dataset | null): FlatFieldMappings => {
  const overrides: Partial<FlatFieldMappings> = dataset ? planToFieldMappings(readInterpretationPlan(dataset)) : {};
  const pickOverride = <K extends OverridePathKey>(key: K): FlatFieldMappings[K] =>
    overrides[key] ?? detectedMappings[key];

  return {
    titlePath: pickOverride("titlePath"),
    descriptionPath: pickOverride("descriptionPath"),
    locationNamePath: pickOverride("locationNamePath"),
    timestampPath: pickOverride("timestampPath"),
    endTimestampPath: pickOverride("endTimestampPath"),
    latitudePath: pickOverride("latitudePath"),
    longitudePath: pickOverride("longitudePath"),
    coordinatePath: pickOverride("coordinatePath"),
    locationPath: pickOverride("locationPath"),
    coordinateFormat: pickOverride("coordinateFormat") ?? null,
    timestampOrder: pickOverride("timestampOrder") ?? null,
    endTimestampOrder: pickOverride("endTimestampOrder") ?? null,
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
  // FlatFieldMappings mixes `string | null` paths with the literal-union
  // `coordinateFormat`. The per-key fill is homogeneous in practice (key and
  // value share the same shape), so treat both as a flat string record for the
  // loop rather than fighting the per-property indexed types.
  const target = detectedMappings as Record<string, string | null | undefined>;
  const fallback = fallbackMappings as Record<string, string | null | undefined>;
  for (const key of Object.keys(target)) {
    target[key] ??= fallback[key];
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

  // Enum candidacy is decided ONLY by the schema builder, whose config carries
  // the dataset's enumThreshold/enumMode. The service's pattern detection runs
  // with hardcoded defaults ({50, count}) — pre-marking candidates from it
  // silently overrode the dataset's enum configuration.
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

/** Maps the logged override flag name → the flat authored-plan key it reflects. */
const OVERRIDE_FLAG_KEYS = {
  title: "titlePath",
  description: "descriptionPath",
  locationName: "locationNamePath",
  timestamp: "timestampPath",
  endTimestamp: "endTimestampPath",
  timestampOrder: "timestampOrder",
  endTimestampOrder: "endTimestampOrder",
  latitude: "latitudePath",
  longitude: "longitudePath",
  coordinate: "coordinatePath",
  coordinateFormat: "coordinateFormat",
  location: "locationPath",
} as const;

const buildOverridesUsed = (dataset: Dataset | null): Record<keyof typeof OVERRIDE_FLAG_KEYS, boolean> => {
  const overrides = (dataset ? planToFieldMappings(readInterpretationPlan(dataset)) : {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(OVERRIDE_FLAG_KEYS).map(([flag, key]) => [flag, Boolean(overrides[key])])
  ) as Record<keyof typeof OVERRIDE_FLAG_KEYS, boolean>;
};

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

/**
 * Re-derive the day/month order for date columns the paired heuristic just filled.
 *
 * Columns discovered by the paired heuristic never passed through the primary
 * detector's `attachDateOrder` (that only runs inside `detectFieldMappings`), so
 * their order is still null. Re-derive it here for any path the heuristic filled.
 * Without this, an inferred column of all-≤12 DD/MM dates (e.g. "01/02/2024") keeps
 * `timestampOrder === null`, the ambiguous-date-order review gate (which checks for
 * `=== "ambiguous"`) never fires, and rows reach create-events with no explicit
 * order — the exact cross-row inconsistency this feature exists to prevent.
 */
const rederiveOrderForInferredDate = (
  fieldStats: Record<string, FieldStatistics>,
  path: string | null
): string | null => {
  if (!path) return null;
  return checkDateOrder(fieldStats[path]?.uniqueSamples ?? [])?.order ?? null;
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
    const transformedRows = interpretRows(nonDuplicateRows, planFromOps(transforms));

    pairedDateInference.processRows(transformedRows);
    globalRowOffset += rows.length;
  }

  const inferredPair = pairedDateInference.getResult();
  if (!inferredPair) return;

  const filledTimestamp = !fieldMappings.timestampPath && Boolean(inferredPair.timestampPath);
  const filledEndTimestamp = !fieldMappings.endTimestampPath && Boolean(inferredPair.endTimestampPath);

  fieldMappings.timestampPath ??= inferredPair.timestampPath;
  fieldMappings.endTimestampPath ??= inferredPair.endTimestampPath;

  // For any date column the heuristic just filled, re-derive its order so the
  // ambiguous-date-order review gate fires (see `rederiveOrderForInferredDate`).
  if (filledTimestamp) {
    fieldMappings.timestampOrder ??= rederiveOrderForInferredDate(fieldStats, inferredPair.timestampPath);
  }
  if (filledEndTimestamp) {
    fieldMappings.endTimestampOrder ??= rederiveOrderForInferredDate(fieldStats, inferredPair.endTimestampPath);
  }

  logger.info("Applied paired date heuristic", {
    timestampPath: fieldMappings.timestampPath,
    endTimestampPath: fieldMappings.endTimestampPath,
    confidence: inferredPair.confidence,
    confidenceLevel: inferredPair.confidenceLevel,
    comparableRows: inferredPair.comparableRows,
    agreement: inferredPair.agreement,
  });
};

/** Minimum number of numeric samples that must agree before a column is treated as numeric. */
const MIN_NUMERIC_SAMPLES = 3;

/**
 * Derive the per-column number conventions for the detection plan.
 *
 * For every analyzed field NOT already used in a date/coordinate role (those
 * keep their date/coordinate kind), decide the column's locale convention from
 * its samples via `decideNumberFormat`. A column is included only when a format
 * is decidable (non-null) AND at least {@link MIN_NUMERIC_SAMPLES} samples are
 * actually numeric — guarding against a stray one-off numeric string in an
 * otherwise textual column.
 *
 * Samples are stringified first: native-number columns (CSV parsed as JS
 * numbers) stringify to plain `"42"`/`"1.5"` → US format (`"."` decimal), which
 * is already `::numeric`-castable; locale-string columns ("1.234,56") resolve to
 * their real EU/US convention. The decided separators are what QUERY-time range
 * filtering uses to normalize each column before casting to numeric.
 */
const deriveNumberColumns = (
  fieldStats: Record<string, FieldStatistics>,
  fieldMappings: FlatFieldMappings
): NumberColumnInput[] => {
  const excluded = new Set(
    [
      fieldMappings.timestampPath,
      fieldMappings.endTimestampPath,
      fieldMappings.coordinatePath,
      fieldMappings.latitudePath,
      fieldMappings.longitudePath,
    ].filter((path): path is string => Boolean(path))
  );

  const result: NumberColumnInput[] = [];
  for (const [path, stats] of Object.entries(fieldStats)) {
    if (excluded.has(path)) continue;
    const samples = (stats?.uniqueSamples ?? []).filter((s) => s !== null && typeof s !== "object").map(String);
    if (samples.length === 0) continue;

    const format = decideNumberFormat(samples);
    if (!format) continue;

    const numericCount = samples.filter((s) => classifyNumericFormat(s) !== null).length;
    if (numericCount < MIN_NUMERIC_SAMPLES) continue;

    result.push({ field: path, format });
  }
  return result;
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

  // Persist the DETECTION-RESOLVED job plan: authored ops + merged detector roles
  // + resolved column policies. The ambiguous sentinel in the in-memory flat
  // mappings maps to policy.order=undefined + requiresChoice in the plan; the
  // flat mappings (with the sentinel) are still RETURNED for the review gates,
  // which fire before this plan is read.
  const ambiguityResolution = readInterpretationPlan(dataset ?? {})?.ambiguityResolution ?? "strict";
  const numberColumns = deriveNumberColumns(finalState.fieldStats, fieldMappings);
  const jobPlan = buildDetectionPlan(transforms, fieldMappings, ambiguityResolution, numberColumns);

  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: { interpretationPlan: jobPlan as unknown as Record<string, unknown> },
  });

  // Backfill the detection-resolved roles/policies onto the AUTHORED dataset
  // plan (auto-detected datasets only — authored intent is never clobbered) so
  // `event-detail.ts planRolesToFieldPathMappings` resolves the detected
  // title/timestamp/location columns instead of returning blank.
  await backfillResolvedRolesToDataset(payload, dataset, jobPlan);

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
  const transformedRows = interpretRows(nonDuplicateRows, planFromOps(transforms));
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

  // Only ever turn the flag ON. `hasTemporalData` reflects whether the dataset
  // has ANY temporal data, so a single sheet/import without a timestamp must
  // not clear it: sheets run in parallel (one temporal, one not) and prior
  // imports may already have contributed dates. Clearing it here would race
  // those and wrongly disable the temporal-filter/histogram UI.
  if (!hasTimestamp || dataset.hasTemporalData) return;

  await asSystem(payload).update({
    collection: COLLECTION_NAMES.DATASETS,
    id: typeof dataset.id === "string" ? dataset.id : String(dataset.id),
    data: { hasTemporalData: true },
  });
};
