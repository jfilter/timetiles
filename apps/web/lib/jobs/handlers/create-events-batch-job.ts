/**
 * Defines the job handler for creating events from a batch of imported data.
 *
 * This job processes a specific batch of rows from an import file. For each row, it performs the following:
 * - Skips rows that have been identified as duplicates in the `analyze-duplicates-job`.
 * - Generates a unique ID for the event.
 * - Associates any available geocoding results with the event.
 * - Creates a new document in the `events` collection.
 *
 * The job updates the import job's progress and handles errors for individual rows.
 * If more data is available in the file, it queues another `CREATE_EVENTS_BATCH` job for the next batch.
 * Once all batches are processed, it marks the import job as `COMPLETED`.
 *
 * @module
 * @category Jobs
 */
import path from "node:path";

import type { Payload } from "payload";

import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { QUOTA_TYPES, USAGE_TYPES } from "@/lib/constants/quota-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { applyTransforms } from "@/lib/services/import-transforms";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import { getQuotaService } from "@/lib/services/quota-service";
import { getGeocodingResults } from "@/lib/types/geocoding";
import type { ImportTransform } from "@/lib/types/import-transforms";
import { readBatchFromFile } from "@/lib/utils/file-readers";
import type { Dataset, ImportFile, ImportJob } from "@/payload-types";

import type { CreateEventsBatchJobInput } from "../types/job-inputs";
import { createEventData } from "../utils/event-creation-helpers";
import type { JobHandlerContext } from "../utils/job-context";
import { extractDuplicateRows } from "../utils/resource-loading";

/**
 * Build ImportTransform array from dataset configuration.
 * Handles all transform types: rename, date-parse, string-op, concatenate, split, type-cast
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
const buildTransformsFromDataset = (dataset: Dataset): ImportTransform[] => {
  const transforms: ImportTransform[] = [];

  for (const t of dataset.importTransforms ?? []) {
    if (typeof t !== "object" || !t?.id || !t.type || t.active !== true) {
      continue;
    }

    const base = {
      id: t.id,
      active: true,
      autoDetected: Boolean(t.autoDetected),
    };

    switch (t.type) {
      case "rename":
        if (t.from && t.to) {
          transforms.push({ ...base, type: "rename", from: t.from, to: t.to });
        }
        break;

      case "date-parse":
        if (t.from && t.inputFormat && t.outputFormat) {
          transforms.push({
            ...base,
            type: "date-parse",
            from: t.from,
            inputFormat: t.inputFormat,
            outputFormat: t.outputFormat,
            timezone: t.timezone ?? undefined,
          });
        }
        break;

      case "string-op":
        if (t.from && t.operation) {
          transforms.push({
            ...base,
            type: "string-op",
            from: t.from,
            operation: t.operation,
            pattern: t.pattern ?? undefined,
            replacement: t.replacement ?? undefined,
          });
        }
        break;

      case "concatenate":
        if (Array.isArray(t.fromFields) && t.fromFields.length >= 2 && t.to) {
          transforms.push({
            ...base,
            type: "concatenate",
            fromFields: t.fromFields as string[],
            separator: t.separator ?? " ",
            to: t.to,
          });
        }
        break;

      case "split":
        if (t.from && t.delimiter && Array.isArray(t.toFields) && t.toFields.length > 0) {
          transforms.push({
            ...base,
            type: "split",
            from: t.from,
            delimiter: t.delimiter,
            toFields: t.toFields as string[],
          });
        }
        break;

      case "type-cast":
        if (t.from && t.fromType && t.toType && t.strategy) {
          transforms.push({
            ...base,
            type: "type-cast",
            from: t.from,
            fromType: t.fromType,
            toType: t.toType as "string" | "number" | "boolean" | "date" | "array" | "object" | "null",
            strategy: t.strategy,
            customFunction: t.customFunction ?? undefined,
          });
        }
        break;
    }
  }

  return transforms;
};

/**
 * Updates import file status based on the status of all associated jobs.
 */

