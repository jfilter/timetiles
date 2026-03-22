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
import { and, eq, inArray } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { cleanupSidecarFiles, getFileRowCount, streamBatchesFromFile } from "@/lib/ingest/file-readers";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { generateUniqueId } from "@/lib/services/id-generation";
import { events as eventsTable } from "@/payload-generated-schema";
import type { Dataset, IngestJob } from "@/payload-types";

import type { AnalyzeDuplicatesJobInput } from "../types/job-inputs";
import type { JobHandlerContext, TaskFailureCallbackArgs } from "../utils/job-context";
import { loadJobResources } from "../utils/resource-loading";
import { getIngestFilePath } from "../utils/upload-path";

interface DuplicateAnalysisResult {
  internalDuplicates: Array<{ rowNumber: number; uniqueId: string; firstOccurrence?: number; count?: number }>;
  externalDuplicates: Array<{ rowNumber: number; uniqueId: string; existingEventId: number | string }>;
  totalRows: number;
  uniqueIdMap: Map<string, number>;
}

// Helper functions to reduce complexity
const skipDeduplication = async (
  payload: Payload,
  ingestJobId: string | number,
  totalRows: number,
  dataset: Dataset,
  logger: ReturnType<typeof createJobLogger>
): Promise<boolean> => {
  if (!dataset?.deduplicationConfig?.enabled) {
    logger.info("Deduplication disabled for dataset, skipping", { datasetId: dataset?.id });

    await payload.update({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      id: ingestJobId,
      data: {
        duplicates: {
          strategy: "disabled",
          internal: [],
          external: [],
          summary: { totalRows, uniqueRows: totalRows, internalDuplicates: 0, externalDuplicates: 0 },
        },
      },
      context: { skipStageTransition: true },
    });
    return true;
  }
  return false;
};

const analyzeInternalDuplicates = async (
  payload: Payload,
  filePath: string,
  dataset: Dataset,
  job: IngestJob
): Promise<{
  internalDuplicates: DuplicateAnalysisResult["internalDuplicates"];
  uniqueIdMap: Map<string, number>;
  totalRows: number;
}> => {
  const internalDuplicates: DuplicateAnalysisResult["internalDuplicates"] = [];
  const uniqueIdMap = new Map<string, number>();
  let totalRows = 0;
  let batchNumber = 0;

  const ANALYSIS_BATCH_SIZE = BATCH_SIZES.DUPLICATE_ANALYSIS;

  for await (const rows of streamBatchesFromFile(filePath, {
    sheetIndex: job.sheetIndex ?? undefined,
    batchSize: ANALYSIS_BATCH_SIZE,
  })) {
    for (const [index, row] of rows.entries()) {
      const rowNumber = totalRows + index;
      const uniqueId = generateUniqueId(row, dataset.idStrategy);

      if (uniqueIdMap.has(uniqueId)) {
        internalDuplicates.push({ rowNumber, uniqueId, firstOccurrence: uniqueIdMap.get(uniqueId) });
      } else {
        uniqueIdMap.set(uniqueId, rowNumber);
      }
    }

    totalRows += rows.length;
    batchNumber++;

    // Update progress after each batch
    await ProgressTrackingService.updateStageProgress(
      payload,
      job,
      PROCESSING_STAGE.ANALYZE_DUPLICATES,
      totalRows,
      rows.length
    );

    await ProgressTrackingService.completeBatch(payload, job, PROCESSING_STAGE.ANALYZE_DUPLICATES, batchNumber);
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

  if (uniqueIds.length === 0) return externalDuplicates;

  const db = payload.db.drizzle;

  // Chunk to stay within PostgreSQL parameter limits
  const CHUNK_SIZE = BATCH_SIZES.DATABASE_CHUNK;
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);

    const rows = await db
      .select({ id: eventsTable.id, uniqueId: eventsTable.uniqueId })
      .from(eventsTable)
      .where(and(eq(eventsTable.dataset, dataset.id), inArray(eventsTable.uniqueId, chunk)));

    for (const row of rows) {
      if (!row.uniqueId) continue;
      const rowNumber = uniqueIdMap.get(row.uniqueId);
      if (rowNumber !== undefined) {
        externalDuplicates.push({ rowNumber, uniqueId: row.uniqueId, existingEventId: row.id });
      }
    }
  }

  return externalDuplicates;
};

// Helper to perform full duplicate analysis
const performDuplicateAnalysis = async (
  payload: Payload,
  ingestJobId: number | string,
  filePath: string,
  dataset: Dataset,
  job: IngestJob,
  fileTotalRows: number
): Promise<{
  internalDuplicates: DuplicateAnalysisResult["internalDuplicates"];
  externalDuplicates: DuplicateAnalysisResult["externalDuplicates"];
  totalRows: number;
  uniqueRows: number;
}> => {
  await ProgressTrackingService.startStage(payload, ingestJobId, PROCESSING_STAGE.ANALYZE_DUPLICATES, fileTotalRows);

  const { internalDuplicates, uniqueIdMap, totalRows } = await analyzeInternalDuplicates(
    payload,
    filePath,
    dataset,
    job
  );

  const externalDuplicates = await analyzeExternalDuplicates(payload, dataset, uniqueIdMap);
  // Subtract external duplicates from unique count since they'll be skipped during event creation
  const uniqueRows = uniqueIdMap.size - externalDuplicates.length;

  await ProgressTrackingService.completeStage(payload, ingestJobId, PROCESSING_STAGE.ANALYZE_DUPLICATES);
  await ProgressTrackingService.updatePostDeduplicationTotals(payload, ingestJobId, uniqueRows);

  return { internalDuplicates, externalDuplicates, totalRows, uniqueRows };
};

