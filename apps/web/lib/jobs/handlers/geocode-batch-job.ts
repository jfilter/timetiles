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
/* eslint-disable sonarjs/max-lines-per-function -- Batch geocoding requires sequential processing steps */
import type { Payload } from "payload";

import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { cleanupSidecarFiles, streamBatchesFromFile } from "@/lib/import/file-readers";
import { ProgressTrackingService } from "@/lib/import/progress-tracking";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { GeocodingService } from "@/lib/services/geocoding";
import type { ImportGeocodingResultsMap } from "@/lib/types/geocoding";
import { getGeocodingCandidate } from "@/lib/types/geocoding";
import type { ImportJob } from "@/payload-types";

import type { GeocodingBatchJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";
import { loadJobResources } from "../utils/resource-loading";
import { getImportFilePath } from "../utils/upload-path";

/**
 * Stream through file batches to extract unique location values without loading all rows into memory.
 */
const extractUniqueLocations = async (
  filePath: string,
  sheetIndex: number,
  locationField: string,
  logger: ReturnType<typeof createJobLogger>
): Promise<{ uniqueLocations: Set<string>; totalRows: number }> => {
  const uniqueLocations = new Set<string>();
  let totalRows = 0;

  for await (const rows of streamBatchesFromFile(filePath, { sheetIndex, batchSize: BATCH_SIZES.DUPLICATE_ANALYSIS })) {
    for (const row of rows) {
      const location = row[locationField];
      if (location && typeof location === "string") {
        const trimmed = location.trim();
        if (trimmed) {
          uniqueLocations.add(trimmed);
        }
      }
    }
    totalRows += rows.length;
  }

  logger.info("Extracted unique locations", { totalRows, uniqueLocations: uniqueLocations.size });
  return { uniqueLocations, totalRows };
};

/**
 * Information about a failed geocoding attempt.
 */
interface GeocodingFailure {
  location: string;
  error: string;
}

/**
 * Geocode unique locations with progress tracking.
 */
const geocodeUniqueLocations = async (
  geocodingService: GeocodingService,
  payload: Payload,
  job: ImportJob,
  locations: Set<string>,
  logger: ReturnType<typeof createJobLogger>
): Promise<{
  results: ImportGeocodingResultsMap;
  successCount: number;
  failureCount: number;
  failures: GeocodingFailure[];
}> => {
  const results: ImportGeocodingResultsMap = {};
  const failures: GeocodingFailure[] = [];
  let successCount = 0;
  let failureCount = 0;
  let processed = 0;

  for (const location of locations) {
    try {
      const result = await geocodingService.geocode(location);
      results[location] = {
        coordinates: { lat: result.latitude, lng: result.longitude },
        confidence: result.confidence ?? 0,
        formattedAddress: result.normalizedAddress,
      };
      successCount++;
      logger.debug("Geocoded location", { location, result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.warn("Geocoding failed", { location, error: errorMessage });
      failures.push({ location, error: errorMessage });
      failureCount++;
    }

    processed++;

    // Update progress every 10 locations or on completion
    if (processed % 10 === 0 || processed === locations.size) {
      await ProgressTrackingService.updateStageProgress(
        payload,
        job,
        PROCESSING_STAGE.GEOCODE_BATCH,
        processed,
        Math.min(10, locations.size - processed + 10)
      );
    }
  }

  logger.info("Geocoding completed", { total: locations.size, success: successCount, failed: failureCount });

  return { results, successCount, failureCount, failures };
};

export const geocodeBatchJob = {
  slug: JOB_TYPES.GEOCODE_BATCH,

  handler: async (context: JobHandlerContext): Promise<{ output: Record<string, unknown> }> => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as GeocodingBatchJobInput["input"];
    const { importJobId } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "geocode-unique-locations");
    logger.info("Starting unique location geocoding", { importJobId });
    const startTime = Date.now();

    try {
      // Create a geocoding service scoped to this job invocation
      const geocodingService = new GeocodingService(payload);

      const { job, importFile } = await loadJobResources(payload, importJobId);

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

      const filePath = getImportFilePath(importFile.filename ?? "");
      const sheetIndex = typeof job.sheetIndex === "number" ? job.sheetIndex : 0;

      // Stream file to extract unique locations (memory-efficient)
      const { uniqueLocations, totalRows } = await extractUniqueLocations(
        filePath,
        sheetIndex,
        geocodingCandidate.locationField,
        logger
      );

      // Start tracking with unique locations count as total
      await ProgressTrackingService.startStage(
        payload,
        importJobId,
        PROCESSING_STAGE.GEOCODE_BATCH,
        uniqueLocations.size
      );

      // Geocode unique locations
      const { results, successCount, failureCount, failures } = await geocodeUniqueLocations(
        geocodingService,
        payload,
        job,
        uniqueLocations,
        logger
      );

      // Fail the job if ALL geocoding failed - events without coordinates are useless on a map
      if (uniqueLocations.size > 0 && successCount === 0) {
        logger.error("All geocoding failed - cannot create events without coordinates", {
          totalLocations: uniqueLocations.size,
          failureCount,
          failures,
        });

        // Build detailed error message with failed locations (limit to first 5 for readability)
        const failedLocationsPreview = failures.slice(0, 5).map((f) => `"${f.location}": ${f.error}`);
        const moreCount = failures.length > 5 ? ` (and ${failures.length - 5} more)` : "";
        const errorMessage = `Geocoding failed for all ${failureCount} locations. Please check your geocoding provider configuration in the admin panel.`;
        const detailedError = `${errorMessage}\n\nFailed locations${moreCount}:\n${failedLocationsPreview.join("\n")}`;

        await payload.update({
          collection: COLLECTION_NAMES.IMPORT_JOBS,
          id: importJobId,
          data: {
            stage: PROCESSING_STAGE.FAILED,
            errorLog: {
              error: errorMessage,
              context: "geocode-batch",
              failedLocations: failureCount,
              failures: failures.slice(0, 10), // Store first 10 failures with details
            },
          },
        });

        // Also update the import file status with error message (user-facing)
        const { importFile } = await loadJobResources(payload, importJobId);
        await payload.update({
          collection: COLLECTION_NAMES.IMPORT_FILES,
          id: importFile.id,
          data: { status: "failed", errorLog: detailedError },
        });

        return {
          output: {
            failed: true,
            reason: "All geocoding failed",
            totalLocations: uniqueLocations.size,
            failedCount: failureCount,
          },
        };
      }

      // Complete GEOCODE_BATCH stage
      await ProgressTrackingService.completeStage(payload, importJobId, PROCESSING_STAGE.GEOCODE_BATCH);

      // Store geocoding results
      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
        data: { geocodingResults: results, stage: PROCESSING_STAGE.CREATE_EVENTS },
      });

      logPerformance("Unique location geocoding", Date.now() - startTime, {
        importJobId,
        totalRows,
        uniqueLocations: uniqueLocations.size,
        successCount,
        failureCount,
      });

      return {
        output: {
          totalRows,
          uniqueLocations: uniqueLocations.size,
          geocodedCount: successCount,
          failedCount: failureCount,
        },
      };
    } catch (error) {
      logError(error, "Unique location geocoding failed", { importJobId });

      // Clean up sidecar CSV files on error (best-effort)
      try {
        const { job: failedJob, importFile: failedFile } = await loadJobResources(payload, importJobId);
        const failedFilePath = getImportFilePath(failedFile.filename ?? "");
        cleanupSidecarFiles(failedFilePath, failedJob.sheetIndex ?? 0);
      } catch {
        // Best-effort cleanup
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Update job status to failed with error details
      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
        data: { stage: PROCESSING_STAGE.FAILED, errorLog: { error: errorMessage, context: "geocode-batch" } },
      });

      throw error;
    }
  },
};
