/**
 * Defines the job handler for analyzing duplicates in an imported file.
 *
 * This job performs two types of duplicate detection:
 * 1.  **Internal Duplicates:** Identifies rows within the same import file that are duplicates of each other based on the dataset's unique ID strategy.
 * 2.  **External Duplicates:** Checks for rows in the import file that are duplicates of existing events already in the database for the same dataset.
 *
 * The results, including lists of duplicate rows and a summary, are stored in the corresponding `import-jobs` document.
 * If deduplication is disabled for the dataset, the job skips the analysis and proceeds to the next stage.
 * Upon completion, it transitions the import job to the `SCHEMA_DETECTION` stage.
 *
 * @module
 */
import path from "node:path";

import type { Payload } from "payload";

import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { generateUniqueId } from "@/lib/services/id-generation";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import { readBatchFromFile } from "@/lib/utils/file-readers";
import type { Dataset, ImportFile, ImportJob } from "@/payload-types";

import type { AnalyzeDuplicatesJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";

interface DuplicateAnalysisResult {
  internalDuplicates: Array<{
    rowNumber: number;
    uniqueId: string;
    firstOccurrence?: number;
    count?: number;
  }>;
  externalDuplicates: Array<{
    rowNumber: number;
    uniqueId: string;
    existingEventId: number | string;
  }>;
  totalRows: number;
  uniqueIdMap: Map<string, number>;
}

// Helper functions to reduce complexity
const getJobResources = async (
  payload: Payload,
  importJobId: string | number
): Promise<{ job: ImportJob; dataset: Dataset; importFile: ImportFile }> => {
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

const skipDeduplication = async (
  payload: Payload,
  importJobId: string | number,
  job: ImportJob,
  dataset: Dataset,
  logger: ReturnType<typeof createJobLogger>
): Promise<boolean> => {
  if (!dataset?.deduplicationConfig?.enabled) {
    logger.info("Deduplication disabled for dataset, skipping", { datasetId: dataset?.id });

    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_JOBS,
      id: importJobId,
      data: {
        stage: PROCESSING_STAGE.DETECT_SCHEMA,
        duplicates: {
          strategy: "disabled",
          internal: [],
          external: [],
          summary: ProgressTrackingService.createDeduplicationProgress(
            job.progress?.total ?? 0,
            job.progress?.total ?? 0,
            0,
            0
          ),
        },
      },
    });
    return true;
  }
  return false;
};

const analyzeInternalDuplicates = (
  filePath: string,
  dataset: Dataset,
  job: ImportJob
): {
  internalDuplicates: DuplicateAnalysisResult["internalDuplicates"];
  uniqueIdMap: Map<string, number>;
  totalRows: number;
} => {
  const internalDuplicates: DuplicateAnalysisResult["internalDuplicates"] = [];
  const uniqueIdMap = new Map<string, number>();
  let totalRows = 0;

  const ANALYSIS_BATCH_SIZE = BATCH_SIZES.DUPLICATE_ANALYSIS;
  let batchNumber = 0;

  while (true) {
    const rows = readBatchFromFile(filePath, {
      sheetIndex: job.sheetIndex ?? undefined,
      startRow: batchNumber * ANALYSIS_BATCH_SIZE,
      limit: ANALYSIS_BATCH_SIZE,
    });

    if (rows.length === 0) break;

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

  return { internalDuplicates, uniqueIdMap, totalRows };
};

const analyzeExternalDuplicates = async (
  payload: Payload,
  dataset: Dataset,
  uniqueIdMap: Map<string, number>
): Promise<DuplicateAnalysisResult["externalDuplicates"]> => {
  const uniqueIds = Array.from(uniqueIdMap.keys());
  const externalDuplicates: DuplicateAnalysisResult["externalDuplicates"] = [];

  const CHUNK_SIZE = 1000;
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);

    const existingEvents = await payload.find({
      collection: COLLECTION_NAMES.EVENTS,
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

  return externalDuplicates;
};

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
      // Get all required resources
      const { job, dataset, importFile } = await getJobResources(payload, importJobId);

      // Check if deduplication should be skipped
      const shouldSkip = await skipDeduplication(payload, importJobId, job, dataset, logger);
      if (shouldSkip) {
        return { output: { skipped: true } };
      }

      // Get file path
      const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      const filePath = path.join(uploadDir, importFile.filename ?? "");

      // Analyze internal duplicates
      const { internalDuplicates, uniqueIdMap, totalRows } = analyzeInternalDuplicates(filePath, dataset, job);

      // Analyze external duplicates
      const externalDuplicates = await analyzeExternalDuplicates(payload, dataset, uniqueIdMap);

      // Calculate summary
      const uniqueRows = uniqueIdMap.size;

      // Update job with duplicate analysis
      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
        id: importJobId,
        data: {
          duplicates: {
            strategy: dataset.idStrategy?.type ?? "content-hash",
            internal: internalDuplicates,
            external: externalDuplicates,
            summary: {
              totalRows,
              uniqueRows,
              internalDuplicates: internalDuplicates.length,
              externalDuplicates: externalDuplicates.length,
            },
          },
          stage: PROCESSING_STAGE.DETECT_SCHEMA,
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

      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_JOBS,
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
