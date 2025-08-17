/**
 * @module Defines the job handler for analyzing duplicates in an imported file.
 *
 * This job performs two types of duplicate detection:
 * 1.  **Internal Duplicates:** Identifies rows within the same import file that are duplicates of each other based on the dataset's unique ID strategy.
 * 2.  **External Duplicates:** Checks for rows in the import file that are duplicates of existing events already in the database for the same dataset.
 *
 * The results, including lists of duplicate rows and a summary, are stored in the corresponding `import-jobs` document.
 * If deduplication is disabled for the dataset, the job skips the analysis and proceeds to the next stage.
 * Upon completion, it transitions the import job to the `SCHEMA_DETECTION` stage.
 */
import path from "path";
import type { Payload } from "payload";

import { BATCH_SIZES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { generateUniqueId } from "@/lib/services/id-generation";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import { readBatchFromFile } from "@/lib/utils/file-readers";

import type { AnalyzeDuplicatesJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";

export const analyzeDuplicatesJob = {
  slug: JOB_TYPES.ANALYZE_DUPLICATES,
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as AnalyzeDuplicatesJobInput["input"];
    const { importJobId } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "analyze-duplicates");
    logger.info("Starting duplicate analysis", { importJobId });
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

      // Check if deduplication is enabled
      if (!dataset.deduplicationConfig?.enabled) {
        logger.info("Deduplication disabled for dataset, skipping", { datasetId: dataset.id });

        // Set empty duplicates structure so other handlers can safely access these fields
        await payload.update({
          collection: "import-jobs",
          id: importJobId,
          data: {
            stage: PROCESSING_STAGE.DETECT_SCHEMA,
            duplicates: {
              strategy: "disabled",
              internal: [],
              external: [],
              summary: ProgressTrackingService.createDeduplicationProgress(
                job.progress?.total || 0,
                job.progress?.total || 0,
                0,
                0
              ),
            },
          },
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

      // Analyze duplicates
      let totalRows = 0;
      const internalDuplicates: any[] = [];
      const uniqueIdMap = new Map<string, number>();

      const ANALYSIS_BATCH_SIZE = BATCH_SIZES.DUPLICATE_ANALYSIS;
      let batchNumber = 0;

      // Process file in batches to build duplicate map
      while (true) {
        const rows = await readBatchFromFile(filePath, {
          sheetIndex: job.sheetIndex ?? undefined,
          startRow: batchNumber * ANALYSIS_BATCH_SIZE,
          limit: ANALYSIS_BATCH_SIZE,
        });

        if (rows.length === 0) break;

        // Generate unique IDs and check for internal duplicates
        for (const [index, row] of rows.entries()) {
          const rowNumber = batchNumber * ANALYSIS_BATCH_SIZE + index;
          const uniqueId = generateUniqueId(row, dataset.idStrategy);

          if (uniqueIdMap.has(uniqueId)) {
            internalDuplicates.push({
              rowNumber,
              uniqueId,
              firstOccurrence: uniqueIdMap.get(uniqueId),
            });
          } else {
            uniqueIdMap.set(uniqueId, rowNumber);
          }
          totalRows++;
        }

        batchNumber++;
      }

      // Check for external duplicates (against existing events)
      const uniqueIds = Array.from(uniqueIdMap.keys());
      const externalDuplicates: any[] = [];

      // Process in chunks to avoid query size limits
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
        const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);

        const existingEvents = await payload.find({
          collection: "events",
          where: {
            dataset: { equals: dataset.id },
            uniqueId: { in: chunk },
          },
          limit: chunk.length,
        });

        for (const event of existingEvents.docs) {
          const rowNumber = uniqueIdMap.get(event.uniqueId);
          if (rowNumber !== undefined) {
            externalDuplicates.push({
              rowNumber,
              uniqueId: event.uniqueId,
              existingEventId: event.id,
            });
          }
        }
      }

      // Calculate summary
      const uniqueRows = uniqueIdMap.size; // Number of distinct unique IDs

      // Update job with duplicate analysis
      await payload.update({
        collection: "import-jobs",
        id: importJobId,
        data: {
          duplicates: {
            strategy: dataset.idStrategy?.type || "content-hash",
            internal: internalDuplicates,
            external: externalDuplicates,
            summary: {
              totalRows,
              uniqueRows,
              internalDuplicates: internalDuplicates.length,
              externalDuplicates: externalDuplicates.length,
            },
          },
          stage: PROCESSING_STAGE.DETECT_SCHEMA, // Continue to schema detection
        },
      });

      logPerformance("Duplicate analysis", Date.now() - startTime, {
        importJobId,
        totalRows,
        uniqueRows,
        internalDuplicates: internalDuplicates.length,
        externalDuplicates: externalDuplicates.length,
      });

      return {
        output: {
          totalRows,
          uniqueRows,
          internalDuplicates: internalDuplicates.length,
          externalDuplicates: externalDuplicates.length,
        },
      };
    } catch (error) {
      logError(error, "Duplicate analysis failed", { importJobId });

      // Update job status to failed
      await payload.update({
        collection: "import-jobs",
        id: importJobId,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errors: [
            {
              row: 0,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          ],
        },
      });

      throw error;
    }
  },
};
