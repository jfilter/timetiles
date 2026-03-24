/**
 * Defines the job handler for creating events from imported data.
 *
 * This single job streams all batches from an import file. For each row, it performs the following:
 * - Skips rows that have been identified as duplicates in the `analyze-duplicates-job`.
 * - Generates a unique ID for the event.
 * - Associates any available geocoding results with the event.
 * - Creates a new document in the `events` collection.
 *
 * The job updates the import job's progress and handles errors for individual rows.
 * Once all batches are processed, it marks the import job as `COMPLETED`.
 *
 * @module
 * @category Jobs
 */
import { eq, inArray } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import { extractDenormalizedAccessFields } from "@/lib/collections/catalog-ownership";
import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { cleanupSidecarFiles, streamBatchesFromFile } from "@/lib/ingest/file-readers";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { applyTransforms } from "@/lib/ingest/transforms";
import { createJobLogger, logError, logger, logPerformance } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { getImportGeocodingResults } from "@/lib/types/geocoding";
import type { IngestTransform } from "@/lib/types/ingest-transforms";
import { extractRelationId, requireRelationId } from "@/lib/utils/relation-id";
import { _events_v, events as eventsTable } from "@/payload-generated-schema";
import type { Dataset, IngestFile, IngestJob } from "@/payload-types";

import type { CreateEventsBatchJobInput } from "../types/job-inputs";
import type { BulkEventData } from "../utils/bulk-event-insert";
import { bulkInsertEvents } from "../utils/bulk-event-insert";
import { createEventData } from "../utils/event-creation-helpers";
import type { JobHandlerContext, TaskCallbackArgs } from "../utils/job-context";
import { extractDuplicateRows, loadJobResources } from "../utils/resource-loading";
import { buildTransformsFromDataset } from "../utils/transform-builders";
import { getIngestFilePath } from "../utils/upload-path";

// Extract helper functions to reduce complexity

const getTransformPath = (t: IngestTransform): string => {
  if ("from" in t) return t.from;
  if ("fromFields" in t) return String(t.fromFields);
  return "";
};

/** For rename transforms the source key is deleted, so newValue must read
 *  from the destination path (t.to). For all other transforms the value
 *  stays at t.from. */
const getNewValuePath = (t: IngestTransform): string => {
  if (t.type === "rename" && "to" in t) return t.to;
  if ("from" in t) return t.from;
  if ("fromFields" in t) return String(t.fromFields);
  return "";
};

/** Denormalized access fields computed once per job. */
interface AccessFields {
  datasetIsPublic: boolean;
  catalogOwnerId: number | undefined;
}

interface ProcessBatchContext {
  payload: Payload;
  job: IngestJob;
  dataset: Dataset;
  ingestJobId: string | number;
  accessFields: AccessFields;
  logger: ReturnType<typeof createJobLogger>;
}

/** Apply transforms to a row and build the corresponding BulkEventData. */
const buildBulkEventFromRow = (
  row: Record<string, unknown>,
  transforms: IngestTransform[],
  ctx: ProcessBatchContext,
  geocodingResults: ReturnType<typeof getImportGeocodingResults>
): BulkEventData => {
  const { dataset, ingestJobId, accessFields, logger: log } = ctx;

  const transformedRow = transforms.length > 0 ? applyTransforms(row, transforms) : row;

  const transformationChanges =
    transforms.length > 0
      ? transforms.map((t) => ({
          path: getTransformPath(t),
          oldValue: "from" in t ? (row[t.from] ?? null) : (null as unknown),
          newValue: (transformedRow[getNewValuePath(t)] ?? null) as unknown,
        }))
      : null;

  if (transformationChanges) {
    log.debug("Applied transforms", { transformCount: transforms.length });
  }

  const eventData = createEventData(
    transformedRow,
    dataset,
    ingestJobId,
    ctx.job,
    geocodingResults,
    transformationChanges
  );

  return { ...eventData, datasetIsPublic: accessFields.datasetIsPublic, catalogOwnerId: accessFields.catalogOwnerId };
};

