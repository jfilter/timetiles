/**
 * Scheduled ingest workflow — automated URL fetch + full pipeline.
 *
 * Triggered by the schedule-manager job or webhooks. Fetches data from
 * a URL, runs dataset-detection, then dispatches one `ingest-process` job per
 * sheet. Runs that import nothing are accounted here; every other run is
 * accounted once by `reconcileRun` after its sheets settle.
 *
 * @module
 * @category Jobs
 */
import type { Payload, WorkflowConfig } from "payload";

import { logError, logger } from "@/lib/logger";
import { sleep } from "@/lib/utils/sleep";
import type { ScheduledIngest } from "@/payload-types";

import {
  loadScheduledIngestForLifecycle,
  updateScheduledIngestSuccess,
} from "../handlers/url-fetch-job/scheduled-ingest-utils";
import type { DatasetDetectionOutput, UrlFetchOutput } from "../types/task-outputs";
import { dispatchSheets } from "./dispatch";

/** Attempts for a non-failure lifecycle write (see reconcileLifecycle). */
const LIFECYCLE_RECONCILE_ATTEMPTS = 5;

/**
 * First backoff step; each further attempt doubles it (0.5s, 1s, 2s, 4s ≈ 7.5s total).
 * Without a pause, every attempt would land inside the same outage.
 */
const LIFECYCLE_RECONCILE_BASE_DELAY_MS = 500;

/**
 * Write a non-failure lifecycle result, retrying with backoff and never rethrowing.
 *
 * Every non-failure exit must go through here: leaving `lastStatus` at "running" strands
 * the schedule in the UI, and only this path resets `currentRetries`.
 *
 * The import itself has already finished at this point. Letting a failed bookkeeping
 * write escape to Payload would record the run as a failure, burn a
 * retry and eventually auto-disable a schedule that is working perfectly.
 *
 * If every attempt fails the schedule stays at `lastStatus: "running"`. That is not
 * lost: the stuck-schedule reaper reconstructs the outcome from the run's own ingest
 * state (see `resolveUnreconciledOutcome` in cleanup-stuck-scheduled-ingests-job).
 */
const reconcileLifecycle = async (
  scheduledIngestId: number,
  context: Record<string, unknown>,
  write: (scheduledIngest: ScheduledIngest) => Promise<void>,
  payload: Payload
): Promise<void> => {
  for (let attempt = 1; attempt <= LIFECYCLE_RECONCILE_ATTEMPTS; attempt++) {
    try {
      const scheduledIngest = await loadScheduledIngestForLifecycle(payload, scheduledIngestId);
      if (scheduledIngest) await write(scheduledIngest);
      return;
    } catch (error) {
      if (attempt === LIFECYCLE_RECONCILE_ATTEMPTS) {
        logError(error, "Scheduled ingest finished but its status could not be reconciled", context);
        return;
      }
      await sleep(LIFECYCLE_RECONCILE_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
};

const recordRunSuccess = async (
  payload: Payload,
  scheduledIngestId: number,
  ingestFileId: string | number | undefined,
  workflowStart: number
): Promise<void> =>
  reconcileLifecycle(
    scheduledIngestId,
    { scheduledIngestId, ingestFileId, outcome: "success" },
    (scheduledIngest) =>
      updateScheduledIngestSuccess(payload, scheduledIngest, ingestFileId, Date.now() - workflowStart),
    payload
  );

export const scheduledIngestWorkflow: WorkflowConfig<"scheduled-ingest"> = {
  slug: "scheduled-ingest",
  label: "Scheduled Ingest",
  queue: "ingest",
  inputSchema: [
    { name: "scheduledIngestId", type: "number", required: true },
    { name: "sourceUrl", type: "text", required: true },
    { name: "authConfig", type: "json" },
    { name: "catalogId", type: "text" },
    { name: "originalName", type: "text", required: true },
    { name: "userId", type: "text" },
    { name: "triggeredBy", type: "text" },
  ],
  concurrency: ({ input }) => `ingest:scheduled:${input.scheduledIngestId}`,
  handler: async ({ job, tasks, req }) => {
    const { scheduledIngestId, sourceUrl } = job.input;
    const workflowStart = Date.now();
    logger.info("scheduled-ingest workflow started", { scheduledIngestId, sourceUrl });

    const fetchResult = (await tasks["url-fetch"]("fetch-url", {
      input: {
        scheduledIngestId: job.input.scheduledIngestId,
        sourceUrl: job.input.sourceUrl,
        authConfig: job.input.authConfig,
        catalogId: job.input.catalogId,
        originalName: job.input.originalName,
        userId: job.input.userId,
        triggeredBy: job.input.triggeredBy,
        deferLifecycleUpdates: true,
      },
    })) as UrlFetchOutput;

    // A source with nothing to report is a successful run, not a failure; failing would
    // burn a retry per empty day until the schedule auto-disables itself.
    if (fetchResult.noRecords) {
      await recordRunSuccess(req.payload, scheduledIngestId, undefined, workflowStart);
      logger.info("scheduled-ingest: source returned no records, nothing to import", { scheduledIngestId });
      return;
    }

    if (!fetchResult.ingestFileId) {
      throw new Error("Scheduled ingest did not create an ingest file.");
    }

    const ingestFileId = fetchResult.ingestFileId;

    if (fetchResult.isDuplicate) {
      await recordRunSuccess(req.payload, scheduledIngestId, ingestFileId, workflowStart);
      logger.info("scheduled-ingest: duplicate content detected, skipping downstream processing", {
        scheduledIngestId,
        ingestFileId,
      });
      return;
    }

    logger.info("scheduled-ingest: URL fetched, detecting sheets", { scheduledIngestId, ingestFileId });

    const detection = (await tasks["dataset-detection"]("detect-sheets", {
      input: { ingestFileId: String(ingestFileId) },
    })) as DatasetDetectionOutput;

    if (detection.noRecords) {
      await recordRunSuccess(req.payload, scheduledIngestId, ingestFileId, workflowStart);
      logger.info("scheduled-ingest: source has no data rows, nothing to import", { scheduledIngestId, ingestFileId });
      return;
    }

    if (!detection.sheets?.length) {
      throw new Error("Scheduled ingest detected no sheets to process.");
    }

    await dispatchSheets(tasks, detection.sheets, {
      ingestFileId: Number(ingestFileId),
      source: "scheduled",
      scheduledIngestId,
    });
    logger.info("scheduled-ingest: sheets dispatched", { scheduledIngestId, ingestFileId });
  },
};
