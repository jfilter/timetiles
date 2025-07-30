/**
 * @module Defines the job handler for geocoding a batch of addresses from an imported file.
 *
 * This job processes a batch of rows to find their geographic coordinates. It handles two scenarios:
 * 1.  **Address Geocoding:** If an address field was identified, it calls an external geocoding service to convert the address into latitude and longitude.
 * 2.  **Coordinate Validation:** If latitude and longitude columns were provided in the data, it validates and standardizes them.
 *
 * The job skips rows that were marked as duplicates. The results are stored in the `import-jobs` document.
 * It queues subsequent geocoding jobs for remaining batches and, upon completion, transitions the import to the `EVENT_CREATION` stage.
 */
import path from "path";
import type { Payload } from "payload";

import { BATCH_SIZES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { geocodeAddress } from "@/lib/services/geocoding";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import type { GeocodingResult, GeocodingResultsMap } from "@/lib/types/geocoding";
import { getGeocodingCandidate, getGeocodingResults } from "@/lib/types/geocoding";
import { readBatchFromFile } from "@/lib/utils/file-readers";

import type { GeocodingBatchJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";

export const geocodeBatchJob = {
  slug: JOB_TYPES.GEOCODE_BATCH,
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as GeocodingBatchJobInput["input"];
    const { importJobId, batchNumber } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "geocode-batch");
    logger.info("Starting geocoding batch", { importJobId, batchNumber });
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

      // Get geocoding candidates safely
      const geocodingCandidate = getGeocodingCandidate(job);

      // Skip if no geocoding candidates detected
      if (!geocodingCandidate) {
        logger.info("No geocoding candidates, moving to event creation");
        await payload.update({
          collection: "import-jobs",
          id: importJobId,
          data: { stage: PROCESSING_STAGE.CREATE_EVENTS },
        });
        return { output: { skipped: true } };
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
      const GEOCODING_BATCH_SIZE = BATCH_SIZES.GEOCODING;

      // Get duplicate rows to skip
      const duplicateRows = new Set<number>();
      if (job.duplicates?.internal && Array.isArray(job.duplicates.internal)) {
        job.duplicates.internal.forEach((d: any) => duplicateRows.add(d.rowNumber));
      }
      if (job.duplicates?.external && Array.isArray(job.duplicates.external)) {
        job.duplicates.external.forEach((d: any) => duplicateRows.add(d.rowNumber));
      }

      // Read batch of non-duplicate rows
      const rows = await readBatchFromFile(filePath, {
        sheetIndex: job.sheetIndex ?? 0,
        startRow: batchNumber * GEOCODING_BATCH_SIZE,
        limit: GEOCODING_BATCH_SIZE,
      });

      // Process geocoding
      const geocodedResults: GeocodingResult[] = [];
      let geocodedCount = 0;
      let failedCount = 0;
      let processedCount = 0; // Track actual rows processed (non-duplicates)

      for (const [index, row] of rows.entries()) {
        const rowNumber = batchNumber * GEOCODING_BATCH_SIZE + index;

        // Skip duplicate rows
        if (duplicateRows.has(rowNumber)) continue;

        processedCount++; // Count non-duplicate rows

        // Check if row needs geocoding via address field
        if (geocodingCandidate.addressField) {
          const address = row[geocodingCandidate.addressField];

          if (address && typeof address === "string" && address.trim()) {
            try {
              const result = await geocodeAddress(address);
              geocodedResults.push({
                rowNumber,
                coordinates: {
                  lat: result.latitude,
                  lng: result.longitude,
                },
                confidence: result.confidence ?? 0,
                formattedAddress: result.normalizedAddress,
              });
              geocodedCount++;
            } catch (error) {
              // Log geocoding failure but don't stop import
              logger.warn("Geocoding failed for row", { rowNumber, error });
              failedCount++;
            }
          }
        } else if (geocodingCandidate.latitudeField && geocodingCandidate.longitudeField) {
          // Already have coordinates, just validate them
          const lat = parseFloat(row[geocodingCandidate.latitudeField]);
          const lng = parseFloat(row[geocodingCandidate.longitudeField]);

          if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            geocodedResults.push({
              rowNumber,
              coordinates: { lat, lng },
              confidence: 1.0,
              source: "provided",
            });
            geocodedCount++;
          }
        }
      }

      // Store geocoding results using standardized progress service
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
          collection: "import-jobs",
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
        collection: "import-jobs",
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