const updateImportFileStatusIfAllJobsComplete = async (
  payload: Payload,
  importFileId: string | number
): Promise<void> => {
  const importFileIdNum = typeof importFileId === "number" ? importFileId : parseInt(importFileId, 10);

  // Check if all import jobs for this file are completed or failed
  const pendingJobs = await payload.find({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    where: {
      importFile: { equals: importFileIdNum },
      stage: {
        not_in: [PROCESSING_STAGE.COMPLETED, PROCESSING_STAGE.FAILED],
      },
    },
    limit: 1,
  });

  // If no pending jobs, check if any failed
  if (pendingJobs.docs.length === 0) {
    const failedJobs = await payload.find({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      where: {
        importFile: { equals: importFileIdNum },
        stage: { equals: PROCESSING_STAGE.FAILED },
      },
      limit: 1,
    });

    // Update import file status based on job outcomes
    const newStatus = failedJobs.docs.length > 0 ? "failed" : "completed";
    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_FILES,
      id: importFileIdNum,
      data: {
        status: newStatus,
      },
    });
  }
};

// Extract helper functions to reduce complexity

const processEventBatch = async (
  payload: Payload,
  rows: Record<string, unknown>[],
  job: ImportJob,
  dataset: Dataset,
  importJobId: string | number,
  batchNumber: number,
  logger: ReturnType<typeof createJobLogger>
) => {
  const BATCH_SIZE = BATCH_SIZES.EVENT_CREATION;
  const duplicateRows = extractDuplicateRows(job);
  const geocodingResults = getGeocodingResults(job);

  let eventsCreated = 0;
  let eventsSkipped = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = batchNumber * BATCH_SIZE + index;

    if (duplicateRows.has(rowNumber)) {
      eventsSkipped++;
      continue;
    }

    try {
      // Build unified transforms from dataset configuration
      const transforms = buildTransformsFromDataset(dataset);

      // Apply all transforms in one pass
      const transformedRow = transforms.length > 0 ? applyTransforms(row, transforms) : row;

      // Track if any transforms were applied
      const transformationChanges =
        transforms.length > 0 ? transforms.map((t) => ({ type: t.type, from: "from" in t ? t.from : "" })) : null;

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
        transformationChanges as Array<{ path: string; oldValue: unknown; newValue: unknown }> | null
      );

      await payload.create({
        collection: COLLECTION_NAMES.EVENTS,
        data: eventData,
      });

      eventsCreated++;
    } catch (error) {
      logger.error("Failed to create event", { rowNumber, error });
      errors.push({
        row: rowNumber,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      eventsSkipped++;
    }
  }

  return { eventsCreated, eventsSkipped, errors };
};

const markJobCompleted = async (payload: Payload, importJobId: string | number, job: ImportJob) => {
  // Count actual events created for this import job (reliable source of truth)
  const eventsResult = await payload.count({
    collection: COLLECTION_NAMES.EVENTS,
    where: { importJob: { equals: importJobId } },
  });
  const totalEventsCreated = eventsResult.totalDocs;

  const duplicatesSkipped =
    (job.duplicates?.summary?.internalDuplicates ?? 0) + (job.duplicates?.summary?.externalDuplicates ?? 0);

  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
    data: {
      stage: PROCESSING_STAGE.COMPLETED,
      results: {
        totalEvents: totalEventsCreated,
        duplicatesSkipped,
        geocoded: Object.keys(getGeocodingResults(job)).length,
        errors: job.errors?.length ?? 0,
      },
    },
  });

  // Track total events created for the user's quota
  try {
    const importJob = await payload.findByID({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: importJobId,
    });

    if (importJob?.importFile) {
      const importFileId = typeof importJob.importFile === "object" ? importJob.importFile.id : importJob.importFile;
      const importFile = await payload.findByID({
        collection: COLLECTION_NAMES.IMPORT_FILES,
        id: importFileId,
      });

      if (importFile?.user) {
        const logger = createJobLogger(String(importJobId), "create-events-batch");

        const userId = typeof importFile.user === "object" ? importFile.user.id : importFile.user;

        const quotaService = getQuotaService(payload);
        await quotaService.incrementUsage(userId, USAGE_TYPES.TOTAL_EVENTS_CREATED, totalEventsCreated);

        logger.info("Event creation tracked for quota", {
          userId,
          eventsCreated: totalEventsCreated,
          importJobId,
        });
      }
    }
  } catch (error) {
    // Don't fail the job if quota tracking fails
    logError(error, "Failed to track event creation quota", { importJobId });
  }
};