const processEventBatch = async (
  ctx: ProcessBatchContext,
  rows: Record<string, unknown>[],
  globalRowOffset: number
) => {
  const { payload, job, dataset, logger: log } = ctx;
  const duplicateRows = extractDuplicateRows(job);
  const geocodingResults = getImportGeocodingResults(job);
  const transforms = buildTransformsFromDataset(dataset);

  let eventsSkipped = 0;
  const eventsToInsert: BulkEventData[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = globalRowOffset + index;

    if (duplicateRows.has(rowNumber)) {
      eventsSkipped++;
      continue;
    }

    try {
      eventsToInsert.push(buildBulkEventFromRow(row, transforms, ctx, geocodingResults));
    } catch (error) {
      log.warn("Failed to create event data", { rowNumber, error });
      errors.push({ row: rowNumber, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  // Bulk insert all collected events in one operation
  let eventsCreated = 0;
  if (eventsToInsert.length > 0) {
    try {
      eventsCreated = await bulkInsertEvents(payload, eventsToInsert);
    } catch (error) {
      log.error("Bulk insert failed for batch", { globalRowOffset, count: eventsToInsert.length, error });
      const msg = error instanceof Error ? error.message : "Bulk insert failed";
      for (let i = 0; i < eventsToInsert.length; i++) {
        errors.push({ row: globalRowOffset + i, error: msg });
      }
    }
  }

  return { eventsCreated, eventsSkipped, errors };
};

const markJobCompleted = async (
  payload: Payload,
  ingestJobId: string | number,
  filePath: string,
  sheetIndex: number
) => {
  // Re-query job for current state (errors may have accumulated across batches)
  const currentJob = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });

  // Count actual events created for this import job (reliable source of truth)
  const eventsResult = await payload.count({
    collection: COLLECTION_NAMES.EVENTS,
    where: { ingestJob: { equals: ingestJobId } },
  });
  const totalEventsCreated = eventsResult.totalDocs;

  const duplicatesSkipped =
    (currentJob.duplicates?.summary?.internalDuplicates ?? 0) +
    (currentJob.duplicates?.summary?.externalDuplicates ?? 0);

  // Store results and mark job as COMPLETED
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: {
      results: {
        totalEvents: totalEventsCreated,
        duplicatesSkipped,
        geocoded: Object.keys(getImportGeocodingResults(currentJob)).length,
        errors: currentJob.errors?.length ?? 0,
      },
    },
  });

  // Clean up sidecar CSV files
  cleanupSidecarFiles(filePath, sheetIndex);

  // Track total events created for the user's quota
  try {
    const ingestJob = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });

    if (ingestJob?.ingestFile) {
      const ingestFileId = requireRelationId(ingestJob.ingestFile, "ingestJob.ingestFile");
      const ingestFile = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_FILES, id: ingestFileId });

      if (ingestFile?.user) {
        const logger = createJobLogger(String(ingestJobId), "create-events-batch");

        const userId = extractRelationId(ingestFile.user);

        const quotaService = createQuotaService(payload);
        await quotaService.incrementUsage(userId, "TOTAL_EVENTS", totalEventsCreated);

        logger.info("Event creation tracked for quota", { userId, eventsCreated: totalEventsCreated, ingestJobId });
      }
    }
  } catch (error) {
    // Don't fail the job if quota tracking fails
    logError(error, "Failed to track event creation quota", { ingestJobId });
  }
};

/** Maximum number of individual errors stored on an import job. */
const MAX_STORED_ERRORS = 500;

const updateJobErrors = async (
  payload: Payload,
  ingestJobId: string | number,
  storedErrorCount: number,
  errors: Array<{ row: number; error: string }>
): Promise<number> => {
  if (errors.length === 0) return storedErrorCount;

  if (storedErrorCount >= MAX_STORED_ERRORS) {
    logger.debug({ ingestJobId, skipped: errors.length }, "Error details cap reached, skipping storage");
    return storedErrorCount;
  }

  const remaining = MAX_STORED_ERRORS - storedErrorCount;
  const errorsToStore = errors.slice(0, remaining);

  // Re-read current errors from DB to merge correctly
  const currentJob = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });
  const existingErrors = currentJob.errors ?? [];

  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: { errors: [...existingErrors, ...errorsToStore] },
  });

  return storedErrorCount + errorsToStore.length;
};

