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
import type { Payload } from "payload";

import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { cleanupSidecarFiles, streamBatchesFromFile } from "@/lib/import/file-readers";
import { ProgressTrackingService } from "@/lib/import/progress-tracking";
import { applyTransforms } from "@/lib/import/transforms";
import { createJobLogger, logError, logger, logPerformance } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import { getImportGeocodingResults } from "@/lib/types/geocoding";
import type { ImportTransform } from "@/lib/types/import-transforms";
import { extractRelationId, requireRelationId } from "@/lib/utils/relation-id";
import type { Dataset, ImportFile, ImportJob } from "@/payload-types";

import type { CreateEventsBatchJobInput } from "../types/job-inputs";
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

const processEventBatch = async (
  payload: Payload,
  rows: Record<string, unknown>[],
  job: ImportJob,
  dataset: Dataset,
  importJobId: string | number,
  globalRowOffset: number,
  logger: ReturnType<typeof createJobLogger>
) => {
  const duplicateRows = extractDuplicateRows(job);
  const geocodingResults = getImportGeocodingResults(job);

  // Build transforms once per batch, not per row (they're dataset-level config)
  const transforms = buildTransformsFromDataset(dataset);

  let eventsCreated = 0;
  let eventsSkipped = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = globalRowOffset + index;

    if (duplicateRows.has(rowNumber)) {
      eventsSkipped++;
      continue;
    }

    try {
      // Apply all transforms in one pass
      const transformedRow = transforms.length > 0 ? applyTransforms(row, transforms) : row;

      // Track what transforms changed
      const transformationChanges =
        transforms.length > 0
          ? transforms.map((t) => ({
              path: getTransformPath(t),
              oldValue: "from" in t ? (row[t.from] ?? null) : (null as unknown),
              newValue: (transformedRow[getNewValuePath(t)] ?? null) as unknown,
            }))
          : null;

      if (transformationChanges) {
        logger.debug("Applied transforms", { transformCount: transforms.length });
      }

      // Create event with coordinates from field mappings or geocoded locations
      const eventData = createEventData(
        transformedRow,
        dataset,
        importJobId,
        job,
        geocodingResults,
        transformationChanges
      );

      await payload.create({ collection: COLLECTION_NAMES.EVENTS, data: eventData });

      eventsCreated++;
    } catch (error) {
      logger.warn("Failed to create event", { rowNumber, error });
      errors.push({ row: rowNumber, error: error instanceof Error ? error.message : "Unknown error" });
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

      // Clean slate: delete events from any prior failed attempt of this job.
      // This is safe because the job is only marked COMPLETED after all events are created.
      const existingEvents = await payload.count({
        collection: COLLECTION_NAMES.EVENTS,
        where: { importJob: { equals: importJobId } },
      });

      if (existingEvents.totalDocs > 0) {
        logger.info("Cleaning up events from prior attempt", { importJobId, existingEvents: existingEvents.totalDocs });
        await payload.delete({ collection: COLLECTION_NAMES.EVENTS, where: { importJob: { equals: importJobId } } });
      }

      // Start CREATE_EVENTS stage with total file rows (stream iterates all rows, including duplicates)
      const totalFileRows = job.duplicates?.summary?.totalRows ?? 0;
      await ProgressTrackingService.startStage(payload, importJobId, PROCESSING_STAGE.CREATE_EVENTS, totalFileRows);

      // Check EVENTS_PER_IMPORT quota before processing
      await checkEventQuotaBeforeProcessing(payload, importFile, job);

      const BATCH_SIZE = BATCH_SIZES.EVENT_CREATION;
      let batchNumber = 0;
      let totalRowsProcessed = 0;
      let totalEventsCreated = 0;
      let totalEventsSkipped = 0;
      let totalErrors = 0;
      let storedErrorCount = 0;

      for await (const rows of streamBatchesFromFile(filePath, {
        sheetIndex: job.sheetIndex ?? undefined,
        batchSize: BATCH_SIZE,
      })) {
        const { eventsCreated, eventsSkipped, errors } = await processEventBatch(
          payload,
          rows,
          job,
          dataset,
          importJobId,
          totalRowsProcessed,
          logger
        );

        totalRowsProcessed += rows.length;
        totalEventsCreated += eventsCreated;
        totalEventsSkipped += eventsSkipped;
        totalErrors += errors.length;

        // Calculate cumulative rows processed (created + skipped + errored)
        const batchRowsProcessed = eventsCreated + eventsSkipped + errors.length;

        // Update stage progress
        await ProgressTrackingService.updateStageProgress(
          payload,
          job,
          PROCESSING_STAGE.CREATE_EVENTS,
          totalRowsProcessed,
          batchRowsProcessed
        );

        // Complete this batch
        await ProgressTrackingService.completeBatch(payload, job, PROCESSING_STAGE.CREATE_EVENTS, batchNumber + 1);

        // Update job errors (tracks count to enforce MAX_STORED_ERRORS across batches)
        storedErrorCount = await updateJobErrors(payload, importJobId, storedErrorCount, errors);

        batchNumber++;
      }

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