const getJobResources = async (payload: Payload, importJobId: string | number) => {
  const job = await payload.findByID({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
  });

  if (!job) {
    throw new Error(`Import job not found: ${importJobId}`);
  }

  // Always fetch dataset by ID to ensure we have all fields including idStrategy
  const datasetId = typeof job.dataset === "object" ? job.dataset.id : job.dataset;

  const dataset = await payload.findByID({ collection: COLLECTION_NAMES.DATASETS, id: datasetId });

  if (!dataset) {
    throw new Error("Dataset not found");
  }

  const importFile =
    typeof job.importFile === "object"
      ? job.importFile
      : await payload.findByID({ collection: COLLECTION_NAMES.IMPORT_FILES, id: job.importFile });

  if (!importFile) {
    throw new Error("Import file not found");
  }

  return { job, dataset, importFile };
};

const processBatchData = async (
  payload: Payload,
  job: ImportJob,
  dataset: Dataset,
  importFile: ImportFile,
  batchNumber: number,
  logger: ReturnType<typeof createJobLogger>
) => {
  const uploadDir = path.resolve(process.cwd(), `${process.env.UPLOAD_DIR ?? "uploads"}/import-files`);
  const filePath = path.join(uploadDir, importFile.filename ?? "");
  const BATCH_SIZE = BATCH_SIZES.EVENT_CREATION;

  const rows = readBatchFromFile(filePath, {
    sheetIndex: job.sheetIndex ?? undefined,
    startRow: batchNumber * BATCH_SIZE,
    limit: BATCH_SIZE,
  });

  if (rows.length === 0) {
    return { rows, eventsCreated: 0, eventsSkipped: 0, errors: [] };
  }

  const result = await processEventBatch(payload, rows, job, dataset, job.id, batchNumber, logger);

  return { rows, ...result };
};

const updateJobErrors = async (
  payload: Payload,
  importJobId: string | number,
  job: ImportJob,
  errors: Array<{ row: number; error: string }>
) => {
  if (errors.length === 0) return;

  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
    data: {
      errors: [...(job.errors ?? []), ...errors],
    },
  });
};

const handleBatchCompletion = async (
  payload: Payload,
  job: ImportJob,
  importJobId: string | number,
  batchNumber: number,
  hasMore: boolean
) => {
  if (!hasMore) {
    await markJobCompleted(payload, importJobId, job);
    const importFileId = typeof job.importFile === "object" ? job.importFile.id : job.importFile;
    await updateImportFileStatusIfAllJobsComplete(payload, importFileId);
    return;
  }

  await payload.jobs.queue({
    task: JOB_TYPES.CREATE_EVENTS,
    input: { importJobId, batchNumber: batchNumber + 1 },
  });
};

const handleJobError = async (payload: Payload, importJobId: string | number, batchNumber: number, error: unknown) => {
  logError(error, "Event creation batch failed", { importJobId, batchNumber });

  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
    data: {
      stage: PROCESSING_STAGE.FAILED,
      errors: [
        {
          row: batchNumber * BATCH_SIZES.EVENT_CREATION,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      ],
    },
  });
};