const cleanupOnError = (filePath: string, sheetIndex: number) => {
  // Clean up sidecar CSV files on error
  cleanupSidecarFiles(filePath, sheetIndex);
};

const checkEventQuotaBeforeProcessing = async (
  payload: Payload,
  ingestFile: IngestFile,
  job: IngestJob
): Promise<void> => {
  if (!ingestFile?.user) {
    return;
  }

  const userId = requireRelationId(ingestFile.user, "ingestFile.user");
  const user =
    typeof ingestFile.user === "object" ? ingestFile.user : await payload.findByID({ collection: "users", id: userId });

  if (!user) {
    return;
  }

  const quotaService = createQuotaService(payload);

  // Use uniqueRows from deduplication summary — this is the actual number of events
  // that will be created, not the total file rows (which includes duplicates).
  const uniqueRows = job.duplicates?.summary?.uniqueRows ?? 0;

  // Check if this import would exceed the per-import limit
  const quotaCheck = await quotaService.checkQuota(user, "EVENTS_PER_IMPORT", uniqueRows);

  if (!quotaCheck.allowed) {
    throw new Error(
      `Import exceeds maximum events per import (${uniqueRows} > ${quotaCheck.limit}). ` +
        `Please split your data into smaller files.`
    );
  }
};

/** Delete events and their versions left by a prior failed attempt, in small chunks to avoid table locks. */
const cleanupPriorAttempt = async (
  payload: Payload,
  ingestJobId: string | number,
  logger: ReturnType<typeof createJobLogger>
): Promise<void> => {
  const DELETE_CHUNK_SIZE = 5000;
  const db = payload.db.drizzle;

  // Gather IDs of events to delete, then remove versions + events in chunks
  let deletedTotal = 0;
  let idsToDelete: number[];
  do {
    const rows = await db
      .select({ id: eventsTable.id })
      .from(eventsTable)
      .where(eq(eventsTable.ingestJob, Number(ingestJobId)))
      .limit(DELETE_CHUNK_SIZE);
    idsToDelete = rows.map((r) => r.id);

    if (idsToDelete.length > 0) {
      // Delete versions first (FK references events.id)
      await db.delete(_events_v).where(inArray(_events_v.parent, idsToDelete));
      // Then events
      await db.delete(eventsTable).where(inArray(eventsTable.id, idsToDelete));
      deletedTotal += idsToDelete.length;
    }
  } while (idsToDelete.length >= DELETE_CHUNK_SIZE);

  if (deletedTotal > 0) {
    logger.info("Cleaned up events from prior attempt", { ingestJobId, deletedTotal });
  }
};

