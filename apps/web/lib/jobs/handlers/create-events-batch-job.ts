/**
 * Defines the job handler for creating events from imported data.
 *
 * This single job streams all batches from an import file. For each row, it performs the following:
 * - Skips rows that have been identified as duplicates in the `analyze-duplicates-job`.
 * - Generates a unique ID for the event.
 * - Associates any available geocoding results with the event.
 * - Creates a new document in the `events` collection.
 *
 * The job updates the import job's progress and handles errors for individual rows.
 * Once all batches are processed, it marks the import job as `COMPLETED`.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { extractDenormalizedAccessFields } from "@/lib/collections/catalog-ownership";
import { BATCH_SIZES, COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { cleanupSidecarFiles, streamBatchesFromFile } from "@/lib/ingest/file-readers";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import type { IngestFile, IngestJob } from "@/payload-types";

import type { CreateEventsBatchJobInput } from "../types/job-inputs";
import type { JobHandlerContext, TaskCallbackArgs } from "../utils/job-context";
import { cleanupSidecarsForJob, createStandardOnFail, loadJobResources, setJobStage } from "../utils/resource-loading";
import { getIngestFilePath } from "../utils/upload-path";
import {
  parseReviewChecksConfig,
  REVIEW_REASONS,
  setNeedsReview,
  shouldReviewHighRowErrors,
} from "../workflows/review-checks";
import {
  checkEventQuotaBeforeProcessing,
  cleanupPriorAttempt,
  markJobCompleted,
  releaseReservedEventQuota,
  updateJobErrors,
} from "./create-events-batch/job-completion";
import type { ProcessBatchContext } from "./create-events-batch/process-batch";
import { processEventBatch } from "./create-events-batch/process-batch";

/** Write progress to DB every N batches instead of every batch. */
const PROGRESS_WRITE_INTERVAL = 10;

const writeFinalProgressIfNeeded = async (
  payload: Payload,
  job: IngestJob,
  batchNumber: number,
  totalRowsProcessed: number
): Promise<void> => {
  if (batchNumber % PROGRESS_WRITE_INTERVAL !== 0) {
    await ProgressTrackingService.updateAndCompleteBatch(
      payload,
      job,
      PROCESSING_STAGE.CREATE_EVENTS,
      totalRowsProcessed,
      batchNumber
    );
  }
};

const reviewHighRowErrors = async ({
  payload,
  ingestJobId,
  ingestFile,
  totalEventsCreated,
  totalErrors,
  storedErrorCount,
}: {
  payload: Payload;
  ingestJobId: string | number;
  ingestFile: IngestFile;
  totalEventsCreated: number;
  totalErrors: number;
  storedErrorCount: number;
}): Promise<boolean> => {
  const rawReviewChecks = (ingestFile.processingOptions as Record<string, unknown> | null)?.reviewChecks;
  const { config: reviewChecks, error: reviewChecksError } = parseReviewChecksConfig(rawReviewChecks);
  if (reviewChecksError) {
    // Surface as a per-job error so the UI can show it.
    await updateJobErrors(payload, ingestJobId, storedErrorCount, [{ row: -1, error: reviewChecksError }]);
  }

  const errorCheck = shouldReviewHighRowErrors(totalEventsCreated, totalErrors, reviewChecks);
  if (errorCheck.needsReview) {
    await setNeedsReview(payload, ingestJobId, REVIEW_REASONS.HIGH_ROW_ERROR_RATE, {
      totalEvents: totalEventsCreated,
      errorCount: totalErrors,
      errorRate: errorCheck.errorRate,
    });
  }

  return errorCheck.needsReview;
};

const releaseEventQuotaOnFailure = async ({
  payload,
  ingestJobId,
  reservedEventQuota,
  trackedEventQuota,
  eventQuotaFinalized,
}: {
  payload: Payload;
  ingestJobId: string | number;
  reservedEventQuota: number;
  trackedEventQuota: number;
  eventQuotaFinalized: boolean;
}): Promise<void> => {
  const quotaToRelease = trackedEventQuota > 0 ? trackedEventQuota : reservedEventQuota;
  if (quotaToRelease <= 0 || eventQuotaFinalized) return;

  try {
    await releaseReservedEventQuota(payload, ingestJobId, quotaToRelease);
  } catch (compensationError) {
    logError(compensationError, "Failed to release reserved event quota", { ingestJobId, quotaToRelease });
  }
};

