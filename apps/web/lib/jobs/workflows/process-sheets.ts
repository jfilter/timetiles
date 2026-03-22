/**
 * Shared sheet-processing pipeline used by all ingest workflows.
 *
 * Runs the 6-task pipeline (analyze → detect-schema → validate → create-schema-version →
 * geocode → create-events) for each sheet in parallel via Promise.all.
 * Each sheet has its own IngestJob document, so parallel writes don't conflict.
 *
 * Between tasks, review checks can pause processing by setting the IngestJob
 * to NEEDS_REVIEW (high duplicate rate, quota exceeded, geocoding partial failure).
 *
 * @module
 * @category Jobs
 */
import type { Payload, RunTaskFunctions } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logger } from "@/lib/logger";

import type {
  AnalyzeDuplicatesOutput,
  CreateEventsOutput,
  CreateSchemaVersionOutput,
  DetectSchemaOutput,
  GeocodeBatchOutput,
  SheetInfo,
  ValidateSchemaOutput,
} from "../types/task-outputs";
import {
  checkQuotaForSheet,
  REVIEW_REASONS,
  setNeedsReview,
  shouldReviewGeocodingPartial,
  shouldReviewHighDuplicates,
} from "./review-checks";

/** Mark an IngestJob as FAILED when a task returns { success: false }. */
const markSheetFailed = async (
  payload: Payload,
  ingestJobId: string | number,
  task: string,
  reason?: string
): Promise<void> => {
  try {
    await payload.update({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      id: ingestJobId,
      data: { stage: PROCESSING_STAGE.FAILED, errorLog: { lastError: reason ?? `${task} failed`, context: task } },
    });
  } catch {
    // Best-effort
  }
};

/**
 * Run the 6-task ingest pipeline for a single sheet, with review checks
 * between stages that can pause processing.
 */