export const createEventsBatchJob = {
  slug: JOB_TYPES.CREATE_EVENTS,
  retries: 1,
  outputSchema: [
    { name: "eventCount", type: "number" as const },
    { name: "duplicatesSkipped", type: "number" as const },
    { name: "reason", type: "text" as const },
  ],
  onFail: async (args: TaskCallbackArgs) => {
    const ingestJobId = (args.input as Record<string, unknown> | undefined)?.ingestJobId;
    if (typeof ingestJobId !== "string" && typeof ingestJobId !== "number") return;
    // Clean up orphaned events from successful batches before the failure.
    // Wrapped separately so cleanup failure doesn't prevent status update.
    const failLogger = createJobLogger(String(ingestJobId), "create-events-batch-onFail");
    try {
      await cleanupPriorAttempt(args.req.payload, ingestJobId, failLogger);
    } catch {
      // Best-effort cleanup — log handled inside cleanupPriorAttempt
    }

    try {
      await args.req.payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errorLog: {
            lastError: typeof args.job.error === "string" ? args.job.error : "Task failed after all retries",
            context: "create-events-batch",
          },
        },
      });
    } catch {
      // Best-effort — don't throw in onFail
    }
  },
  onSuccess: async (args: TaskCallbackArgs) => {
    const ingestJobId = (args.input as Record<string, unknown> | undefined)?.ingestJobId;
    if (typeof ingestJobId !== "string" && typeof ingestJobId !== "number") return;
    try {
      await args.req.payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: { stage: PROCESSING_STAGE.COMPLETED },
      });
    } catch {
      // Best-effort — don't throw in onSuccess
    }
  },
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as CreateEventsBatchJobInput["input"];
    const { ingestJobId } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "create-events-batch");
    logger.info("Starting event creation", { ingestJobId });
    const startTime = Date.now();

    let filePath = "";
    let sheetIndex = 0;

    try {
      // Set stage for UI progress tracking (workflow controls sequencing)
      await payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: { stage: PROCESSING_STAGE.CREATE_EVENTS },
      });

      const { job, dataset, ingestFile } = await loadJobResources(payload, ingestJobId);
      filePath = getIngestFilePath(ingestFile.filename ?? "");
      sheetIndex = job.sheetIndex ?? 0;

      // Compute denormalized access fields once (replaces per-row hook logic)
      const datasetWithCatalog = await payload.findByID({ collection: "datasets", id: dataset.id, depth: 1 });
      const accessFields = extractDenormalizedAccessFields(datasetWithCatalog);

      // Clean slate: delete events from any prior failed attempt of this job.
      await cleanupPriorAttempt(payload, ingestJobId, logger);

      // Start CREATE_EVENTS stage with total file rows (stream iterates all rows, including duplicates)
      const totalFileRows = job.duplicates?.summary?.totalRows ?? 0;
      await ProgressTrackingService.startStage(payload, ingestJobId, PROCESSING_STAGE.CREATE_EVENTS, totalFileRows);

      // Check EVENTS_PER_IMPORT quota before processing
      await checkEventQuotaBeforeProcessing(payload, ingestFile, job);

      const BATCH_SIZE = BATCH_SIZES.EVENT_CREATION;
      /** Write progress to DB every N batches instead of every batch. */
      const PROGRESS_WRITE_INTERVAL = 10;

      let batchNumber = 0;
      let totalRowsProcessed = 0;
      let totalEventsCreated = 0;
      let totalEventsSkipped = 0;
      let totalErrors = 0;
      const allErrors: Array<{ row: number; error: string }> = [];

      for await (const rows of streamBatchesFromFile(filePath, {
        sheetIndex: job.sheetIndex ?? undefined,
        batchSize: BATCH_SIZE,
      })) {
        const batchCtx: ProcessBatchContext = { payload, job, dataset, ingestJobId, accessFields, logger };
        const { eventsCreated, eventsSkipped, errors } = await processEventBatch(batchCtx, rows, totalRowsProcessed);

        totalRowsProcessed += rows.length;
        totalEventsCreated += eventsCreated;
        totalEventsSkipped += eventsSkipped;
        totalErrors += errors.length;
        if (errors.length > 0) {
          allErrors.push(...errors);
        }

        batchNumber++;

        // Throttle progress DB writes: only every N batches
        if (batchNumber % PROGRESS_WRITE_INTERVAL === 0) {
          await ProgressTrackingService.updateAndCompleteBatch(
            payload,
            job,
            PROCESSING_STAGE.CREATE_EVENTS,
            totalRowsProcessed,
            batchNumber
          );
        }
      }

      // Final progress write for any remaining batches since the last interval
      if (batchNumber % PROGRESS_WRITE_INTERVAL !== 0) {
        await ProgressTrackingService.updateAndCompleteBatch(
          payload,
          job,
          PROCESSING_STAGE.CREATE_EVENTS,
          totalRowsProcessed,
          batchNumber
        );
      }

      // Write all accumulated errors in a single DB operation
      await updateJobErrors(payload, ingestJobId, 0, allErrors);

      // Complete the stage
      await ProgressTrackingService.completeStage(payload, ingestJobId, PROCESSING_STAGE.CREATE_EVENTS);

      // Mark job completed
      await markJobCompleted(payload, ingestJobId, filePath, sheetIndex);

      logPerformance("Event creation", Date.now() - startTime, {
        ingestJobId,
        totalBatches: batchNumber,
        totalEventsCreated,
        totalEventsSkipped,
        totalErrors,
      });

      return { output: { eventCount: totalEventsCreated, duplicatesSkipped: totalEventsSkipped } };
    } catch (error) {
      logError(error, "Event creation failed", { ingestJobId });
      cleanupOnError(filePath, sheetIndex);

      // Re-throw — Payload retries up to `retries` count, then onFail handles failure
      throw error;
    }
  },
};
