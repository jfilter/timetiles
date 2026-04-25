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
import { parseCoordinate } from "@/lib/geospatial/parsing";
import { isValidCoordinate } from "@/lib/geospatial/validation";
import { streamBatchesFromFile } from "@/lib/ingest/file-readers";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { applyTransformsBatch } from "@/lib/ingest/transforms";
import type { IngestGeocodingResultsMap } from "@/lib/ingest/types/geocoding";
import { getIngestGeocodingCandidate } from "@/lib/ingest/types/geocoding";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { hashForLog } from "@/lib/security/hash";
import { createGeocodingService, type GeocodingService } from "@/lib/services/geocoding";
import { normalizeGeocodingAddress } from "@/lib/services/geocoding/cache-manager";
import type { GeocodingBias } from "@/lib/services/geocoding/types";
import { getByPathOrKey } from "@/lib/utils/object-path";
import type { IngestJob } from "@/payload-types";

import type { GeocodingBatchJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";
import { cleanupSidecarsForJob, createStandardOnFail, loadJobResources, setJobStage } from "../utils/resource-loading";
import { buildTransformsFromDataset } from "../utils/transform-builders";
import { getIngestFilePath } from "../utils/upload-path";
import {
  parseReviewChecksConfig,
  REVIEW_REASONS,
  setNeedsReview,
  shouldReviewGeocodingPartial,
} from "../workflows/review-checks";

/** Returns true and increments skippedWithCoords if the row has valid source coordinates. */
const rowHasValidCoords = (
  row: Record<string, unknown>,
  coordinateFields: { latitudeField?: string; longitudeField?: string }
): boolean => {
  if (!coordinateFields.latitudeField || !coordinateFields.longitudeField) return false;
  const lat = parseCoordinate(getByPathOrKey(row, coordinateFields.latitudeField));
  const lng = parseCoordinate(getByPathOrKey(row, coordinateFields.longitudeField));
  return isValidCoordinate(lat, lng);
};

/** Add the normalized form of a string field value to the set. Returns true if added. */
const addNormalizedLocation = (value: unknown, uniqueLocations: Set<string>): boolean => {
  if (!value || typeof value !== "string") return false;
  const normalized = normalizeGeocodingAddress(value);
  if (!normalized) return false;
  uniqueLocations.add(normalized);
  return true;
};

/** Process a single row: skip if it has valid coords, otherwise extract its location string. */
const processRowForLocation = (
  row: Record<string, unknown>,
  locationField: string | undefined,
  locationNameField: string | undefined,
  coordinateFields: { latitudeField?: string; longitudeField?: string },
  uniqueLocations: Set<string>
): { skipped: boolean } => {
  if (rowHasValidCoords(row, coordinateFields)) {
    return { skipped: true };
  }
  const location = locationField ? getByPathOrKey(row, locationField) : undefined;
  if (addNormalizedLocation(location, uniqueLocations)) {
    return { skipped: false };
  }
  const locationName = locationNameField ? getByPathOrKey(row, locationNameField) : undefined;
  addNormalizedLocation(locationName, uniqueLocations);
  return { skipped: false };
};

/**
 * Stream through file batches to extract unique location values without loading all rows into memory.
 * Normalizes addresses so variants like "123 Main St" and "123 MAIN ST" are deduplicated.
 * Returns the normalized forms (which the geocoding cache also uses as keys).
 */
const extractUniqueLocations = async (
  filePath: string,
  sheetIndex: number,
  locationField: string | undefined,
  locationNameField: string | undefined,
  coordinateFields: { latitudeField?: string; longitudeField?: string },
  transforms: IngestTransform[],
  logger: ReturnType<typeof createJobLogger>
): Promise<{ uniqueLocations: Set<string>; totalRows: number; skippedWithCoords: number }> => {
  const uniqueLocations = new Set<string>();
  let totalRows = 0;
  let skippedWithCoords = 0;

  for await (const rows of streamBatchesFromFile(filePath, { sheetIndex, batchSize: BATCH_SIZES.DUPLICATE_ANALYSIS })) {
    const transformedRows = transforms.length > 0 ? applyTransformsBatch(rows, transforms) : rows;
    for (const row of transformedRows) {
      const { skipped } = processRowForLocation(
        row,
        locationField,
        locationNameField,
        coordinateFields,
        uniqueLocations
      );
      if (skipped) skippedWithCoords++;
    }
    totalRows += rows.length;
  }

  logger.info("Extracted unique locations", { totalRows, uniqueLocations: uniqueLocations.size, skippedWithCoords });
  return { uniqueLocations, totalRows, skippedWithCoords };
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
  bias: GeocodingBias | undefined,
  logger: ReturnType<typeof createJobLogger>
): Promise<{
  results: IngestGeocodingResultsMap;
  successCount: number;
  failureCount: number;
  failures: GeocodingFailure[];
}> => {
  const results: IngestGeocodingResultsMap = {};
  const failures: GeocodingFailure[] = [];
  let successCount = 0;
  let failureCount = 0;
  let processed = 0;

  const allLocations = Array.from(locations);

  // Split into chunks for progress tracking granularity
  for (let i = 0; i < allLocations.length; i += PROGRESS_CHUNK_SIZE) {
    const chunk = allLocations.slice(i, i + PROGRESS_CHUNK_SIZE);

    // batchGeocode processes BATCH_CONCURRENCY addresses in parallel via Promise.allSettled
    const batchResult = await geocodingService.batchGeocode(chunk, BATCH_CONCURRENCY, bias);

    // Convert BatchGeocodingResult to IngestGeocodingResultsMap format
    for (const [address, resultOrError] of batchResult.results) {
      if (resultOrError instanceof Error) {
        const errorMessage = resultOrError.message;
        // Log a correlation hash + length instead of the raw address — addresses
        // are often PII and end up in aggregated log storage otherwise.
        logger.warn("Geocoding failed", {
          locationHash: hashForLog(address),
          locationLength: address.length,
          error: errorMessage,
        });
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
      chunk.length
    );
  }

  logger.info("Geocoding completed", { total: locations.size, success: successCount, failed: failureCount });

  return { results, successCount, failureCount, failures };
};

/**
 * Load resources, resolve geocoding candidate, and extract unique locations.
 * Returns early with `{ skipped: true }` if geocoding should be skipped entirely.
 */
/** Read a string property from a config object, returning undefined for non-strings. */
const readStringProp = (obj: Record<string, unknown> | null | undefined, key: string): string | undefined => {
  if (!obj) return undefined;
  const val = obj[key];
  return typeof val === "string" ? val : undefined;
};

/** Fill missing lat/lng fields from a single config object (overrides or geoFieldDetection). */
const fillCoordsFromConfig = (
  config: Record<string, unknown> | null | undefined,
  latField: string | undefined,
  lngField: string | undefined
): { latitudeField: string | undefined; longitudeField: string | undefined } => ({
  latitudeField: latField ?? readStringProp(config, "latitudePath"),
  longitudeField: lngField ?? readStringProp(config, "longitudePath"),
});

/**
 * Resolve coordinate field paths from the geocoding candidate, falling back to
 * the dataset's `fieldMappingOverrides` or `geoFieldDetection` when the schema
 * detection step did not populate `detectedFieldMappings` with lat/lng paths.
 */
const resolveCoordinateFields = (
  geocodingCandidate: ReturnType<typeof getIngestGeocodingCandidate>,
  dataset: unknown
): { latitudeField?: string; longitudeField?: string } => {
  let latitudeField = geocodingCandidate?.latitudeField;
  let longitudeField = geocodingCandidate?.longitudeField;

  if ((latitudeField != null && longitudeField != null) || dataset == null || typeof dataset !== "object") {
    return { latitudeField, longitudeField };
  }

  const ds = dataset as Record<string, unknown>;
  const overrides = ds.fieldMappingOverrides as Record<string, unknown> | null | undefined;
  ({ latitudeField, longitudeField } = fillCoordsFromConfig(overrides, latitudeField, longitudeField));

  if (!latitudeField || !longitudeField) {
    const geo = ds.geoFieldDetection as Record<string, unknown> | null | undefined;
    ({ latitudeField, longitudeField } = fillCoordsFromConfig(geo, latitudeField, longitudeField));
  }

  return { latitudeField, longitudeField };
};

const prepareGeocodingLocations = async (
  payload: Payload,
  ingestJobId: string | number,
  logger: ReturnType<typeof createJobLogger>
): Promise<
  | { skipped: true; skippedWithCoords?: number }
  | {
      skipped: false;
      geocodingService: GeocodingService;
      job: IngestJob;
      ingestFile: { filename?: string | null; processingOptions?: unknown };
      uniqueLocations: Set<string>;
      totalRows: number;
      skippedWithCoords: number;
    }
> => {
  const { job, dataset, ingestFile } = await loadJobResources(payload, ingestJobId);
  const geocodingCandidate = getIngestGeocodingCandidate(job);

  // Skip if neither location field nor location name field detected
  if (!geocodingCandidate?.locationField && !geocodingCandidate?.locationNameField) {
    logger.info("No location field detected, moving to event creation");
    await ProgressTrackingService.skipStage(payload, ingestJobId, PROCESSING_STAGE.GEOCODE_BATCH);
    return { skipped: true };
  }

  // Resolve coordinate fields: use detectedFieldMappings, falling back to dataset config
  const coordinateFields = resolveCoordinateFields(geocodingCandidate, dataset);
  const transforms = buildTransformsFromDataset(dataset);

  const filePath = getIngestFilePath(ingestFile.filename ?? "");
  const sheetIndex = typeof job.sheetIndex === "number" ? job.sheetIndex : 0;

  const { uniqueLocations, totalRows, skippedWithCoords } = await extractUniqueLocations(
    filePath,
    sheetIndex,
    geocodingCandidate.locationField,
    geocodingCandidate.locationNameField,
    coordinateFields,
    transforms,
    logger
  );

  // Skip geocoding entirely if all rows already have coordinates or no locations found
  if (uniqueLocations.size === 0) {
    const reason =
      skippedWithCoords > 0
        ? "All rows have valid source coordinates, skipping geocoding"
        : "No locations to geocode, skipping";
    logger.info(reason, { totalRows, skippedWithCoords });
    await ProgressTrackingService.skipStage(payload, ingestJobId, PROCESSING_STAGE.GEOCODE_BATCH);
    return { skipped: true, skippedWithCoords };
  }

  // Only initialize geocoding service when we actually need to geocode
  const geocodingService = createGeocodingService(payload);

  return { skipped: false, geocodingService, job, ingestFile, uniqueLocations, totalRows, skippedWithCoords };
};

/** Throw if all geocoding failed and no rows have source coordinates. */
const throwIfAllGeocodingFailed = (
  uniqueLocations: Set<string>,
  successCount: number,
  failureCount: number,
  skippedWithCoords: number,
  failures: GeocodingFailure[],
  logger: ReturnType<typeof createJobLogger>
): void => {
  if (uniqueLocations.size > 0 && successCount === 0 && skippedWithCoords === 0) {
    logger.error("All geocoding failed - cannot create events without coordinates", {
      totalLocations: uniqueLocations.size,
      failureCount,
      failures,
    });
    throw new Error(
      `Geocoding failed for all ${failureCount} locations. Please check your geocoding provider configuration.`
    );
  }
};

/** Store geocoding results in the ingest job and complete the processing stage. */
const storeGeocodingResults = async (
  payload: Payload,
  ingestJobId: string | number,
  results: IngestGeocodingResultsMap
): Promise<void> => {
  await ProgressTrackingService.completeStage(payload, ingestJobId, PROCESSING_STAGE.GEOCODE_BATCH);
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: { geocodingResults: results },
  });
};

