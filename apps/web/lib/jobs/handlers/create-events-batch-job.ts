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
import { generateUniqueId } from "@/lib/services/id-generation";
import { applyTransforms } from "@/lib/services/import-transforms";
import { getQuotaService } from "@/lib/services/quota-service";
import { TypeTransformationService } from "@/lib/services/type-transformation";
import { getGeocodingResultForRow, getGeocodingResults } from "@/lib/types/geocoding";
import type { ImportTransform } from "@/lib/types/import-transforms";
import { isValidDate } from "@/lib/utils/date";
import { readBatchFromFile } from "@/lib/utils/file-readers";
import type { Dataset, ImportFile, ImportJob } from "@/payload-types";

import type { CreateEventsBatchJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";
import { extractDuplicateRows } from "../utils/resource-loading";

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

/**
 * Apply type transformations to a row based on dataset configuration.
 * Note: This works on data that hasn't been auto-typed by Papa Parse.
 * For CSV files with dynamicTyping: true, transformations may not apply.
 */
const applyTypeTransformations = async (
  row: Record<string, unknown>,
  dataset: Dataset,
  logger: ReturnType<typeof createJobLogger>
): Promise<{
  transformedRow: Record<string, unknown>;
  transformationChanges: Array<{ path: string; oldValue: unknown; newValue: unknown; error?: string }> | null;
}> => {
  const allowTransformations = dataset.schemaConfig?.allowTransformations ?? true;
  const transformations = dataset.typeTransformations ?? [];

  if (!allowTransformations || transformations.length === 0) {
    return { transformedRow: row, transformationChanges: null };
  }

  try {
    const transformationRules = transformations.map((t) => ({
      fieldPath: t.fieldPath,
      fromType: t.fromType,
      toType: t.toType,
      transformStrategy: t.transformStrategy,
      customTransform: t.customTransform ?? undefined,
      enabled: t.enabled ?? true,
    }));

    const service = new TypeTransformationService(transformationRules);
    const result = await service.transformRecord(row);

    const successfulChanges = result.changes.filter((change) => !change.error);
    const failedChanges = result.changes.filter((change) => change.error);

    if (successfulChanges.length > 0) {
      logger.debug("Applied type transformations", {
        fieldCount: successfulChanges.length,
        changes: successfulChanges,
      });
    }

    if (failedChanges.length > 0) {
      logger.warn("Some transformations failed", {
        fieldCount: failedChanges.length,
        changes: failedChanges,
      });
    }

    return {
      transformedRow: result.transformed,
      transformationChanges: successfulChanges.length > 0 ? successfulChanges : null,
    };
  } catch (error) {
    logger.error("Type transformation failed", { error });
    return { transformedRow: row, transformationChanges: null };
  }
};

const createEventData = (
  row: Record<string, unknown>,
  dataset: Dataset,
  importJobId: string | number,
  geocoding: ReturnType<typeof getGeocodingResultForRow>,
  job: { datasetSchemaVersion?: unknown },
  transformationChanges: Array<{ path: string; oldValue: unknown; newValue: unknown; error?: string }> | null,
  timestampPath?: string | null
) => {
  const uniqueId = generateUniqueId(row, dataset.idStrategy);
  const importJobNum = typeof importJobId === "string" ? parseInt(importJobId, 10) : importJobId;

  const schemaVersionData = job.datasetSchemaVersion;
  let schemaVersion: number | undefined;
  if (typeof schemaVersionData === "object" && schemaVersionData) {
    schemaVersion = (schemaVersionData as { versionNumber: number }).versionNumber;
  } else if (typeof schemaVersionData === "number") {
    schemaVersion = schemaVersionData;
  } else {
    schemaVersion = undefined;
  }

  return {
    dataset: dataset.id,
    importJob: importJobNum,
    data: row,
    uniqueId,
    eventTimestamp: extractTimestamp(row, timestampPath).toISOString(),
    location: geocoding
      ? {
          latitude: geocoding.coordinates.lat,
          longitude: geocoding.coordinates.lng,
        }
      : undefined,
    coordinateSource: geocoding
      ? {
          type: "geocoded" as const,
          confidence: geocoding.confidence,
        }
      : {
          type: "none" as const,
        },
    validationStatus: transformationChanges ? ("transformed" as const) : ("pending" as const),
    transformations: transformationChanges,
    schemaVersionNumber: schemaVersion,
  };
};

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
      // Apply import transforms first (field renames)
      const importTransforms: ImportTransform[] = (dataset.importTransforms ?? [])
        .filter(
          (
            t: unknown
          ): t is {
            id: string;
            type: string;
            from: string;
            to: string;
            active: boolean | null | undefined;
            autoDetected: boolean | null | undefined;
          } => {
            return (
              typeof t === "object" &&
              t !== null &&
              "active" in t &&
              "type" in t &&
              "from" in t &&
              "to" in t &&
              "id" in t &&
              "autoDetected" in t
            );
          }
        )
        .filter((t) => t.active === true)
        .map((t) => ({
          id: t.id,
          type: t.type as "rename",
          from: t.from,
          to: t.to,
          active: true,
          autoDetected: t.autoDetected ?? false,
        }));

      const rowAfterImportTransforms = importTransforms.length > 0 ? applyTransforms(row, importTransforms) : row;

      // Apply type transformations
      const { transformedRow, transformationChanges } = await applyTypeTransformations(
        rowAfterImportTransforms,
        dataset,
        logger
      );

      const geocoding = getGeocodingResultForRow(geocodingResults, rowNumber);
      const eventData = createEventData(
        transformedRow,
        dataset,
        importJobId,
        geocoding,
        job,
        transformationChanges,
        job.detectedFieldMappings?.timestampPath
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

const markJobCompleted = async (
  payload: Payload,
  importJobId: string | number,
  job: ImportJob,
  eventsCreated: number
) => {
  const currentProgress = job.progress?.current ?? 0;
  const totalEventsCreated = currentProgress + eventsCreated;
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
  const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
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

const updateJobProgress = async (
  payload: Payload,
  importJobId: string | number,
  job: ImportJob,
  eventsCreated: number,
  errors: Array<{ row: number; error: string }>
) => {
  const currentProgress = job.progress?.current ?? 0;
  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
    data: {
      progress: {
        ...job.progress,
        current: currentProgress + eventsCreated,
      },
      errors: [...(job.errors ?? []), ...errors],
    },
  });
};

const handleBatchCompletion = async (
  payload: Payload,
  job: ImportJob,
  importJobId: string | number,
  batchNumber: number,
  eventsCreated: number,
  hasMore: boolean
) => {
  if (!hasMore) {
    await markJobCompleted(payload, importJobId, job, eventsCreated);
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
          row: batchNumber * 1000,
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
  const totalRows = job.progress?.total ?? 0;

  // Check if this import would exceed the per-import limit
  const quotaCheck = quotaService.checkQuota(user, QUOTA_TYPES.EVENTS_PER_IMPORT, totalRows);

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
        await markJobCompleted(payload, importJobId, job, 0);
        return { output: { completed: true } };
      }

      // Update progress and continue
      await updateJobProgress(payload, importJobId, job, eventsCreated, errors);
      const hasMore = rows.length === BATCH_SIZES.EVENT_CREATION;
      await handleBatchCompletion(payload, job, importJobId, batchNumber, eventsCreated, hasMore);

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

// Helper to extract timestamp from row data using field mapping
const extractTimestamp = (row: Record<string, unknown>, timestampPath?: string | null): Date => {
  // Try mapped field first
  if (timestampPath && row[timestampPath]) {
    const date = new Date(row[timestampPath] as string | number);
    if (isValidDate(date)) {
      return date;
    }
  }

  // Fallback to common timestamp fields
  const timestampFields = ["timestamp", "date", "datetime", "created_at", "event_date", "event_time"];

  for (const field of timestampFields) {
    if (row[field]) {
      const date = new Date(row[field] as string | number);
      if (isValidDate(date)) {
        return date;
      }
    }
  }

  // Default to current time
  return new Date();
};
