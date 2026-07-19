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
import { acquireDatasetImportLease, type DatasetImportLease } from "@/lib/database/dataset-import-lock";
import { cleanupSidecarFiles, streamBatchesFromFile } from "@/lib/ingest/file-readers";
import { ProgressTrackingService } from "@/lib/ingest/progress-tracking";
import { getIngestFilePath } from "@/lib/ingest/upload-path";
import { createJobLogger, logError, logPerformance } from "@/lib/logger";
import { requireRelationId } from "@/lib/utils/relation-id";
import type { Dataset, IngestFile, IngestJob } from "@/payload-types";

import type { CreateEventsBatchJobInput } from "../types/job-inputs";
import type { JobHandlerContext, TaskCallbackArgs } from "../utils/job-context";
import {
  cleanupSidecarsForJob,
  createStandardOnFail,
  loadIngestJob,
  loadJobResources,
  readDuplicateStrategy,
  setJobStage,
} from "../utils/resource-loading";
import {
  parseReviewChecksConfig,
  REVIEW_REASONS,
  setNeedsReview,
  shouldReviewHighRowErrors,
} from "../workflows/review-checks";
import { EventSnapshotStore } from "./create-events-batch/event-snapshots";
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
  sheetIndex,
}: {
  payload: Payload;
  ingestJobId: string | number;
  ingestFile: IngestFile;
  totalEventsCreated: number;
  totalErrors: number;
  storedErrorCount: number;
  sheetIndex?: number | null;
}): Promise<boolean> => {
  const rawReviewChecks = (ingestFile.processingOptions as Record<string, unknown> | null)?.reviewChecks;
  const { config: reviewChecks, error: reviewChecksError } = parseReviewChecksConfig(rawReviewChecks, sheetIndex);
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
  // trackedEventQuota is -1 until markJobCompleted reconciles the reservation to
  // the actual count. Once reconciled (>= 0), release exactly that — 0 when a
  // completed job created no new events — not the original reservation again
  // (the previous `trackedEventQuota > 0` proxy double-released in that case).
  const quotaToRelease = trackedEventQuota >= 0 ? trackedEventQuota : reservedEventQuota;
  if (quotaToRelease <= 0 || eventQuotaFinalized) return;

  try {
    await releaseReservedEventQuota(payload, ingestJobId, quotaToRelease);
  } catch (compensationError) {
    logError(compensationError, "Failed to release reserved event quota", { ingestJobId, quotaToRelease });
  }
};

/**
 * Finalize the terminal COMPLETED stage from inside the retryable handler.
 *
 * The onSuccess task callback (which swallows its errors) used to be the ONLY
 * writer of COMPLETED — a transient failure there stranded a fully-imported job
 * at create-events forever, and there is no stuck-stage recovery for ingest
 * jobs. Calling this in the handler body lets a failure throw → Payload retry
 * (idempotent via cleanupPriorAttempt). reviewHighRowErrors already set
 * NEEDS_REVIEW when it returned true, so only mark COMPLETED otherwise.
 */
const finalizeCompletedStage = async (
  payload: Payload,
  ingestJobId: string | number,
  needsReview: boolean
): Promise<void> => {
  if (!needsReview) {
    await setJobStage(payload, ingestJobId, PROCESSING_STAGE.COMPLETED);
  }
};

interface BatchRunTotals {
  batchNumber: number;
  totalRowsProcessed: number;
  totalEventsCreated: number;
  totalEventsSkipped: number;
  totalEventsUpdated: number;
  totalErrors: number;
  allErrors: Array<{ row: number; error: string }>;
}