const checkEventQuotaForFirstBatch = async (
  payload: Payload,
  importFile: ImportFile,
  job: ImportJob,
  batchNumber: number
): Promise<void> => {
  // Only check quota on first batch
  if (batchNumber !== 0 || !importFile?.user) {
    return;
  }

  const userId = typeof importFile.user === "object" ? importFile.user.id : importFile.user;
  const user =
    typeof importFile.user === "object" ? importFile.user : await payload.findByID({ collection: "users", id: userId });

  if (!user) {
    return;
  }

  const quotaService = getQuotaService(payload);

  // Get total rows from CREATE_EVENTS stage
  const stages = (job.progress?.stages as Record<string, { rowsTotal?: number }> | undefined) ?? {};
  const createEventsStage = stages[PROCESSING_STAGE.CREATE_EVENTS];
  const totalRows = createEventsStage?.rowsTotal ?? 0;

  // Check if this import would exceed the per-import limit
  const quotaCheck = await quotaService.checkQuota(user, QUOTA_TYPES.EVENTS_PER_IMPORT, totalRows);

  if (!quotaCheck.allowed) {
    throw new Error(
      `Import exceeds maximum events per import (${totalRows} > ${quotaCheck.limit}). ` +
        `Please split your data into smaller files.`
    );
  }
};

export const createEventsBatchJob = {
  slug: JOB_TYPES.CREATE_EVENTS,
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as CreateEventsBatchJobInput["input"];
    const { importJobId, batchNumber } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "create-events-batch");
    logger.info("Starting event creation batch", { importJobId, batchNumber });
    const startTime = Date.now();

    try {
      const { job, dataset, importFile } = await getJobResources(payload, importJobId);

      // Start CREATE_EVENTS stage on first batch
      if (batchNumber === 0) {
        const uniqueRows = job.duplicates?.summary?.uniqueRows ?? 0;
        await ProgressTrackingService.startStage(payload, importJobId, PROCESSING_STAGE.CREATE_EVENTS, uniqueRows);
      }

      // Check EVENTS_PER_IMPORT quota before processing
      await checkEventQuotaForFirstBatch(payload, importFile, job, batchNumber);

      const { rows, eventsCreated, eventsSkipped, errors } = await processBatchData(
        payload,
        job,
        dataset,
        importFile,
        batchNumber,
        logger
      );

      // Handle empty batch (end of file)
      if (rows.length === 0) {
        await ProgressTrackingService.completeStage(payload, importJobId, PROCESSING_STAGE.CREATE_EVENTS);
        await markJobCompleted(payload, importJobId, job);
        return { output: { completed: true } };
      }

      // Calculate cumulative events created
      const rowsProcessedSoFar =
        (batchNumber + 1) * BATCH_SIZES.EVENT_CREATION -
        (rows.length < BATCH_SIZES.EVENT_CREATION ? BATCH_SIZES.EVENT_CREATION - rows.length : 0);

      // Update stage progress
      await ProgressTrackingService.updateStageProgress(
        payload,
        importJobId,
        PROCESSING_STAGE.CREATE_EVENTS,
        rowsProcessedSoFar,
        eventsCreated
      );

      // Complete this batch
      await ProgressTrackingService.completeBatch(
        payload,
        importJobId,
        PROCESSING_STAGE.CREATE_EVENTS,
        batchNumber + 1
      );

      // Update job errors
      await updateJobErrors(payload, importJobId, job, errors);
      const hasMore = rows.length === BATCH_SIZES.EVENT_CREATION;

      // If no more batches, complete the stage
      if (!hasMore) {
        await ProgressTrackingService.completeStage(payload, importJobId, PROCESSING_STAGE.CREATE_EVENTS);
      }

      await handleBatchCompletion(payload, job, importJobId, batchNumber, hasMore);

      logPerformance("Event creation batch", Date.now() - startTime, {
        importJobId,
        batchNumber,
        eventsCreated,
        eventsSkipped,
        errors: errors.length,
      });

      return {
        output: {
          batchNumber,
          eventsCreated,
          eventsSkipped,
          errors: errors.length,
          hasMore,
        },
      };
    } catch (error) {
      await handleJobError(payload, importJobId, batchNumber, error);

      try {
        const failedJob = await payload.findByID({
          collection: COLLECTION_NAMES.IMPORT_JOBS,
          id: importJobId,
        });
        const importFileId = typeof failedJob.importFile === "object" ? failedJob.importFile.id : failedJob.importFile;
        await updateImportFileStatusIfAllJobsComplete(payload, importFileId);
      } catch (updateError) {
        logError(updateError, "Failed to update import file status", { importJobId });
      }

      throw error;
    }
  },
};
