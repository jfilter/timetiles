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

import type { Payload } from "payload";

import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { streamBatchesFromFile } from "@/lib/ingest/file-readers";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { createGeocodingService, type GeocodingService } from "@/lib/services/geocoding";
import { normalizeGeocodingAddress } from "@/lib/services/geocoding/cache-manager";
import type { ImportGeocodingResultsMap } from "@/lib/types/geocoding";
import { getGeocodingCandidate } from "@/lib/types/geocoding";
import type { IngestJob } from "@/payload-types";

import type { GeocodingBatchJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";
import { cleanupSidecarsForJob, createStandardOnFail, loadJobResources, setJobStage } from "../utils/resource-loading";
import { getIngestFilePath } from "../utils/upload-path";
import type { ReviewChecksConfig } from "../workflows/review-checks";
import { REVIEW_REASONS, setNeedsReview, shouldReviewGeocodingPartial } from "../workflows/review-checks";

/**
 * Stream through file batches to extract unique location values without loading all rows into memory.
 * Normalizes addresses so variants like "123 Main St" and "123 MAIN ST" are deduplicated.
 * Returns the normalized forms (which the geocoding cache also uses as keys).
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
        const normalized = normalizeGeocodingAddress(location);
        if (normalized) {
          uniqueLocations.add(normalized);
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

/** Chunk size for progress tracking granularity within batchGeocode calls. */
const PROGRESS_CHUNK_SIZE = 50;

/** Concurrency level passed to batchGeocode (processes this many addresses in parallel). */
const BATCH_CONCURRENCY = 10;

/**
 * Geocode unique locations in parallel using batchGeocode with progress tracking.
 */
const geocodeUniqueLocations = async (
  geocodingService: GeocodingService,
  payload: Payload,
  job: IngestJob,
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

  const allLocations = Array.from(locations);

  // Split into chunks for progress tracking granularity
  for (let i = 0; i < allLocations.length; i += PROGRESS_CHUNK_SIZE) {
    const chunk = allLocations.slice(i, i + PROGRESS_CHUNK_SIZE);

    // batchGeocode processes BATCH_CONCURRENCY addresses in parallel via Promise.allSettled
    const batchResult = await geocodingService.batchGeocode(chunk, BATCH_CONCURRENCY);

    // Convert BatchGeocodingResult to ImportGeocodingResultsMap format
    for (const [address, resultOrError] of batchResult.results) {
      if (resultOrError instanceof Error) {
        const errorMessage = resultOrError.message;
        logger.warn("Geocoding failed", { location: address, error: errorMessage });
        failures.push({ location: address, error: errorMessage });
        failureCount++;
      } else {
        results[address] = {
          coordinates: { lat: resultOrError.latitude, lng: resultOrError.longitude },
          confidence: resultOrError.confidence ?? 0,
          formattedAddress: resultOrError.normalizedAddress,
        };
        successCount++;
      }
    }

    processed += chunk.length;

    // Note: uses updateStageProgress (not updateAndCompleteBatch) because geocoding
    // tracks unique locations rather than file-row batches — there is no batch number.
    await ProgressTrackingService.updateStageProgress(
      payload,
      job,
      PROCESSING_STAGE.GEOCODE_BATCH,
      processed,
      Math.min(PROGRESS_CHUNK_SIZE, locations.size - processed + PROGRESS_CHUNK_SIZE)
    );
  }

  logger.info("Geocoding completed", { total: locations.size, success: successCount, failed: failureCount });

  return { results, successCount, failureCount, failures };
};

export const geocodeBatchJob = {
  slug: JOB_TYPES.GEOCODE_BATCH,
  retries: 3,
  outputSchema: [
    { name: "geocoded", type: "number" as const },
    { name: "failed", type: "number" as const },
    { name: "skipped", type: "number" as const },
    { name: "uniqueLocations", type: "number" as const },
    { name: "needsReview", type: "checkbox" as const },
    { name: "reason", type: "text" as const },
  ],
  // Note: onFail does NOT fire when tasks run inside workflow handlers with Promise.allSettled.
  // Failure marking is handled by processSheets instead. This callback is kept for
  // standalone task execution (outside workflows).
  onFail: createStandardOnFail("geocode-batch"),

  handler: async (context: JobHandlerContext): Promise<{ output: Record<string, unknown> }> => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as GeocodingBatchJobInput["input"];
    const { ingestJobId } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "geocode-unique-locations");
    logger.info("Starting unique location geocoding", { ingestJobId });
    const startTime = Date.now();

    try {
      // Set stage for UI progress tracking (workflow controls sequencing)
      await setJobStage(payload, ingestJobId, PROCESSING_STAGE.GEOCODE_BATCH);

      // Create a geocoding service scoped to this job invocation
      const geocodingService = createGeocodingService(payload);

      const { job, ingestFile } = await loadJobResources(payload, ingestJobId);

      // Get geocoding candidate (locationPath) from field mappings
      const geocodingCandidate = getGeocodingCandidate(job);

      // Skip if no location field detected
      if (!geocodingCandidate?.locationField) {
        logger.info("No location field detected, moving to event creation");
        await ProgressTrackingService.skipStage(payload, ingestJobId, PROCESSING_STAGE.GEOCODE_BATCH);
        return { output: { skipped: true } };
      }

      const filePath = getIngestFilePath(ingestFile.filename ?? "");
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
        ingestJobId,
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

        // Total geocoding failure — throw so processSheets marks the sheet as FAILED
        throw new Error(
          `Geocoding failed for all ${failureCount} locations. Please check your geocoding provider configuration.`
        );
      }

      // Complete GEOCODE_BATCH stage
      await ProgressTrackingService.completeStage(payload, ingestJobId, PROCESSING_STAGE.GEOCODE_BATCH);

      // Store geocoding results (workflow controls stage sequencing)
      await payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: { geocodingResults: results },
      });

      logPerformance("Unique location geocoding", Date.now() - startTime, {
        ingestJobId,
        totalRows,
        uniqueLocations: uniqueLocations.size,
        successCount,
        failureCount,
      });

      // Review check: geocoding partial failure (>50% failed)
      const reviewChecks = (ingestFile.processingOptions as Record<string, unknown> | null)?.reviewChecks as
        | ReviewChecksConfig
        | undefined;
      const geoCheck = shouldReviewGeocodingPartial(successCount, failureCount, reviewChecks);
      if (geoCheck.needsReview) {
        await setNeedsReview(payload, ingestJobId, REVIEW_REASONS.GEOCODING_PARTIAL, {
          geocoded: successCount,
          failed: failureCount,
          failRate: geoCheck.failRate,
        });
        return { output: { needsReview: true, geocoded: successCount, failed: failureCount } };
      }

      return {
        output: { geocoded: successCount, failed: failureCount, skipped: 0, uniqueLocations: uniqueLocations.size },
      };
    } catch (error) {
      logError(error, "Unique location geocoding failed", { ingestJobId });

      // Clean up sidecar CSV files on error (best-effort)
      await cleanupSidecarsForJob(payload, ingestJobId);

      // Re-throw — caught by processSheets try/catch which marks the sheet FAILED
      throw error;
    }
  },
};