/** Stream every batch from the file, process it, and accumulate the run totals. */
const streamAndProcessBatches = async (params: {
  payload: Payload;
  job: IngestJob;
  dataset: Dataset;
  ingestJobId: string | number;
  filePath: string;
  progressJob: IngestJob;
  logger: ReturnType<typeof createJobLogger>;
  snapshotStore?: EventSnapshotStore;
}): Promise<BatchRunTotals> => {
  const { payload, job, dataset, ingestJobId, filePath, progressJob, logger, snapshotStore } = params;
  const totals: BatchRunTotals = {
    batchNumber: 0,
    totalRowsProcessed: 0,
    totalEventsCreated: 0,
    totalEventsSkipped: 0,
    totalEventsUpdated: 0,
    totalErrors: 0,
    allErrors: [],
  };

  for await (const rows of streamBatchesFromFile(filePath, {
    sheetIndex: job.sheetIndex ?? undefined,
    batchSize: BATCH_SIZES.EVENT_CREATION,
  })) {
    // Re-fetch denormalized access fields per batch so an ownership / visibility
    // change mid-import propagates to newly-written rows within one batch's
    // latency, not on the next import.
    const datasetWithCatalog = await payload.findByID({ collection: "datasets", id: dataset.id, depth: 1 });
    const accessFields = extractDenormalizedAccessFields(datasetWithCatalog);

    const batchCtx: ProcessBatchContext = { payload, job, dataset, ingestJobId, accessFields, logger, snapshotStore };
    const { eventsCreated, eventsSkipped, eventsUpdated, errors } = await processEventBatch(
      batchCtx,
      rows,
      totals.totalRowsProcessed
    );

    totals.totalRowsProcessed += rows.length;
    totals.totalEventsCreated += eventsCreated;
    totals.totalEventsSkipped += eventsSkipped;
    totals.totalEventsUpdated += eventsUpdated;
    totals.totalErrors += errors.length;
    if (errors.length > 0) totals.allErrors.push(...errors);

    totals.batchNumber++;

    // Throttle progress DB writes: only every N batches.
    if (totals.batchNumber % PROGRESS_WRITE_INTERVAL === 0) {
      await ProgressTrackingService.updateAndCompleteBatch(
        payload,
        progressJob,
        PROCESSING_STAGE.CREATE_EVENTS,
        totals.totalRowsProcessed,
        totals.batchNumber
      );
    }
  }

  return totals;
};

/**
 * Roll back a failed attempt UNDER the per-dataset lease. `cleanupPriorAttempt`
 * restores update snapshots + deletes fresh inserts, which is only race-safe while
 * the dataset lease is held. The handler's own catch already holds the lease; this
 * variant is for `onFail`, which runs as a separate invocation with no lease of its
 * own. Best-effort: logs and returns if the job can't be loaded.
 */