/** Check if geocoding partial failures warrant a review pause. */
const checkGeocodingReview = async (
  payload: Payload,
  ingestJobId: string | number,
  ingestFile: { processingOptions?: unknown },
  successCount: number,
  failureCount: number
): Promise<{ needsReview: boolean }> => {
  // Zod-validated; malformed configs fall back to defaults.
  const rawReviewChecks = (ingestFile.processingOptions as Record<string, unknown> | null)?.reviewChecks;
  const { config: reviewChecks } = parseReviewChecksConfig(rawReviewChecks);
  const geoCheck = shouldReviewGeocodingPartial(successCount, failureCount, reviewChecks);
  if (geoCheck.needsReview) {
    await setNeedsReview(payload, ingestJobId, REVIEW_REASONS.GEOCODING_PARTIAL, {
      geocoded: successCount,
      failed: failureCount,
      failRate: geoCheck.failRate,
    });
    return { needsReview: true };
  }
  return { needsReview: false };
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

      const skipResult = await prepareGeocodingLocations(payload, ingestJobId, logger);
      if (skipResult.skipped) {
        return { output: skipResult };
      }
      const { geocodingService, job, ingestFile, uniqueLocations, totalRows, skippedWithCoords } = skipResult;

      // Start tracking with unique locations count as total
      await ProgressTrackingService.startStage(
        payload,
        ingestJobId,
        PROCESSING_STAGE.GEOCODE_BATCH,
        uniqueLocations.size
      );

      // Extract geocoding bias from processing options (set by data package or scheduled ingest)
      const processingOptions = (ingestFile.processingOptions as Record<string, unknown> | null) ?? {};
      const geocodingBias = processingOptions.geocodingBias as GeocodingBias | undefined;

      // Geocode unique locations
      const { results, successCount, failureCount, failures } = await geocodeUniqueLocations(
        geocodingService,
        payload,
        job,
        uniqueLocations,
        geocodingBias,
        logger
      );

      // Fail if ALL geocoding failed and no rows have source coordinates
      throwIfAllGeocodingFailed(uniqueLocations, successCount, failureCount, skippedWithCoords, failures, logger);

      // Complete stage and store results
      await storeGeocodingResults(payload, ingestJobId, results);

      logPerformance("Unique location geocoding", Date.now() - startTime, {
        ingestJobId,
        totalRows,
        uniqueLocations: uniqueLocations.size,
        successCount,
        failureCount,
      });

      // Review check: geocoding partial failure (>50% failed)
      const review = await checkGeocodingReview(payload, ingestJobId, ingestFile, successCount, failureCount);
      if (review.needsReview) {
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
