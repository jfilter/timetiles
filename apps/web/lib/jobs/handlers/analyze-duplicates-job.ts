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

import {
  BATCH_SIZES,
  COLLECTION_NAMES,
  JOB_TYPES,
  MAX_UNIQUE_ROWS_PER_SHEET,
  PROCESSING_STAGE,
} from "@/lib/constants/ingest-constants";
import { getFileRowCount, streamBatchesFromFile } from "@/lib/ingest/file-readers";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { applyTransforms } from "@/lib/ingest/transforms";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { generateUniqueId } from "@/lib/services/id-generation";
import { events as eventsTable } from "@/payload-generated-schema";
import type { Dataset, IngestJob } from "@/payload-types";

import type { AnalyzeDuplicatesJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";
import { cleanupSidecarsForJob, createStandardOnFail, loadJobResources } from "../utils/resource-loading";
import { buildTransformsForTargetPath, buildTransformsFromDataset } from "../utils/transform-builders";
import { getIngestFilePath } from "../utils/upload-path";
import {
  checkQuotaForSheet,
  parseReviewChecksConfig,
  REVIEW_REASONS,
  setNeedsReview,
  shouldReviewHighDuplicates,
} from "../workflows/review-checks";

/**
 * Error class carrying a review reason to surface cleanly via setNeedsReview.
 * Distinct from generic errors so the outer handler can branch on it.
 */
class AnalyzeDuplicatesReviewError extends Error {
  constructor(
    message: string,
    readonly reason: string,
    readonly details: Record<string, unknown>
  ) {
    super(message);
    this.name = "AnalyzeDuplicatesReviewError";
  }
}

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

  // Keep duplicate analysis aligned with create-events:
  // - external IDs only need the transforms that materialize the ID path
  // - content-hash IDs must see the fully transformed row
  const idTransforms = ((): ReturnType<typeof buildTransformsFromDataset> => {
    if (dataset.idStrategy?.type === "external") {
      return buildTransformsForTargetPath(dataset, dataset.idStrategy.externalIdPath);
    }
    if (dataset.idStrategy?.type === "content-hash") {
      return buildTransformsFromDataset(dataset);
    }
    return [];
  })();

  for await (const rows of streamBatchesFromFile(filePath, {
    sheetIndex: job.sheetIndex ?? undefined,
    batchSize: ANALYSIS_BATCH_SIZE,
  })) {
    for (const [index, row] of rows.entries()) {
      const rowNumber = totalRows + index;
      const idRow = idTransforms.length > 0 ? applyTransforms(row, idTransforms) : row;
      const uniqueId = generateUniqueId(idRow, dataset);

      if (uniqueIdMap.has(uniqueId)) {
        internalDuplicates.push({ rowNumber, uniqueId, firstOccurrence: uniqueIdMap.get(uniqueId) });
      } else {
        uniqueIdMap.set(uniqueId, rowNumber);
      }
    }

    totalRows += rows.length;
    batchNumber++;

    // Heap guard: a tall-narrow CSV could keep producing unique IDs until the
    // map exhausts memory. Surface a review — the user is expected to split
    // the file and retry rather than silently OOM the worker.
    if (uniqueIdMap.size > MAX_UNIQUE_ROWS_PER_SHEET) {
      throw new AnalyzeDuplicatesReviewError(
        `File has more than ${MAX_UNIQUE_ROWS_PER_SHEET} unique rows; duplicate analysis aborted`,
        REVIEW_REASONS.FILE_TOO_LARGE,
        { uniqueRowsSeen: uniqueIdMap.size, maxUniqueRows: MAX_UNIQUE_ROWS_PER_SHEET, rowsScanned: totalRows }
      );
    }

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
  // External duplicates are only skipped under "skip" strategy; under "update" they are
  // written as updates (see process-batch.ts) and must count toward the quota/progress total.
  const duplicateStrategy = dataset.idStrategy?.duplicateStrategy;
  const uniqueRows = duplicateStrategy === "update" ? uniqueIdMap.size : uniqueIdMap.size - externalDuplicates.length;

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
  });
};

/**
 * Append a single config-error row to `job.errors` using `row: -1` as the
 * sentinel for "not tied to a specific row". Best-effort — a failure to persist
 * the note should not block the analysis pipeline.
 */
