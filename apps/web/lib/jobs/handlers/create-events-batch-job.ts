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
import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { cleanupSidecarFiles, streamBatchesFromFile } from "@/lib/import/file-readers";
import { ProgressTrackingService } from "@/lib/import/progress-tracking";
import { applyTransforms } from "@/lib/import/transforms";
import { createJobLogger, logError, logger, logPerformance } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { getImportGeocodingResults } from "@/lib/types/geocoding";
import type { ImportTransform } from "@/lib/types/import-transforms";
import { extractRelationId, requireRelationId } from "@/lib/utils/relation-id";
import { _events_v, events as eventsTable } from "@/payload-generated-schema";
import type { Dataset, ImportFile, ImportJob } from "@/payload-types";

import type { CreateEventsBatchJobInput } from "../types/job-inputs";
import type { BulkEventData } from "../utils/bulk-event-insert";
import { bulkInsertEvents } from "../utils/bulk-event-insert";
import { createEventData } from "../utils/event-creation-helpers";
import type { JobHandlerContext } from "../utils/job-context";
import { extractDuplicateRows, failImportJob, loadJobResources } from "../utils/resource-loading";
import { buildTransformsFromDataset } from "../utils/transform-builders";
import { getImportFilePath } from "../utils/upload-path";

/**
 * Updates import file status based on the status of all associated jobs.
 */

const updateImportFileStatusIfAllJobsComplete = async (
  payload: Payload,
  importFileId: string | number
): Promise<void> => {
  // Check if all import jobs for this file are completed or failed
  const pendingJobs = await payload.find({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    where: {
      importFile: { equals: importFileId },
      stage: { not_in: [PROCESSING_STAGE.COMPLETED, PROCESSING_STAGE.FAILED] },
    },
    limit: 1,
  });

  // If no pending jobs, check if any failed
  if (pendingJobs.docs.length === 0) {
    const failedJobs = await payload.find({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      where: { importFile: { equals: importFileId }, stage: { equals: PROCESSING_STAGE.FAILED } },
      limit: 1,
    });

    // Update import file status based on job outcomes
    const newStatus = failedJobs.docs.length > 0 ? "failed" : "completed";
    await payload.update({ collection: COLLECTION_NAMES.IMPORT_FILES, id: importFileId, data: { status: newStatus } });
  }
};

// Extract helper functions to reduce complexity

const getTransformPath = (t: ImportTransform): string => {
  if ("from" in t) return t.from;
  if ("fromFields" in t) return String(t.fromFields);
  return "";
};

/** For rename transforms the source key is deleted, so newValue must read
 *  from the destination path (t.to). For all other transforms the value
 *  stays at t.from. */
const getNewValuePath = (t: ImportTransform): string => {
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
  job: ImportJob;
  dataset: Dataset;
  importJobId: string | number;
  accessFields: AccessFields;
  logger: ReturnType<typeof createJobLogger>;
}

/** Apply transforms to a row and build the corresponding BulkEventData. */
const buildBulkEventFromRow = (
  row: Record<string, unknown>,
  transforms: ImportTransform[],
  ctx: ProcessBatchContext,
  geocodingResults: ReturnType<typeof getImportGeocodingResults>
): BulkEventData => {
  const { dataset, importJobId, accessFields, logger: log } = ctx;

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
    importJobId,
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
  importJobId: string | number,
  filePath: string,
  sheetIndex: number
) => {
  // Re-query job for current state (errors may have accumulated across batches)
  const currentJob = await payload.findByID({ collection: COLLECTION_NAMES.IMPORT_JOBS, id: importJobId });

  // Count actual events created for this import job (reliable source of truth)
  const eventsResult = await payload.count({
    collection: COLLECTION_NAMES.EVENTS,
    where: { importJob: { equals: importJobId } },
  });
  const totalEventsCreated = eventsResult.totalDocs;

  const duplicatesSkipped =
    (currentJob.duplicates?.summary?.internalDuplicates ?? 0) +
    (currentJob.duplicates?.summary?.externalDuplicates ?? 0);

  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
    data: {
      stage: PROCESSING_STAGE.COMPLETED,
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
    const importJob = await payload.findByID({ collection: COLLECTION_NAMES.IMPORT_JOBS, id: importJobId });

    if (importJob?.importFile) {
      const importFileId = requireRelationId(importJob.importFile, "importJob.importFile");
      const importFile = await payload.findByID({ collection: COLLECTION_NAMES.IMPORT_FILES, id: importFileId });

      if (importFile?.user) {
        const logger = createJobLogger(String(importJobId), "create-events-batch");

        const userId = extractRelationId(importFile.user);

        const quotaService = createQuotaService(payload);
        await quotaService.incrementUsage(userId, "TOTAL_EVENTS", totalEventsCreated);

        logger.info("Event creation tracked for quota", { userId, eventsCreated: totalEventsCreated, importJobId });
      }
    }
  } catch (error) {
    // Don't fail the job if quota tracking fails
    logError(error, "Failed to track event creation quota", { importJobId });
  }
};

