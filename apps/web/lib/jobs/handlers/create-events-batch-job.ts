/**
 * @module Defines the job handler for creating events from a batch of imported data.
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
 */
import path from "path";
import type { Payload } from "payload";

import { BATCH_SIZES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { generateUniqueId } from "@/lib/services/id-generation";
import type { GeocodingResultsMap } from "@/lib/types/geocoding";
import { getGeocodingResultForRow, getGeocodingResults } from "@/lib/types/geocoding";
import { readBatchFromFile } from "@/lib/utils/file-readers";
import type { Dataset } from "@/payload-types";

import type { CreateEventsBatchJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";

/**
 * Updates import file status based on the status of all associated jobs
 */
const updateImportFileStatusIfAllJobsComplete = async (
  payload: Payload,
  importFileId: string | number
): Promise<void> => {
  const importFileIdNum = typeof importFileId === "number" ? importFileId : parseInt(importFileId, 10);

  // Check if all import jobs for this file are completed or failed
  const pendingJobs = await payload.find({
    collection: "import-jobs",
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
      collection: "import-jobs",
      where: {
        importFile: { equals: importFileIdNum },
        stage: { equals: PROCESSING_STAGE.FAILED },
      },
      limit: 1,
    });

    // Update import file status based on job outcomes
    const newStatus = failedJobs.docs.length > 0 ? "failed" : "completed";
    await payload.update({
      collection: "import-files",
      id: importFileIdNum,
      data: {
        status: newStatus,
      },
    });
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
      // Get import job
      const job = await payload.findByID({
        collection: "import-jobs",
        id: importJobId,
      });

      if (!job) {
        throw new Error(`Import job not found: ${importJobId}`);
      }

      // Get dataset configuration
      const dataset =
        typeof job.dataset === "object"
          ? job.dataset
          : await payload.findByID({ collection: "datasets", id: job.dataset });

      if (!dataset) {
        throw new Error("Dataset not found");
      }

      // Get file details
      const importFile =
        typeof job.importFile === "object"
          ? job.importFile
          : await payload.findByID({ collection: "import-files", id: job.importFile });

      if (!importFile) {
        throw new Error("Import file not found");
      }

      const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      const filePath = path.join(uploadDir, importFile.filename || "");
      const BATCH_SIZE = BATCH_SIZES.EVENT_CREATION;

      // Read batch of rows from file
      const rows = await readBatchFromFile(filePath, {
        sheetIndex: job.sheetIndex ?? undefined,
        startRow: batchNumber * BATCH_SIZE,
        limit: BATCH_SIZE,
      });

      if (rows.length === 0) {
        // No more data, mark as completed
        await payload.update({
          collection: "import-jobs",
          id: importJobId,
          data: {
            stage: PROCESSING_STAGE.COMPLETED,
            results: {
              totalEvents: job.progress?.current || 0,
              duplicatesSkipped:
                (job.duplicates?.summary?.internalDuplicates || 0) + (job.duplicates?.summary?.externalDuplicates || 0),
              geocoded: Object.keys(getGeocodingResults(job)).length,
            },
          },
        });
        return { output: { completed: true } };
      }

      // Get duplicate rows to skip
      const duplicateRows = new Set<number>();
      if (Array.isArray(job.duplicates?.internal)) {
        job.duplicates.internal.forEach((d: any) => duplicateRows.add(d.rowNumber));
      }
      if (Array.isArray(job.duplicates?.external)) {
        job.duplicates.external.forEach((d: any) => duplicateRows.add(d.rowNumber));
      }

      // Get geocoding results safely
      const geocodingResults: GeocodingResultsMap = getGeocodingResults(job);

      // Process rows and create events
      let eventsCreated = 0;
      let eventsSkipped = 0;
      const errors: any[] = [];

      for (const [index, row] of rows.entries()) {
        const rowNumber = batchNumber * BATCH_SIZE + index;

        // Skip duplicate rows
        if (duplicateRows.has(rowNumber)) {
          eventsSkipped++;
          continue;
        }

        try {
          // Generate unique ID
          const uniqueId = generateUniqueId(row, dataset.idStrategy);

          // Get geocoding result if available
          const geocoding = getGeocodingResultForRow(geocodingResults, rowNumber);

          // Create event
          await payload.create({
            collection: "events",
            data: {
              dataset: dataset.id,
              importJob: typeof importJobId === "string" ? parseInt(importJobId, 10) : importJobId, // Reference to import job
              data: row, // The actual row data from file
              uniqueId,
              eventTimestamp: extractTimestamp(row, dataset).toISOString(),
              // Add geocoded location if available
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
              validationStatus: "pending" as const,
              schemaVersionNumber:
                typeof job.datasetSchemaVersion === "object" && job.datasetSchemaVersion
                  ? job.datasetSchemaVersion.versionNumber
                  : typeof job.datasetSchemaVersion === "number"
                    ? job.datasetSchemaVersion
                    : undefined,
            },
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

      // Update progress
      const currentProgress = job.progress?.current || 0;
      await payload.update({
        collection: "import-jobs",
        id: importJobId,
        data: {
          progress: {
            ...job.progress,
            current: currentProgress + eventsCreated,
          },
          errors: [...(job.errors || []), ...errors],
        },
      });

      // Queue next batch if needed
      const hasMore = rows.length === BATCH_SIZE;
      if (hasMore) {
        await payload.jobs.queue({
          task: JOB_TYPES.CREATE_EVENTS,
          input: { importJobId, batchNumber: batchNumber + 1 },
        });
      } else {
        // All done, mark as completed
        await payload.update({
          collection: "import-jobs",
          id: importJobId,
          data: {
            stage: PROCESSING_STAGE.COMPLETED,
            results: {
              totalEvents: currentProgress + eventsCreated,
              duplicatesSkipped:
                (job.duplicates?.summary?.internalDuplicates || 0) + (job.duplicates?.summary?.externalDuplicates || 0),
              geocoded: Object.keys(getGeocodingResults(job)).length,
              errors: job.errors?.length || 0,
            },
          },
        });

        // Check if all jobs for this import file are completed
        const importFileId = typeof job.importFile === "object" ? job.importFile.id : job.importFile;
        await updateImportFileStatusIfAllJobsComplete(payload, importFileId);
      }

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
      logError(error, "Event creation batch failed", { importJobId, batchNumber });

      // Update job status to failed
      await payload.update({
        collection: "import-jobs",
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

      // Check if import file should be marked as failed
      // Need to get the job again to access importFile since 'job' is out of scope
      try {
        const failedJob = await payload.findByID({
          collection: "import-jobs",
          id: importJobId,
        });
        const importFileId = typeof failedJob.importFile === "object" ? failedJob.importFile.id : failedJob.importFile;
        await updateImportFileStatusIfAllJobsComplete(payload, importFileId);
      } catch (updateError) {
        // Log but don't throw - the original error is more important
        logError(updateError, "Failed to update import file status", { importJobId });
      }

      throw error;
    }
  },
};

// Helper to extract timestamp from row data
const extractTimestamp = (row: any, dataset: Dataset): Date => {
  // Look for common timestamp fields
  const timestampFields = ["timestamp", "date", "datetime", "created_at", "event_date", "event_time"];

  for (const field of timestampFields) {
    if (row[field]) {
      const date = new Date(row[field]);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Default to current time
  return new Date();
};

// Helper to extract location display from row data
const extractLocationDisplay = (row: any, dataset: Dataset): string | null => {
  // Look for location-related fields
  const locationFields = ["location", "address", "place", "venue", "city", "country"];

  for (const field of locationFields) {
    if (row[field] && typeof row[field] === "string") {
      return row[field];
    }
  }

  // Try to build from city/state/country
  const parts = [];
  if (row.city) parts.push(row.city);
  if (row.state) parts.push(row.state);
  if (row.country) parts.push(row.country);

  return parts.length > 0 ? parts.join(", ") : null;
};
