/**
 * @module Defines the job handler for detecting the schema from a batch of imported data.
 *
 * This job processes a batch of rows from the import file to progressively build a schema.
 * It skips rows that were identified as duplicates to ensure the schema is based on unique data.
 *
 * Key responsibilities include:
 * - Using a `ProgressiveSchemaBuilder` to infer data types and properties for each column.
 * - Detecting fields that could be used for geocoding (e.g., address, latitude, longitude).
 * - Storing the evolving schema and the builder's state in the `import-jobs` document.
 *
 * After processing all batches, the import job transitions to the `SCHEMA_VALIDATION` stage.
 */
import path from "path";
import type { Payload } from "payload";

import { BATCH_SIZES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import { ProgressiveSchemaBuilder } from "@/lib/services/schema-builder";
import { getSchemaBuilderState } from "@/lib/types/schema-detection";
import { readBatchFromFile } from "@/lib/utils/file-readers";

import type { SchemaDetectionJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";

export const schemaDetectionJob = {
  slug: JOB_TYPES.DETECT_SCHEMA,
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as SchemaDetectionJobInput["input"];
    const { importJobId, batchNumber } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "schema-detection");
    logger.info("Starting schema detection batch", { importJobId, batchNumber });
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

      const BATCH_SIZE = BATCH_SIZES.SCHEMA_DETECTION;

      // Get duplicate rows to skip
      const duplicateRows = new Set<number>();
      if (Array.isArray(job.duplicates?.internal)) {
        job.duplicates.internal.forEach((d: any) => duplicateRows.add(d.rowNumber));
      }
      if (Array.isArray(job.duplicates?.external)) {
        job.duplicates.external.forEach((d: any) => duplicateRows.add(d.rowNumber));
      }

      // Read batch from file
      const rows = await readBatchFromFile(filePath, {
        sheetIndex: job.sheetIndex ?? undefined,
        startRow: batchNumber * BATCH_SIZE,
        limit: BATCH_SIZE,
      });

      if (rows.length === 0) {
        // No more data, move to schema validation stage
        await payload.update({
          collection: "import-jobs",
          id: importJobId,
          data: { stage: PROCESSING_STAGE.VALIDATE_SCHEMA },
        });
        return { output: { completed: true } };
      }

      // Filter out duplicate rows before schema processing
      const nonDuplicateRows = rows.filter((row, index) => {
        const rowNumber = batchNumber * BATCH_SIZE + index;
        return !duplicateRows.has(rowNumber);
      });

      // Build schema progressively using previous state
      const previousState = getSchemaBuilderState(job);
      const schemaBuilder = new ProgressiveSchemaBuilder(previousState ?? undefined);

      // Process only non-duplicate rows for schema
      if (nonDuplicateRows.length > 0) {
        await schemaBuilder.processBatch(nonDuplicateRows);
      }
      const updatedSchema = await schemaBuilder.getSchema();

      // Detect geocoding candidates from non-duplicate rows
      const geocodingCandidates = nonDuplicateRows.length > 0 ? detectGeocodingFields(nonDuplicateRows) : [];

      // Update job with progress using standardized service
      const hasMore = rows.length === BATCH_SIZE;
      await ProgressTrackingService.updateJobProgress(
        payload,
        importJobId,
        "schema_detection",
        nonDuplicateRows.length,
        job,
        {
          schema: updatedSchema,
          schemaBuilderState: schemaBuilder.getState(),
          geocodingCandidates,
        }
      );

      // Queue next batch if needed
      if (hasMore) {
        await payload.jobs.queue({
          task: JOB_TYPES.DETECT_SCHEMA,
          input: { importJobId, batchNumber: batchNumber + 1 },
        });
      } else {
        // No more data, move to schema validation stage
        await payload.update({
          collection: "import-jobs",
          id: importJobId,
          data: { stage: PROCESSING_STAGE.VALIDATE_SCHEMA },
        });
      }

      logPerformance("Schema detection batch", Date.now() - startTime, {
        importJobId,
        batchNumber,
        rowsProcessed: nonDuplicateRows.length,
        totalRowsInBatch: rows.length,
        duplicatesSkipped: rows.length - nonDuplicateRows.length,
        hasMore,
      });

      return {
        output: {
          batchNumber,
          rowsProcessed: rows.length,
          hasMore,
        },
      };
    } catch (error) {
      logError(error, "Batch processing failed", { importJobId, batchNumber });

      // Update job status to failed
      await payload.update({
        collection: "import-jobs",
        id: importJobId,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errors: [
            {
              row: batchNumber * 10000,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          ],
        },
      });

      throw error;
    }
  },
};

// Detect fields that might contain geocoding data
const detectGeocodingFields = (rows: unknown[]): Record<string, string> => {
  if (rows.length === 0) return {};

  const candidates: Record<string, string> = {};
  const firstRow = rows[0] as Record<string, unknown> | undefined;
  const headers = Object.keys(firstRow ?? {});

  // Common patterns for geocoding fields
  const addressPatterns = [
    /^(address|addr|location|place|street|city|state|zip|postal|country)/i,
    /^(lat|latitude|lng|longitude|coord|geo)/i,
  ];

  for (const header of headers) {
    if (addressPatterns.some((pattern) => pattern.test(header))) {
      // Check if it's a coordinate field
      if (/^(lat|latitude)$/i.test(header)) {
        candidates.latitudeField = header;
      } else if (/^(lng|lon|longitude)$/i.test(header)) {
        candidates.longitudeField = header;
      } else {
        // Might be an address field
        if (!candidates.addressField) {
          candidates.addressField = header;
        }
      }
    }
  }

  // Validate coordinate pairs
  if (candidates.latitudeField && candidates.longitudeField) {
    // Sample a few rows to check if they contain valid coordinates
    const sample = rows.slice(0, Math.min(10, rows.length));
    const validCoords = sample.filter((row) => {
      const lat = parseFloat((row as Record<string, unknown>)[candidates.latitudeField!] as string);
      const lng = parseFloat((row as Record<string, unknown>)[candidates.longitudeField!] as string);
      return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    });

    if (validCoords.length < sample.length * 0.5) {
      // Less than 50% valid coordinates, probably not coordinate fields
      delete candidates.latitudeField;
      delete candidates.longitudeField;
    }
  }

  return candidates;
};
