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

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { buildTransformsFromDataset } from "@/lib/ingest/transform-builders";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import type { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import type { Dataset, IngestJob } from "@/payload-types";

import type { SchemaDetectionJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";
import {
  cleanupSidecarsForJob,
  createStandardOnFail,
  getInternalDuplicateSkipSet,
  loadEffectiveDatasetForJob,
  loadJobAndFilePath,
  setJobStage,
} from "../utils/resource-loading";
import type { ReviewChecksConfig } from "../workflows/review-checks";
import {
  AMBIGUOUS_INTERPRETATION_CHECKS,
  parseReviewChecksConfig,
  REVIEW_REASONS,
  setNeedsReview,
  shouldReviewAmbiguousInterpretation,
  shouldReviewHighEmptyRows,
  shouldReviewNoLocation,
  shouldReviewNoTimestamp,
} from "../workflows/review-checks";
import {
  finalizeSchemaDetection,
  runSchemaDetectionBatches,
  syncDatasetTemporalFlag,
} from "./schema-detection-job-support";

// Helper to load dataset and extract active transforms
const loadDatasetAndTransforms = async (
  payload: Payload,
  job: IngestJob,
  logger: ReturnType<typeof createJobLogger>
): Promise<{ dataset: Dataset | null; transforms: IngestTransform[] }> => {
  let transforms: IngestTransform[] = [];
  let dataset: Dataset | null = null;

  try {
    dataset = await loadEffectiveDatasetForJob(payload, job);

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

/** Find the first string sample for a column (used to show the user an example value). */
const firstStringSample = (
  lastSchemaBuilder: ProgressiveSchemaBuilder | null,
  path: string,
  predicate: (s: string) => boolean = () => true
): string | undefined => {
  const sample = lastSchemaBuilder
    ?.getState()
    ?.fieldStats?.[path]?.uniqueSamples?.find((s) => typeof s === "string" && predicate(s));
  return typeof sample === "string" ? sample : undefined;
};

/**
 * Ambiguous-order gates: a column was detected but its order could not be settled
 * from the samples. Each dimension (combined-coordinate axis order, date
 * day/month order) is described by one entry in `AMBIGUOUS_INTERPRETATION_CHECKS`;
 * this loop evaluates them in that order and pauses on the first that fires —
 * asking the user rather than guessing, since a wrong guess silently corrupts
 * every affected row. Runs AFTER the no-location / no-timestamp gates (those
 * guarantee the relevant path is set). Adding a future dimension is one table row.
 */
const runAmbiguousOrderChecks = async (
  payload: Payload,
  ingestJobId: number | string,
  fieldMappings: Record<string, string | null | undefined>,
  availableColumns: string[],
  reviewChecks: ReviewChecksConfig | undefined,
  lastSchemaBuilder: ProgressiveSchemaBuilder | null
): Promise<{ needsReview: true } | null> => {
  for (const check of AMBIGUOUS_INTERPRETATION_CHECKS) {
    const path = fieldMappings[check.pathKey];
    if (!path || !shouldReviewAmbiguousInterpretation(fieldMappings, check, reviewChecks).needsReview) {
      continue;
    }

    await setNeedsReview(payload, ingestJobId, REVIEW_REASONS[check.reason], {
      detectedMappings: fieldMappings,
      availableColumns,
      // Preserve the original per-reason detail key (e.g. `coordinatePath` /
      // `timestampPath`) so review-panel consumers see the same shape.
      [check.pathKey]: path,
      sampleValue: firstStringSample(lastSchemaBuilder, path, check.samplePredicate),
      message: check.message,
    });
    return { needsReview: true };
  }

  return null;
};

/** Run post-detection review checks (empty rows, missing timestamp/location, ambiguous orders). */
const runSchemaReviewChecks = async (
  payload: Payload,
  ingestJobId: number | string,
  job: IngestJob,
  totalRowsProcessed: number,
  emptyRowCount: number,
  fieldMappings: Record<string, string | null | undefined> | null,
  lastSchemaBuilder: ProgressiveSchemaBuilder | null
): Promise<{ needsReview: true } | null> => {
  // Load per-source review check overrides from the ingest file.
  // Zod-validated; malformed configs fall back to defaults rather than
  // silently type-punning into the wrong field.
  const ingestFileId = typeof job.ingestFile === "object" ? job.ingestFile?.id : job.ingestFile;
  const ingestFile = ingestFileId
    ? await payload.findByID({ collection: COLLECTION_NAMES.INGEST_FILES, id: ingestFileId })
    : null;
  const rawReviewChecks = (ingestFile?.processingOptions as Record<string, unknown> | null)?.reviewChecks;
  const { config: reviewChecks } = parseReviewChecksConfig(rawReviewChecks, job.sheetIndex);

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

    // Ambiguous combined-coordinate axis order / date day-month order. Both run
    // after the no-location / no-timestamp gates above (which guarantee the
    // relevant path is set), and ask the user rather than guess.
    const ambiguousResult = await runAmbiguousOrderChecks(
      payload,
      ingestJobId,
      fieldMappings,
      availableColumns,
      reviewChecks,
      lastSchemaBuilder
    );
    if (ambiguousResult) return ambiguousResult;
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
  onFail: createStandardOnFail("schema-detection"),
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
      await setJobStage(payload, ingestJobId, PROCESSING_STAGE.DETECT_SCHEMA);

      // Load resources
      const { job, filePath } = await loadJobAndFilePath(payload, ingestJobId);

      // Initialize stage with total file rows (stream iterates all rows, including duplicates)
      const totalFileRows = job.duplicates?.summary?.totalRows ?? 0;
      await ProgressTrackingService.startStage(payload, ingestJobId, PROCESSING_STAGE.DETECT_SCHEMA, totalFileRows);

      // Load dataset and extract active transforms
      const { dataset, transforms } = await loadDatasetAndTransforms(payload, job, logger);
      // Schema detection should only skip *internal* duplicates (same row appearing
      // multiple times within the same file would otherwise double-count samples).
      // External duplicates — rows already present in the dataset — carry the same
      // schema as the existing data, and the downstream create-events stage is what
      // applies the skip/update strategy. Skipping externals here meant that a
      // scheduled re-import of an unchanged URL saw all rows as external dupes,
      // produced zero samples, and then failed validation with every field marked
      // "removed" under additive schema mode.
      const duplicateRows = getInternalDuplicateSkipSet(job);
      const { batchNumber, totalRowsProcessed, lastSchemaBuilder, emptyRowCount } = await runSchemaDetectionBatches({
        payload,
        ingestJobId,
        job,
        filePath,
        dataset,
        duplicateRows,
        transforms,
        logger,
      });

      // Complete stage and finalize
      await ProgressTrackingService.completeStage(payload, ingestJobId, PROCESSING_STAGE.DETECT_SCHEMA);
      const fieldMappings = await finalizeSchemaDetection({
        payload,
        ingestJobId,
        schemaBuilder: lastSchemaBuilder,
        dataset,
        filePath,
        sheetIndex: job.sheetIndex,
        duplicateRows,
        transforms,
        logger,
      });

      await syncDatasetTemporalFlag(payload, dataset, fieldMappings);

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
      await cleanupSidecarsForJob(payload, ingestJobId);

      // Re-throw — Payload retries up to `retries` count, then onFail handles failure
      throw error;
    }
  },
};
