/**
 * Shared sheet-processing pipeline used by all ingest workflows.
 *
 * Runs the 6-task pipeline (analyze -> detect-schema -> validate -> create-schema-version ->
 * geocode -> create-events) for each sheet in parallel via Promise.allSettled.
 *
 * Error model:
 * - Tasks throw on failure -> caught by per-sheet try/catch -> markSheetFailed marks FAILED
 * - Tasks return output on success -> pipeline continues
 * - Tasks return { needsReview: true } -> pipeline pauses for human review
 *
 * Review checks (duplicates, quota, geocoding) are performed inside the task handlers
 * themselves. This module only inspects the `needsReview` flag on task outputs.
 *
 * IMPORTANT: onFail callbacks on task definitions do NOT fire inside workflow handlers
 * when using Promise.allSettled, because Promise.allSettled catches the TaskError before
 * it reaches Payload's top-level error handler. The per-sheet try/catch + markSheetFailed
 * is the correct mechanism for marking failures within workflows.
 *
 * @module
 * @category Jobs
 */
import type { Payload, RunTaskFunctions } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logError, logger } from "@/lib/logger";

import type {
  AnalyzeDuplicatesOutput,
  CreateEventsOutput,
  DetectSchemaOutput,
  GeocodeBatchOutput,
  SheetInfo,
  ValidateSchemaOutput,
} from "../types/task-outputs";

/**
 * Mark an IngestJob as FAILED with error details.
 * This is the primary failure mechanism inside workflow handlers.
 */
const markSheetFailed = async (
  payload: Payload,
  ingestJobId: string | number,
  context: string,
  error: unknown
): Promise<void> => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await payload.update({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      id: ingestJobId,
      data: {
        stage: PROCESSING_STAGE.FAILED,
        errorLog: { lastError: message, context, timestamp: new Date().toISOString() },
      },
    });
    logger.info(`Sheet marked as FAILED`, { ingestJobId, context, error: message });
  } catch {
    // Best-effort — don't mask the original error
  }
};

/**
 * Run the 6-task ingest pipeline for a single sheet.
 * Review checks are handled inside task handlers; this function only
 * inspects the `needsReview` flag on task outputs to pause processing.
 *
 * Throws on error — caught by the caller (processSheets) which marks the sheet FAILED.
 */
const processOneSheet = async (tasks: RunTaskFunctions, sheet: SheetInfo): Promise<void> => {
  const s = sheet.index;
  const id = sheet.ingestJobId;
  const sheetCtx = { sheetIndex: s, sheetName: sheet.name, ingestJobId: id };

  logger.info(`Sheet ${s} (${sheet.name}): starting pipeline`, sheetCtx);

  // Step 1: Analyze duplicates
  const analyze = (await tasks["analyze-duplicates"](`analyze-${s}`, {
    input: { ingestJobId: id },
  })) as AnalyzeDuplicatesOutput;

  if (analyze.needsReview) {
    logger.info(`Sheet ${s}: needs review after analyze`, sheetCtx);
    return;
  }

  // Step 2: Detect schema
  const detect = (await tasks["detect-schema"](`detect-schema-${s}`, {
    input: { ingestJobId: id },
  })) as DetectSchemaOutput;
  if (detect.needsReview) {
    logger.info(`Sheet ${s}: needs review after detect-schema`, sheetCtx);
    return;
  }

  // Step 3: Validate schema
  const validate = (await tasks["validate-schema"](`validate-${s}`, {
    input: { ingestJobId: id },
  })) as ValidateSchemaOutput;
  if (validate.needsReview) {
    logger.info(`Sheet ${s}: needs review after validate`, {
      ...sheetCtx,
      requiresApproval: validate.requiresApproval,
    });
    return;
  }

  // Step 4: Create schema version
  await tasks["create-schema-version"](`create-version-${s}`, { input: { ingestJobId: id } });

  // Step 5: Geocode
  const geocode = (await tasks["geocode-batch"](`geocode-${s}`, {
    input: { ingestJobId: id, batchNumber: 0 },
  })) as GeocodeBatchOutput;

  if (geocode.needsReview) {
    logger.info(`Sheet ${s}: needs review after geocode`, sheetCtx);
    return;
  }

  // Step 6: Create events
  const events = (await tasks["create-events"](`create-events-${s}`, {
    input: { ingestJobId: id },
  })) as CreateEventsOutput;
  if (events.needsReview) {
    logger.info(`Sheet ${s}: needs review after create-events`, sheetCtx);
    return;
  }

  logger.info(`Sheet ${s} (${sheet.name}): pipeline completed`, sheetCtx);
};

/**
 * Process sheets through the 6-task ingest pipeline in parallel.
 *
 * Each sheet runs in its own try/catch — if a task throws, that sheet is marked
 * FAILED and other sheets continue independently.
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

  await Promise.allSettled(
    sheets.map(async (sheet) => {
      try {
        await processOneSheet(tasks, sheet);
      } catch (error) {
        logError(error, `Sheet ${sheet.index} (${sheet.name}): pipeline failed`, { ingestJobId: sheet.ingestJobId });
        await markSheetFailed(req.payload, sheet.ingestJobId, "pipeline", error);
      }
    })
  );

  logger.info(`All ${sheets.length} sheet(s) processed`);
};