/** Maximum number of individual errors stored on an import job. */
const MAX_STORED_ERRORS = 500;

const updateJobErrors = async (
  payload: Payload,
  importJobId: string | number,
  storedErrorCount: number,
  errors: Array<{ row: number; error: string }>
): Promise<number> => {
  if (errors.length === 0) return storedErrorCount;

  if (storedErrorCount >= MAX_STORED_ERRORS) {
    logger.debug({ importJobId, skipped: errors.length }, "Error details cap reached, skipping storage");
    return storedErrorCount;
  }

  const remaining = MAX_STORED_ERRORS - storedErrorCount;
  const errorsToStore = errors.slice(0, remaining);

  // Re-read current errors from DB to merge correctly
  const currentJob = await payload.findByID({ collection: COLLECTION_NAMES.IMPORT_JOBS, id: importJobId });
  const existingErrors = currentJob.errors ?? [];

  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
    data: { errors: [...existingErrors, ...errorsToStore] },
  });

  return storedErrorCount + errorsToStore.length;
};

const handleJobError = async (
  payload: Payload,
  importJobId: string | number,
  error: unknown,
  filePath: string,
  sheetIndex: number
) => {
  logError(error, "Event creation failed", { importJobId });

  // Clean up sidecar CSV files on error
  cleanupSidecarFiles(filePath, sheetIndex);

  await failImportJob(payload, importJobId, error, "create-events-batch");
};

const checkEventQuotaBeforeProcessing = async (
  payload: Payload,
  importFile: ImportFile,
  job: ImportJob
): Promise<void> => {
  if (!importFile?.user) {
    return;
  }

  const userId = requireRelationId(importFile.user, "importFile.user");
  const user =
    typeof importFile.user === "object" ? importFile.user : await payload.findByID({ collection: "users", id: userId });

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
  importJobId: string | number,
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
      .where(eq(eventsTable.importJob, Number(importJobId)))
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
    logger.info("Cleaned up events from prior attempt", { importJobId, deletedTotal });
  }
};

export const createEventsBatchJob = {
  slug: JOB_TYPES.CREATE_EVENTS,
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as CreateEventsBatchJobInput["input"];
    const { importJobId } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "create-events-batch");
    logger.info("Starting event creation", { importJobId });
    const startTime = Date.now();

    let filePath = "";
    let sheetIndex = 0;

    try {
      const { job, dataset, importFile } = await loadJobResources(payload, importJobId);
      filePath = getImportFilePath(importFile.filename ?? "");
      sheetIndex = job.sheetIndex ?? 0;

      // Compute denormalized access fields once (replaces per-row hook logic)
      const datasetWithCatalog = await payload.findByID({ collection: "datasets", id: dataset.id, depth: 1 });
      const accessFields = extractDenormalizedAccessFields(datasetWithCatalog);

      // Clean slate: delete events from any prior failed attempt of this job.
      await cleanupPriorAttempt(payload, importJobId, logger);

      // Start CREATE_EVENTS stage with total file rows (stream iterates all rows, including duplicates)
      const totalFileRows = job.duplicates?.summary?.totalRows ?? 0;
      await ProgressTrackingService.startStage(payload, importJobId, PROCESSING_STAGE.CREATE_EVENTS, totalFileRows);

      // Check EVENTS_PER_IMPORT quota before processing
      await checkEventQuotaBeforeProcessing(payload, importFile, job);

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
        const batchCtx: ProcessBatchContext = { payload, job, dataset, importJobId, accessFields, logger };
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
      await updateJobErrors(payload, importJobId, 0, allErrors);

      // Complete the stage
      await ProgressTrackingService.completeStage(payload, importJobId, PROCESSING_STAGE.CREATE_EVENTS);

      // Mark job completed and update import file status
      await markJobCompleted(payload, importJobId, filePath, sheetIndex);
      const importFileId = extractRelationId(job.importFile);
      await updateImportFileStatusIfAllJobsComplete(payload, importFileId!);

      logPerformance("Event creation", Date.now() - startTime, {
        importJobId,
        totalBatches: batchNumber,
        totalEventsCreated,
        totalEventsSkipped,
        totalErrors,
      });

      return {
        output: {
          totalBatches: batchNumber,
          eventsCreated: totalEventsCreated,
          eventsSkipped: totalEventsSkipped,
          errors: totalErrors,
        },
      };
    } catch (error) {
      await handleJobError(payload, importJobId, error, filePath, sheetIndex);

      try {
        const failedJob = await payload.findByID({ collection: COLLECTION_NAMES.IMPORT_JOBS, id: importJobId });
        const importFileId = requireRelationId(failedJob.importFile, "importJob.importFile");
        await updateImportFileStatusIfAllJobsComplete(payload, importFileId);
      } catch (updateError) {
        logError(updateError, "Failed to update import file status", { importJobId });
      }

      throw error;
    }
  },
};
