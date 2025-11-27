/**
 * Defines the job handler for geocoding unique locations from an imported file.
 *
 * This job extracts unique location values from the location field and geocodes them.
 * Unlike the previous implementation, it does not process coordinates (lat/lon) - those
 * are read directly from field mappings during event creation.
 *
 * The geocoded results are stored as a map from location string to coordinates,
 * allowing multiple rows with the same location to share the same geocoding result.
 *
 * @module
 * @category Jobs
 */
import path from "node:path";

import type { Payload } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { geocodeAddress } from "@/lib/services/geocoding";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import type { GeocodingResultsMap } from "@/lib/types/geocoding";
import { getGeocodingCandidate } from "@/lib/types/geocoding";
import { readAllRowsFromFile } from "@/lib/utils/file-readers";
import type { Dataset, ImportFile, ImportJob } from "@/payload-types";

import type { GeocodingBatchJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";

/**
 * Extract unique location values from rows.
 */
const extractUniqueLocations = (
  rows: Record<string, unknown>[],
  locationField: string,
  logger: ReturnType<typeof createJobLogger>
): Set<string> => {
  const uniqueLocations = new Set<string>();

  for (const row of rows) {
    const location = row[locationField];

    if (location && typeof location === "string") {
      const trimmed = location.trim();
      if (trimmed) {
        uniqueLocations.add(trimmed);
      }
    }
  }

  logger.info("Extracted unique locations", {
    totalRows: rows.length,
    uniqueLocations: uniqueLocations.size,
  });

  return uniqueLocations;
};

/**
 * Geocode unique locations with progress tracking.
 */
const geocodeUniqueLocations = async (
  payload: Payload,
  importJobId: string | number,
  locations: Set<string>,
  logger: ReturnType<typeof createJobLogger>
): Promise<{
  results: GeocodingResultsMap;
  successCount: number;
  failureCount: number;
}> => {
  const results: GeocodingResultsMap = {};
  let successCount = 0;
  let failureCount = 0;
  let processed = 0;

  for (const location of locations) {
    try {
      const result = await geocodeAddress(location);
      results[location] = {
        coordinates: {
          lat: result.latitude,
          lng: result.longitude,
        },
        confidence: result.confidence ?? 0,
        formattedAddress: result.normalizedAddress,
      };
      successCount++;
      logger.debug("Geocoded location", { location, result });
    } catch (error) {
      logger.warn("Geocoding failed", { location, error });
      failureCount++;
    }

    processed++;

    // Update progress every 10 locations or on completion
    if (processed % 10 === 0 || processed === locations.size) {
      await ProgressTrackingService.updateStageProgress(
        payload,
        importJobId,
        PROCESSING_STAGE.GEOCODE_BATCH,
        processed,
        Math.min(10, locations.size - processed + 10)
      );
    }
  }

  logger.info("Geocoding completed", {
    total: locations.size,
    success: successCount,
    failed: failureCount,
  });

  return { results, successCount, failureCount };
};

/**
 * Get job resources and validate them.
 */
const getJobResources = async (
  payload: Payload,
  importJobId: string | number
): Promise<{
  job: ImportJob;
  dataset: Dataset;
  importFile: ImportFile;
}> => {
  const job = await payload.findByID({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
  });

  if (!job) {
    throw new Error(`Import job not found: ${importJobId}`);
  }

  const dataset =
    typeof job.dataset === "object"
      ? job.dataset
      : await payload.findByID({ collection: COLLECTION_NAMES.DATASETS, id: job.dataset });

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

export const geocodeBatchJob = {
  slug: JOB_TYPES.GEOCODE_BATCH,
  handler: async (context: JobHandlerContext): Promise<{ output: Record<string, unknown> }> => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as GeocodingBatchJobInput["input"];
    const { importJobId } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "geocode-unique-locations");
    logger.info("Starting unique location geocoding", { importJobId });
    const startTime = Date.now();

    try {
      const { job, importFile } = await getJobResources(payload, importJobId);

      // Get geocoding candidate (locationPath) from field mappings
      const geocodingCandidate = getGeocodingCandidate(job);

      // Skip if no location field detected
      if (!geocodingCandidate?.locationField) {
        logger.info("No location field detected, moving to event creation");
        await ProgressTrackingService.skipStage(payload, importJobId, PROCESSING_STAGE.GEOCODE_BATCH);
        await payload.update({
          collection: COLLECTION_NAMES.IMPORT_JOBS,
          id: importJobId,
          data: { stage: PROCESSING_STAGE.CREATE_EVENTS },
        });
        return { output: { skipped: true } };
      }

      const uploadDir = path.resolve(process.cwd(), `${process.env.UPLOAD_DIR ?? "uploads"}/import-files`);
      const filePath = path.join(uploadDir, importFile.filename ?? "");

      // Read ALL rows from file (not batched)
      const rows = readAllRowsFromFile(filePath, {
        sheetIndex: typeof job.sheetIndex === "number" ? job.sheetIndex : 0,
      });

      logger.info("Read rows from file", { totalRows: rows.length });

      // Extract unique locations
      const uniqueLocations = extractUniqueLocations(rows, geocodingCandidate.locationField, logger);

      // Start tracking with unique locations count as total
      await ProgressTrackingService.startStage(
        payload,
        importJobId,
        PROCESSING_STAGE.GEOCODE_BATCH,
        uniqueLocations.size
      );

      // Geocode unique locations
      const { results, successCount, failureCount } = await geocodeUniqueLocations(
        payload,
        importJobId,
        uniqueLocations,
        logger
      );

      // Complete GEOCODE_BATCH stage
      await ProgressTrackingService.completeStage(payload, importJobId, PROCESSING_STAGE.GEOCODE_BATCH);

      // Store geocoding results
      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
        data: {
          geocodingResults: results,
          stage: PROCESSING_STAGE.CREATE_EVENTS,
        },
      });

      logPerformance("Unique location geocoding", Date.now() - startTime, {
        importJobId,
        totalRows: rows.length,
        uniqueLocations: uniqueLocations.size,
        successCount,
        failureCount,
      });

      return {
        output: {
          totalRows: rows.length,
          uniqueLocations: uniqueLocations.size,
          geocodedCount: successCount,
          failedCount: failureCount,
        },
      };
    } catch (error) {
      logError(error, "Unique location geocoding failed", { importJobId });

      // Update job status to failed
      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
        data: { stage: PROCESSING_STAGE.FAILED },
      });

      throw error;
    }
  },
};
