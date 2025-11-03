/**
 * Defines the job handler for geocoding a batch of addresses from an imported file.
 *
 * This job processes a batch of rows to find their geographic coordinates. It handles two scenarios:
 * 1.  **Address Geocoding:** If an address field was identified, it calls an external geocoding service to convert the address into latitude and longitude.
 * 2.  **Coordinate Validation:** If latitude and longitude columns were provided in the data, it validates and standardizes them.
 *
 * The job skips rows that were marked as duplicates. The results are stored in the `import-jobs` document.
 * It queues subsequent geocoding jobs for remaining batches and, upon completion, transitions the import to the `EVENT_CREATION` stage.
 *
 * @module
 * @category Jobs
 */
import path from "node:path";

import type { Payload } from "payload";

import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { geocodeAddress } from "@/lib/services/geocoding";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import type { GeocodingResult, GeocodingResultsMap } from "@/lib/types/geocoding";
import { getGeocodingCandidate, getGeocodingResults } from "@/lib/types/geocoding";
import { readBatchFromFile } from "@/lib/utils/file-readers";
import type { Dataset, ImportFile, ImportJob } from "@/payload-types";

import type { GeocodingBatchJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";

interface DuplicateInfo {
  rowNumber: number;
}

/**
 * Extract duplicate row numbers from job data.
 */
const getDuplicateRows = (job: ImportJob): Set<number> => {
  const duplicateRows = new Set<number>();

  if (job.duplicates?.internal && Array.isArray(job.duplicates.internal)) {
    job.duplicates.internal.forEach((d: unknown) => {
      if (typeof d === "object" && d !== null && "rowNumber" in d) {
        const duplicate = d as DuplicateInfo;
        duplicateRows.add(duplicate.rowNumber);
      }
    });
  }

  if (job.duplicates?.external && Array.isArray(job.duplicates.external)) {
    job.duplicates.external.forEach((d: unknown) => {
      if (typeof d === "object" && d !== null && "rowNumber" in d) {
        const duplicate = d as DuplicateInfo;
        duplicateRows.add(duplicate.rowNumber);
      }
    });
  }

  return duplicateRows;
};

/**
 * Process geocoding for a single row.
 */
const processRowGeocoding = async (
  row: Record<string, unknown>,
  rowNumber: number,
  geocodingCandidate: {
    addressField?: string;
    latitudeField?: string;
    longitudeField?: string;
  },
  logger: ReturnType<typeof createJobLogger>
): Promise<GeocodingResult | null> => {
  // Check if row needs geocoding via address field
  if (geocodingCandidate.addressField) {
    const address = row[geocodingCandidate.addressField];

    if (address && typeof address === "string" && address.trim()) {
      try {
        const result = await geocodeAddress(address);
        return {
          rowNumber,
          coordinates: {
            lat: result.latitude,
            lng: result.longitude,
          },
          confidence: result.confidence ?? 0,
          formattedAddress: result.normalizedAddress,
        };
      } catch (error) {
        logger.warn("Geocoding failed for row", { rowNumber, error });
        return null;
      }
    }
  } else if (geocodingCandidate.latitudeField && geocodingCandidate.longitudeField) {
    // Already have coordinates, just validate them
    const latValue = row[geocodingCandidate.latitudeField];
    const lngValue = row[geocodingCandidate.longitudeField];

    const lat = typeof latValue === "number" ? latValue : Number.parseFloat(String(latValue));
    const lng = typeof lngValue === "number" ? lngValue : Number.parseFloat(String(lngValue));

    if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return {
        rowNumber,
        coordinates: { lat, lng },
        confidence: 1.0,
        source: "provided",
      };
    }
  }

  return null;
};

/**
 * Process a batch of rows for geocoding.
 */