const recordConfigError = async (payload: Payload, ingestJobId: string | number, message: string): Promise<void> => {
  try {
    const job = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });
    const existingErrors = job?.errors ?? [];
    await payload.update({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      id: ingestJobId,
      data: { errors: [...existingErrors, { row: -1, error: message }] },
    });
  } catch (error) {
    logError(error, "Failed to record config error on ingest job", { ingestJobId });
  }
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
): Promise<{ output: { skipped: boolean } } | null> => {
  if (dataset?.deduplicationConfig?.enabled) {
    return null;
  }

  // Only pre-scan the file when dedup is disabled (need totalRows for summary)
  const fileTotalRows = await getFileRowCount(filePath, job.sheetIndex ?? 0);
  await initializeProgressIfNeeded(payload, ingestJobId, job, fileTotalRows);

  const shouldSkip = await skipDeduplication(payload, ingestJobId, fileTotalRows, dataset, logger);
  if (shouldSkip) {
    await ProgressTrackingService.skipStage(payload, ingestJobId, PROCESSING_STAGE.ANALYZE_DUPLICATES);
    return { output: { skipped: true } };
  }

  return null;
};

export const analyzeDuplicatesJob = {
  slug: JOB_TYPES.ANALYZE_DUPLICATES,
  retries: 1,
  outputSchema: [
    { name: "totalRows", type: "number" as const },
    { name: "uniqueRows", type: "number" as const },
    { name: "internalDuplicates", type: "number" as const },
    { name: "externalDuplicates", type: "number" as const },
    { name: "needsReview", type: "checkbox" as const },
    { name: "skipped", type: "checkbox" as const },
    { name: "reason", type: "text" as const },
  ],
  onFail: createStandardOnFail("analyze-duplicates"),
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

      // Load per-source review check overrides (Zod-validated; malformed configs
      // fall back to defaults and surface a row in `job.errors` so the UI can show it).
      const rawReviewChecks = (ingestFile.processingOptions as Record<string, unknown> | null)?.reviewChecks;
      const { config: reviewChecks, error: reviewChecksError } = parseReviewChecksConfig(rawReviewChecks);
      if (reviewChecksError) {
        await recordConfigError(payload, ingestJobId, reviewChecksError);
      }

      // Review check: high duplicate rate (>80%)
      const dupCheck = shouldReviewHighDuplicates(results.totalRows, results.uniqueRows, reviewChecks);
      if (dupCheck.needsReview) {
        await setNeedsReview(payload, ingestJobId, REVIEW_REASONS.HIGH_DUPLICATE_RATE, {
          totalRows: results.totalRows,
          uniqueRows: results.uniqueRows,
          duplicateRate: dupCheck.duplicateRate,
        });
        return {
          output: {
            needsReview: true,
            totalRows: results.totalRows,
            uniqueRows: results.uniqueRows,
            internalDuplicates: results.internalDuplicates.length,
            externalDuplicates: results.externalDuplicates.length,
          },
        };
      }

      // Review check: quota
      const quotaCheck = await checkQuotaForSheet(payload, ingestJobId, results.uniqueRows);
      if (!quotaCheck.allowed) {
        await setNeedsReview(payload, ingestJobId, REVIEW_REASONS.QUOTA_EXCEEDED, quotaCheck);
        return {
          output: {
            needsReview: true,
            totalRows: results.totalRows,
            uniqueRows: results.uniqueRows,
            internalDuplicates: results.internalDuplicates.length,
            externalDuplicates: results.externalDuplicates.length,
          },
        };
      }

      return {
        output: {
          totalRows: results.totalRows,
          uniqueRows: results.uniqueRows,
          internalDuplicates: results.internalDuplicates.length,
          externalDuplicates: results.externalDuplicates.length,
        },
      };
    } catch (error) {
      // Review errors are expected user-facing outcomes (e.g. file exceeds the
      // unique-row cap). Surface via setNeedsReview rather than retrying —
      // this produces a clean UI message instead of a 500.
      if (error instanceof AnalyzeDuplicatesReviewError) {
        logger.warn("Duplicate analysis stopped for review", {
          ingestJobId,
          reason: error.reason,
          details: error.details,
        });
        await setNeedsReview(payload, ingestJobId, error.reason, error.details);
        return { output: { needsReview: true, reason: error.reason } };
      }

      logError(error, "Duplicate analysis failed", { ingestJobId });

      // Clean up sidecar CSV files on error (Excel → CSV conversions)
      await cleanupSidecarsForJob(payload, ingestJobId);

      // Re-throw — Payload retries up to `retries` count, then onFail handles failure
      throw error;
    }
  },
};