const processOneSheet = async (tasks: RunTaskFunctions, sheet: SheetInfo, payload: Payload): Promise<void> => {
  const s = sheet.index;
  const id = sheet.ingestJobId;
  const sheetCtx = { sheetIndex: s, sheetName: sheet.name, ingestJobId: id };

  logger.info(`Sheet ${s} (${sheet.name}): starting pipeline`, sheetCtx);

  const analyze = (await tasks["analyze-duplicates"](`analyze-${s}`, {
    input: { ingestJobId: id },
  })) as AnalyzeDuplicatesOutput;
  if (!analyze.success) {
    logger.info(`Sheet ${s}: analyze-duplicates failed`, { ...sheetCtx, reason: analyze.reason });
    await markSheetFailed(payload, id, "analyze-duplicates", analyze.reason);
    return;
  }

  // Review check: high duplicate rate (>80%)
  const totalRows = analyze.totalRows ?? 0;
  const uniqueRows = analyze.uniqueRows ?? 0;
  const dupCheck = shouldReviewHighDuplicates(totalRows, uniqueRows);
  if (dupCheck.needsReview) {
    logger.info(`Sheet ${s}: high duplicate rate detected, pausing for review`, {
      ...sheetCtx,
      duplicateRate: dupCheck.duplicateRate,
    });
    await setNeedsReview(payload, id, REVIEW_REASONS.HIGH_DUPLICATE_RATE, {
      totalRows,
      uniqueRows,
      duplicateRate: dupCheck.duplicateRate,
    });
    return;
  }

  // Review check: quota
  const quotaResult = await checkQuotaForSheet(payload, id, uniqueRows);
  if (!quotaResult.allowed) {
    logger.info(`Sheet ${s}: quota exceeded, pausing for review`, { ...sheetCtx, ...quotaResult });
    await setNeedsReview(payload, id, REVIEW_REASONS.QUOTA_EXCEEDED, quotaResult);
    return;
  }

  const schema = (await tasks["detect-schema"](`detect-schema-${s}`, {
    input: { ingestJobId: id },
  })) as DetectSchemaOutput;
  if (!schema.success) {
    logger.info(`Sheet ${s}: detect-schema failed`, { ...sheetCtx, reason: schema.reason });
    await markSheetFailed(payload, id, "detect-schema", schema.reason);
    return;
  }

  const validate = (await tasks["validate-schema"](`validate-${s}`, {
    input: { ingestJobId: id },
  })) as ValidateSchemaOutput;
  // validate-schema throws for failures (strict-mode, etc.) — caught by Promise.allSettled
  // Only NEEDS_REVIEW is returned as output (handler already set the stage)
  if (validate.needsReview) {
    logger.info(`Sheet ${s}: validate-schema requires review`, {
      ...sheetCtx,
      requiresApproval: validate.requiresApproval,
    });
    return;
  }

  const version = (await tasks["create-schema-version"](`create-version-${s}`, {
    input: { ingestJobId: id },
  })) as CreateSchemaVersionOutput;
  if (!version.success) {
    logger.info(`Sheet ${s}: create-schema-version failed`, { ...sheetCtx, reason: version.reason });
    await markSheetFailed(payload, id, "create-schema-version", version.reason);
    return;
  }

  const geocode = (await tasks["geocode-batch"](`geocode-${s}`, {
    input: { ingestJobId: id, batchNumber: 0 },
  })) as GeocodeBatchOutput;
  if (!geocode.success) {
    logger.info(`Sheet ${s}: geocode-batch failed`, { ...sheetCtx, reason: geocode.reason });
    await markSheetFailed(payload, id, "geocode-batch", geocode.reason);
    return;
  }

  // Review check: geocoding partial failure (>50% failed)
  const geocoded = geocode.geocoded ?? 0;
  const failed = geocode.failed ?? 0;
  const geoCheck = shouldReviewGeocodingPartial(geocoded, failed);
  if (geoCheck.needsReview) {
    logger.info(`Sheet ${s}: high geocoding failure rate, pausing for review`, {
      ...sheetCtx,
      geocoded,
      failed,
      failRate: geoCheck.failRate,
    });
    await setNeedsReview(payload, id, REVIEW_REASONS.GEOCODING_PARTIAL, {
      geocoded,
      failed,
      failRate: geoCheck.failRate,
    });
    return;
  }

  (await tasks["create-events"](`create-events-${s}`, { input: { ingestJobId: id } })) as CreateEventsOutput;

  logger.info(`Sheet ${s} (${sheet.name}): pipeline completed`, sheetCtx);
};

/**
 * Process sheets through the 6-task ingest pipeline in parallel.
 *
 * Each sheet's pipeline is sequential (analyze must complete before detect-schema),
 * but multiple sheets execute their pipelines concurrently.
 *
 * If a task returns `{ success: false }`, the remaining tasks for that sheet
 * are skipped. Other sheets continue processing independently.
 *
 * Review checks run between tasks and can pause processing:
 * - After analyze-duplicates: high duplicate rate check, quota check
 * - After geocode-batch: geocoding partial failure check
 */
export const processSheets = async (
  tasks: RunTaskFunctions,
  sheets: SheetInfo[],
  req: { payload: Payload }
): Promise<void> => {
  if (sheets.length === 0) return;

  logger.info(`Processing ${sheets.length} sheet(s) in parallel`, {
    sheetCount: sheets.length,
    sheets: sheets.map((s) => ({ index: s.index, name: s.name, ingestJobId: s.ingestJobId })),
  });

  const results = await Promise.allSettled(sheets.map((sheet) => processOneSheet(tasks, sheet, req.payload)));

  // Handle rejected promises (task threw after retries exhausted)
  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      const sheet = sheets[i];
      if (sheet) {
        logger.error(`Sheet ${i}: pipeline threw an error`, {
          error: result.reason,
          sheetIndex: i,
          ingestJobId: sheet.ingestJobId,
        });
        // Mark the IngestJob as FAILED (onFail may have already done this, but ensure it)
        await markSheetFailed(
          req.payload,
          sheet.ingestJobId,
          "pipeline-error",
          result.reason instanceof Error ? result.reason.message : String(result.reason)
        );
      }
    }
  }

  logger.info(`All ${sheets.length} sheet(s) processed`);
};