const processBatch = async (
  rows: Record<string, unknown>[],
  batchNumber: number,
  duplicateRows: Set<number>,
  geocodingCandidate: {
    addressField?: string;
    latitudeField?: string;
    longitudeField?: string;
  },
  logger: ReturnType<typeof createJobLogger>
): Promise<{
  geocodedResults: GeocodingResult[];
  geocodedCount: number;
  failedCount: number;
  processedCount: number;
}> => {
  const geocodedResults: GeocodingResult[] = [];
  let geocodedCount = 0;
  let failedCount = 0;
  let processedCount = 0;
  const GEOCODING_BATCH_SIZE = BATCH_SIZES.GEOCODING;

  for (const [index, row] of rows.entries()) {
    const rowNumber = batchNumber * GEOCODING_BATCH_SIZE + index;

    // Skip duplicate rows
    if (duplicateRows.has(rowNumber)) continue;

    processedCount++;

    const result = await processRowGeocoding(row, rowNumber, geocodingCandidate, logger);

    if (result) {
      geocodedResults.push(result);
      geocodedCount++;
    } else if (geocodingCandidate.addressField && row[geocodingCandidate.addressField]) {
      // Only count as failed if there was an address to geocode
      failedCount++;
    }
  }

  return { geocodedResults, geocodedCount, failedCount, processedCount };
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
    const { importJobId, batchNumber } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "geocode-batch");
    logger.info("Starting geocoding batch", { importJobId, batchNumber });
    const startTime = Date.now();

    try {
      const { job, importFile } = await getJobResources(payload, importJobId);

      // Get geocoding candidates safely
      const geocodingCandidate = getGeocodingCandidate(job);

      // Skip if no geocoding candidates detected
      if (!geocodingCandidate) {
        logger.info("No geocoding candidates, moving to event creation");
        await payload.update({
          collection: COLLECTION_NAMES.IMPORT_JOBS,
          id: importJobId,
          data: { stage: PROCESSING_STAGE.CREATE_EVENTS },
        });
        return { output: { skipped: true } };
      }

      const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES ?? "");
      const filePath = path.join(uploadDir, importFile.filename ?? "");
      const GEOCODING_BATCH_SIZE = BATCH_SIZES.GEOCODING;

      // Get duplicate rows to skip
      const duplicateRows = getDuplicateRows(job);

      // Read batch of rows
      const rows = readBatchFromFile(filePath, {
        sheetIndex: typeof job.sheetIndex === "number" ? job.sheetIndex : 0,
        startRow: batchNumber * GEOCODING_BATCH_SIZE,
        limit: GEOCODING_BATCH_SIZE,
      });

      // Process geocoding
      const { geocodedResults, geocodedCount, failedCount, processedCount } = await processBatch(
        rows,
        batchNumber,
        duplicateRows,
        geocodingCandidate,
        logger
      );

      // Store geocoding results
      const currentResults: GeocodingResultsMap = getGeocodingResults(job);
      const updatedResults: GeocodingResultsMap = {
        ...currentResults,
        ...Object.fromEntries(geocodedResults.map((r) => [r.rowNumber.toString(), r])),
      };

      await ProgressTrackingService.updateGeocodingProgress(payload, importJobId, processedCount, job, updatedResults);

      // Continue with next batch or move to event creation
      const hasMore = rows.length === GEOCODING_BATCH_SIZE;
      if (hasMore) {
        await payload.jobs.queue({
          task: JOB_TYPES.GEOCODE_BATCH,
          input: { importJobId, batchNumber: batchNumber + 1 },
        });
      } else {
        await payload.update({
          collection: COLLECTION_NAMES.IMPORT_JOBS,
          id: importJobId,
          data: { stage: PROCESSING_STAGE.CREATE_EVENTS },
        });
      }

      logPerformance("Geocoding batch", Date.now() - startTime, {
        importJobId,
        batchNumber,
        geocodedCount,
        failedCount,
      });

      return {
        output: {
          batchNumber,
          geocodedCount,
          failedCount,
          hasMore,
        },
      };
    } catch (error) {
      logError(error, "Geocoding batch failed", { importJobId, batchNumber });

      // Update job status to failed
      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errors: [
            {
              row: batchNumber * 100,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          ],
        },
      });

      throw error;
    }
  },
};
