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
import type { Dataset, ImportJob } from "@/payload-types";

import type { AnalyzeDuplicatesJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";
import { loadJobResources } from "../utils/resource-loading";

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
const skipDeduplication = async (
  payload: Payload,
  importJobId: string | number,
  totalRows: number,
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
          summary: {
            totalRows,
            uniqueRows: totalRows,
            internalDuplicates: 0,
            externalDuplicates: 0,
          },
        },
      },
    });
    return true;
  }
  return false;
};

const analyzeInternalDuplicates = async (
  payload: Payload,
  importJobId: string | number,
  filePath: string,
  dataset: Dataset,
  job: ImportJob
): Promise<{
  internalDuplicates: DuplicateAnalysisResult["internalDuplicates"];
  uniqueIdMap: Map<string, number>;
  totalRows: number;
}> => {
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

    // Update progress after each batch
    await ProgressTrackingService.updateStageProgress(
      payload,
      importJobId,
      PROCESSING_STAGE.ANALYZE_DUPLICATES,
      totalRows,
      rows.length
    );

    await ProgressTrackingService.completeBatch(payload, importJobId, PROCESSING_STAGE.ANALYZE_DUPLICATES, batchNumber);
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

  const CHUNK_SIZE = BATCH_SIZES.DATABASE_CHUNK;
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

// Helper to count total rows in file
const countTotalRows = (filePath: string, sheetIndex: number | null | undefined): number => {
  const ANALYSIS_BATCH_SIZE = BATCH_SIZES.DUPLICATE_ANALYSIS;
  let fileTotalRows = 0;
  let countBatch = 0;

  while (true) {
    const rows = readBatchFromFile(filePath, {
      sheetIndex: sheetIndex ?? undefined,
      startRow: countBatch * ANALYSIS_BATCH_SIZE,
      limit: ANALYSIS_BATCH_SIZE,
    });
    if (rows.length === 0) break;
    fileTotalRows += rows.length;
    countBatch++;
  }

  return fileTotalRows;
};

// Helper to perform full duplicate analysis
const performDuplicateAnalysis = async (
  payload: Payload,
  importJobId: number | string,
  filePath: string,
  dataset: Dataset,
  job: ImportJob,
  fileTotalRows: number
): Promise<{
  internalDuplicates: DuplicateAnalysisResult["internalDuplicates"];
  externalDuplicates: DuplicateAnalysisResult["externalDuplicates"];
  totalRows: number;
  uniqueRows: number;
}> => {
  await ProgressTrackingService.startStage(payload, importJobId, PROCESSING_STAGE.ANALYZE_DUPLICATES, fileTotalRows);

  const { internalDuplicates, uniqueIdMap, totalRows } = await analyzeInternalDuplicates(
    payload,
    importJobId,
    filePath,
    dataset,
    job
  );

  const externalDuplicates = await analyzeExternalDuplicates(payload, dataset, uniqueIdMap);
  const uniqueRows = uniqueIdMap.size;

  await ProgressTrackingService.completeStage(payload, importJobId, PROCESSING_STAGE.ANALYZE_DUPLICATES);
  await ProgressTrackingService.updatePostDeduplicationTotals(payload, importJobId, uniqueRows);

  return { internalDuplicates, externalDuplicates, totalRows, uniqueRows };
};

// Helper to update job with duplicate results
const updateJobWithDuplicates = async (
  payload: Payload,
  importJobId: number | string,
  dataset: Dataset,
  results: {
    internalDuplicates: DuplicateAnalysisResult["internalDuplicates"];
    externalDuplicates: DuplicateAnalysisResult["externalDuplicates"];
    totalRows: number;
    uniqueRows: number;
  }
): Promise<void> => {
  await payload.update({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
    data: {
      duplicates: {
        strategy: dataset.idStrategy?.type ?? "content-hash",
        internal: results.internalDuplicates,
        external: results.externalDuplicates,
        summary: {
          totalRows: results.totalRows,
          uniqueRows: results.uniqueRows,
          internalDuplicates: results.internalDuplicates.length,
          externalDuplicates: results.externalDuplicates.length,
        },
      },
      stage: PROCESSING_STAGE.DETECT_SCHEMA,
    },
  });
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
      const { job, dataset, importFile } = await loadJobResources(payload, importJobId);
      const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      const filePath = path.join(uploadDir, importFile.filename ?? "");

      // Count total rows
      const fileTotalRows = countTotalRows(filePath, job.sheetIndex);

      // Initialize progress tracking if needed (check if stages is empty or doesn't exist)
      const stagesExist = job.progress?.stages && Object.keys(job.progress.stages).length > 0;
      if (!stagesExist) {
        await ProgressTrackingService.initializeStageProgress(payload, importJobId, fileTotalRows);
        // Refetch job to get updated progress structure
        const updatedJob = await payload.findByID({
          collection: COLLECTION_NAMES.IMPORT_JOBS,
          id: importJobId,
        });
        Object.assign(job, updatedJob);
      }

      // Check if deduplication should be skipped
      const shouldSkip = await skipDeduplication(payload, importJobId, fileTotalRows, dataset, logger);
      if (shouldSkip) {
        await ProgressTrackingService.skipStage(payload, importJobId, PROCESSING_STAGE.ANALYZE_DUPLICATES);
        return { output: { skipped: true } };
      }

      // Perform duplicate analysis
      const results = await performDuplicateAnalysis(payload, importJobId, filePath, dataset, job, fileTotalRows);

      // Update job with results
      await updateJobWithDuplicates(payload, importJobId, dataset, results);

      logPerformance("Duplicate analysis", Date.now() - startTime, {
        importJobId,
        totalRows: results.totalRows,
        uniqueRows: results.uniqueRows,
        internalDuplicates: results.internalDuplicates.length,
        externalDuplicates: results.externalDuplicates.length,
      });

      return {
        output: {
          totalRows: results.totalRows,
          uniqueRows: results.uniqueRows,
          internalDuplicates: results.internalDuplicates.length,
          externalDuplicates: results.externalDuplicates.length,
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