// Helper to update job with duplicate results
const updateJobWithDuplicates = async (
  payload: Payload,
  ingestJobId: number | string,
  dataset: Dataset,
  results: {
    internalDuplicates: DuplicateAnalysisResult["internalDuplicates"];
    externalDuplicates: DuplicateAnalysisResult["externalDuplicates"];
    totalRows: number;
    uniqueRows: number;
  }
): Promise<void> => {
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
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
    },
    context: { skipStageTransition: true },
  });
};

/** Initialize progress tracking if stages don't exist yet. */
const initializeProgressIfNeeded = async (
  payload: Payload,
  ingestJobId: string | number,
  job: IngestJob,
  totalRows: number
): Promise<void> => {
  const stagesExist = job.progress?.stages && Object.keys(job.progress.stages).length > 0;
  if (!stagesExist) {
    await ProgressTrackingService.initializeStageProgress(payload, ingestJobId, totalRows);
    const updatedJob = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });
    Object.assign(job, updatedJob);
  }
};

/** Handle the disabled-dedup path: pre-scan for totalRows, skip analysis. Returns result or null. */
const handleDisabledDedup = async (
  payload: Payload,
  ingestJobId: string | number,
  filePath: string,
  job: IngestJob,
  dataset: Dataset,
  logger: ReturnType<typeof createJobLogger>
): Promise<{ output: { success: boolean; skipped: boolean } } | null> => {
  if (dataset?.deduplicationConfig?.enabled) {
    return null;
  }

  // Only pre-scan the file when dedup is disabled (need totalRows for summary)
  const fileTotalRows = await getFileRowCount(filePath, job.sheetIndex ?? 0);
  await initializeProgressIfNeeded(payload, ingestJobId, job, fileTotalRows);

  const shouldSkip = await skipDeduplication(payload, ingestJobId, fileTotalRows, dataset, logger);
  if (shouldSkip) {
    await ProgressTrackingService.skipStage(payload, ingestJobId, PROCESSING_STAGE.ANALYZE_DUPLICATES);
    return { output: { success: true, skipped: true } };
  }

  return null;
};

export const analyzeDuplicatesJob = {
  slug: JOB_TYPES.ANALYZE_DUPLICATES,
  retries: 1,
  outputSchema: [
    { name: "success", type: "checkbox" as const, required: true },
    { name: "totalRows", type: "number" as const },
    { name: "uniqueRows", type: "number" as const },
    { name: "internalDuplicates", type: "number" as const },
    { name: "externalDuplicates", type: "number" as const },
    { name: "skipped", type: "checkbox" as const },
    { name: "reason", type: "text" as const },
  ],
  onFail: async (args: TaskFailureCallbackArgs) => {
    const ingestJobId = (args.input as Record<string, unknown> | undefined)?.ingestJobId;
    if (typeof ingestJobId !== "string" && typeof ingestJobId !== "number") return;
    try {
      await args.req.payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: {
          stage: PROCESSING_STAGE.FAILED,
          errorLog: {
            lastError: typeof args.job.error === "string" ? args.job.error : "Task failed after all retries",
            context: "analyze-duplicates",
          },
        },
        context: { skipStageTransition: true },
      });
    } catch {
      // Best-effort — don't throw in onFail
    }
  },
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as AnalyzeDuplicatesJobInput["input"];
    const { ingestJobId } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "analyze-duplicates");
    logger.info("Starting duplicate analysis", { ingestJobId });
    const startTime = Date.now();

    try {
      const { job, dataset, ingestFile } = await loadJobResources(payload, ingestJobId);
      const filePath = getIngestFilePath(ingestFile.filename ?? "");

      // When dedup is disabled, skip analysis early (uses pre-scan for totalRows summary)
      const skipResult = await handleDisabledDedup(payload, ingestJobId, filePath, job, dataset, logger);
      if (skipResult) {
        return skipResult;
      }

      // Initialize progress tracking if needed (use 0 — streaming will update it)
      await initializeProgressIfNeeded(payload, ingestJobId, job, 0);

      // Perform duplicate analysis — totalRows derived from streaming, no pre-scan needed
      const results = await performDuplicateAnalysis(payload, ingestJobId, filePath, dataset, job, 0);

      // Update job with results
      await updateJobWithDuplicates(payload, ingestJobId, dataset, results);

      logPerformance("Duplicate analysis", Date.now() - startTime, {
        ingestJobId,
        totalRows: results.totalRows,
        uniqueRows: results.uniqueRows,
        internalDuplicates: results.internalDuplicates.length,
        externalDuplicates: results.externalDuplicates.length,
      });

      return {
        output: {
          success: true,
          totalRows: results.totalRows,
          uniqueRows: results.uniqueRows,
          internalDuplicates: results.internalDuplicates.length,
          externalDuplicates: results.externalDuplicates.length,
        },
      };
    } catch (error) {
      logError(error, "Duplicate analysis failed", { ingestJobId });

      // Clean up sidecar CSV files on error (Excel → CSV conversions)
      try {
        const { job: failedJob, ingestFile: failedFile } = await loadJobResources(payload, ingestJobId);
        const failedFilePath = getIngestFilePath(failedFile.filename ?? "");
        cleanupSidecarFiles(failedFilePath, failedJob.sheetIndex ?? 0);
      } catch {
        // Best-effort cleanup — don't mask the original error
      }

      // Re-throw — Payload retries up to `retries` count, then onFail handles failure
      throw error;
    }
  },
};