const cleanupPriorAttemptUnderLease = async (payload: Payload, ingestJobId: string | number): Promise<void> => {
  const log = createJobLogger(String(ingestJobId), "create-events-batch-onFail");
  let job: IngestJob;
  try {
    job = await loadIngestJob(payload, ingestJobId);
  } catch (error) {
    logError(error, "onFail rollback could not load the ingest job", { ingestJobId });
    return;
  }

  const lease = await acquireDatasetImportLease(payload, Number(requireRelationId(job.dataset)), log);
  try {
    await cleanupPriorAttempt(payload, ingestJobId, log);
  } finally {
    await lease.release();
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
      // Backstop rollback (the handler's catch is primary), run under the dataset
      // lease so restoring update snapshots can't race a concurrent import.
      await cleanupPriorAttemptUnderLease(payload, ingestJobId);
    },
  }),
  // Belt-and-suspenders: the handler now writes COMPLETED itself (inside its
  // retryable body). This callback re-asserts it in case the handler returned
  // success without reaching that write, and is intentionally non-throwing —
  // the handler's write is the load-bearing one.
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
    // -1 until markJobCompleted reconciles the reservation; distinguishes "not yet
    // completed" (release the full reservation on failure) from "completed with 0
    // new events" (already reconciled — release 0, not the reservation again).
    let trackedEventQuota = -1;
    let eventQuotaFinalized = false;
    let datasetLease: DatasetImportLease | undefined;
    // True once we hold the dataset lease. Gates the catch's rollback: restoring
    // without the lease would race a concurrent import, so if acquisition itself
    // fails we must NOT roll back — nothing was mutated under serialization anyway.
    let leaseHeld = false;

    try {
      // Set stage for UI progress tracking (workflow controls sequencing)
      await setJobStage(payload, ingestJobId, PROCESSING_STAGE.CREATE_EVENTS);

      const { job, dataset, ingestFile } = await loadJobResources(payload, ingestJobId);
      filePath = getIngestFilePath(ingestFile.filename ?? "");
      sheetIndex = job.sheetIndex ?? 0;

      // Serialize EVERY import on this dataset (see ADR 0041): imports are processed
      // one-at-a-time per dataset, so two never overlap. That is the invariant behind
      // the single-import rollback below — a failed/crashed import reverts its own
      // changes via its retry, with no concurrent import to interfere. Different
      // datasets never contend. Released in the finally below.
      const isUpdateStrategy = readDuplicateStrategy(job) === "update";
      datasetLease = await acquireDatasetImportLease(payload, Number(dataset.id), logger);
      // Now serialized on this dataset, so the catch may safely roll back.
      leaseHeld = true;

      // Clean slate: delete events from any prior failed attempt of this job.
      await cleanupPriorAttempt(payload, ingestJobId, logger);

      // Start CREATE_EVENTS stage with total file rows (stream iterates all rows, including duplicates)
      const totalFileRows = job.duplicates?.summary?.totalRows ?? 0;
      await ProgressTrackingService.startStage(payload, ingestJobId, PROCESSING_STAGE.CREATE_EVENTS, totalFileRows);

      // Re-read the job AFTER startStage so the in-memory snapshot carries the
      // persisted CREATE_EVENTS `startedAt`/`in_progress` status. The job from
      // loadJobResources predates startStage; passing it to the per-batch
      // progress writers would rewrite the stage back to pending/startedAt=null
      // every batch, freezing the progress bar and ETA for the whole stage.
      const progressJob = await loadIngestJob(payload, ingestJobId);

      // Check EVENTS_PER_IMPORT quota before processing
      reservedEventQuota = await checkEventQuotaBeforeProcessing(payload, ingestFile, job);

      // Under the "update" strategy, existing events are overwritten in place.
      // Snapshot their originals so a permanent failure can be rolled back
      // (all-or-nothing); cleanupPriorAttempt / onFail restore from it.
      const snapshotStore = isUpdateStrategy ? new EventSnapshotStore(ingestJobId, logger) : undefined;

      const {
        batchNumber,
        totalRowsProcessed,
        totalEventsCreated,
        totalEventsSkipped,
        totalEventsUpdated,
        totalErrors,
        allErrors,
      } = await streamAndProcessBatches({
        payload,
        job,
        dataset,
        ingestJobId,
        filePath,
        progressJob,
        logger,
        snapshotStore,
      });

      // Final progress write for any remaining batches since the last interval
      await writeFinalProgressIfNeeded(payload, progressJob, batchNumber, totalRowsProcessed);

      await updateJobErrors(payload, ingestJobId, 0, allErrors);
      await ProgressTrackingService.completeStage(payload, ingestJobId, PROCESSING_STAGE.CREATE_EVENTS);

      // Mark job completed: saves results and reconciles the reservation to the actual count.
      trackedEventQuota = await markJobCompleted(payload, ingestJobId, reservedEventQuota, totalEventsUpdated);

      // Review check: high row error rate — pause after completion so results are saved.
      // Zod-validated; malformed config falls back to defaults (rowErrorThreshold, etc.).
      const needsReview = await reviewHighRowErrors({
        payload,
        ingestJobId,
        ingestFile,
        totalEventsCreated,
        totalErrors,
        storedErrorCount: allErrors.length,
        sheetIndex,
      });

      // Finalize the terminal stage inside the retryable handler (see
      // finalizeCompletedStage) rather than the swallow-on-error onSuccess callback.
      await finalizeCompletedStage(payload, ingestJobId, needsReview);

      // The import succeeded, so the in-place updates are final — drop the
      // rollback snapshots. On failure we intentionally leave them for
      // cleanupPriorAttempt / onFail to restore.
      await snapshotStore?.discard();

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

      // Roll back this attempt's in-place updates and fresh inserts HERE, not
      // only in onFail: the process-sheets workflow catches each task's error per
      // sheet, so onFail — and therefore the snapshot/insert rollback — would
      // never run for sheet-based imports, leaving a failed import's overwrites
      // live. Idempotent with the attempt-start cleanup and the onFail backstop.
      // Only when the lease is held (or skip strategy): restoring snapshots without
      // it would race a concurrent import; on an acquisition failure nothing was
      // mutated under serialization, so there is nothing to roll back here.
      if (leaseHeld) {
        try {
          await cleanupPriorAttempt(payload, ingestJobId, logger);
        } catch (cleanupError) {
          logError(cleanupError, "Rollback after event-creation failure did not fully complete", { ingestJobId });
        }
      }

      await releaseEventQuotaOnFailure({
        payload,
        ingestJobId,
        reservedEventQuota,
        trackedEventQuota,
        eventQuotaFinalized,
      });
      await cleanupSidecarsForJob(payload, ingestJobId);

      // Re-throw — Payload retries up to `retries` count, then onFail is a backstop.
      throw error;
    } finally {
      // Release the per-dataset lease AFTER the catch's rollback has run, so the
      // next update import on this dataset always sees fully-reverted originals.
      await datasetLease?.release();
    }
  },
};