export const createEventsBatchJob = {
  slug: JOB_TYPES.CREATE_EVENTS,
  retries: 1,
  outputSchema: [
    { name: "eventCount", type: "number" as const },
    { name: "duplicatesSkipped", type: "number" as const },
    { name: "needsReview", type: "checkbox" as const },
    { name: "reason", type: "text" as const },
  ],
  onFail: createStandardOnFail("create-events-batch", {
    beforeFail: async (payload, ingestJobId) => {
      const failLogger = createJobLogger(String(ingestJobId), "create-events-batch-onFail");
      await cleanupPriorAttempt(payload, ingestJobId, failLogger);
    },
  }),
  onSuccess: async (args: TaskCallbackArgs) => {
    const ingestJobId = (args.input as Record<string, unknown> | undefined)?.ingestJobId;
    if (typeof ingestJobId !== "string" && typeof ingestJobId !== "number") return;
    try {
      // Don't override NEEDS_REVIEW with COMPLETED — the review check already set the stage
      const job = await args.req.payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });
      if (job?.stage === PROCESSING_STAGE.NEEDS_REVIEW) return;

      await setJobStage(args.req.payload, ingestJobId, PROCESSING_STAGE.COMPLETED);
    } catch (error) {
      logError(error, "Failed to update job stage in onSuccess", { ingestJobId });
    }
  },
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as CreateEventsBatchJobInput["input"];
    const { ingestJobId } = input;

    const jobId = context.job?.id ?? "unknown";
    const logger = createJobLogger(jobId, "create-events-batch");
    logger.info("Starting event creation", { ingestJobId });
    const startTime = Date.now();

    let filePath = "";
    let sheetIndex = 0;
    let reservedEventQuota = 0;
    let trackedEventQuota = 0;
    let eventQuotaFinalized = false;

    try {
      // Set stage for UI progress tracking (workflow controls sequencing)
      await setJobStage(payload, ingestJobId, PROCESSING_STAGE.CREATE_EVENTS);

      const { job, dataset, ingestFile } = await loadJobResources(payload, ingestJobId);
      filePath = getIngestFilePath(ingestFile.filename ?? "");
      sheetIndex = job.sheetIndex ?? 0;

      // Clean slate: delete events from any prior failed attempt of this job.
      await cleanupPriorAttempt(payload, ingestJobId, logger);

      // Start CREATE_EVENTS stage with total file rows (stream iterates all rows, including duplicates)
      const totalFileRows = job.duplicates?.summary?.totalRows ?? 0;
      await ProgressTrackingService.startStage(payload, ingestJobId, PROCESSING_STAGE.CREATE_EVENTS, totalFileRows);

      // Check EVENTS_PER_IMPORT quota before processing
      reservedEventQuota = await checkEventQuotaBeforeProcessing(payload, ingestFile, job);

      const BATCH_SIZE = BATCH_SIZES.EVENT_CREATION;

      let batchNumber = 0;
      let totalRowsProcessed = 0;
      let totalEventsCreated = 0;
      let totalEventsSkipped = 0;
      let totalErrors = 0;
      const allErrors: Array<{ row: number; error: string }> = [];

      for await (const rows of streamBatchesFromFile(filePath, {
        sheetIndex: job.sheetIndex ?? undefined,
        batchSize: BATCH_SIZE,
      })) {
        // Re-fetch denormalized access fields per batch so an ownership /
        // visibility change mid-import propagates to newly-written rows
        // within one batch's latency, not on the next import.
        const datasetWithCatalog = await payload.findByID({ collection: "datasets", id: dataset.id, depth: 1 });
        const accessFields = extractDenormalizedAccessFields(datasetWithCatalog);

        const batchCtx: ProcessBatchContext = { payload, job, dataset, ingestJobId, accessFields, logger };
        const { eventsCreated, eventsSkipped, errors } = await processEventBatch(batchCtx, rows, totalRowsProcessed);

        totalRowsProcessed += rows.length;
        totalEventsCreated += eventsCreated;
        totalEventsSkipped += eventsSkipped;
        totalErrors += errors.length;
        if (errors.length > 0) {
          allErrors.push(...errors);
        }

        batchNumber++;

        // Throttle progress DB writes: only every N batches
        if (batchNumber % PROGRESS_WRITE_INTERVAL === 0) {
          await ProgressTrackingService.updateAndCompleteBatch(
            payload,
            job,
            PROCESSING_STAGE.CREATE_EVENTS,
            totalRowsProcessed,
            batchNumber
          );
        }
      }

      // Final progress write for any remaining batches since the last interval
      await writeFinalProgressIfNeeded(payload, job, batchNumber, totalRowsProcessed);

      // Write all accumulated errors in a single DB operation
      await updateJobErrors(payload, ingestJobId, 0, allErrors);

      // Complete the stage
      await ProgressTrackingService.completeStage(payload, ingestJobId, PROCESSING_STAGE.CREATE_EVENTS);

      // Mark job completed (saves results and reconciles quota)
      await markJobCompleted(payload, ingestJobId, reservedEventQuota);
      trackedEventQuota = totalEventsCreated;

      // Review check: high row error rate — pause after completion so results are saved.
      // Zod-validated; malformed config falls back to defaults (rowErrorThreshold, etc.).
      const needsReview = await reviewHighRowErrors({
        payload,
        ingestJobId,
        ingestFile,
        totalEventsCreated,
        totalErrors,
        storedErrorCount: allErrors.length,
      });

      cleanupSidecarFiles(filePath, sheetIndex);
      eventQuotaFinalized = true;

      logPerformance("Event creation", Date.now() - startTime, {
        ingestJobId,
        totalBatches: batchNumber,
        totalEventsCreated,
        totalEventsSkipped,
        totalErrors,
      });

      return { output: { needsReview, eventCount: totalEventsCreated, duplicatesSkipped: totalEventsSkipped } };
    } catch (error) {
      logError(error, "Event creation failed", { ingestJobId });
      await releaseEventQuotaOnFailure({
        payload,
        ingestJobId,
        reservedEventQuota,
        trackedEventQuota,
        eventQuotaFinalized,
      });
      await cleanupSidecarsForJob(payload, ingestJobId);

      // Re-throw — Payload retries up to `retries` count, then onFail handles failure
      throw error;
    }
  },
};
