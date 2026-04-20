/**
 * Scheduled ingest workflow — automated URL fetch + full pipeline.
 *
 * Triggered by the schedule-manager job or webhooks. Fetches data from
 * a URL, runs dataset-detection, then processes all sheets in parallel.
 *
 * @module
 * @category Jobs
 */
import type { Payload, WorkflowConfig } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logger } from "@/lib/logger";

import {
  loadScheduledIngestForLifecycle,
  updateScheduledIngestFailure,
  updateScheduledIngestSuccess,
} from "../handlers/url-fetch-job/scheduled-ingest-utils";
import type { DatasetDetectionOutput, UrlFetchOutput } from "../types/task-outputs";
import { updateIngestFileStatus } from "./completion";
import { processSheets } from "./process-sheets";

const getReviewReason = (reviewJob: { reviewReason?: unknown }): string =>
  typeof reviewJob.reviewReason === "string" && reviewJob.reviewReason.length > 0
    ? reviewJob.reviewReason
    : "manual review required";

const getFailedJobError = (failedJob: { errorLog?: unknown; errors?: unknown }): string | null => {
  const errorLog = failedJob.errorLog;
  if (
    errorLog &&
    typeof errorLog === "object" &&
    "lastError" in errorLog &&
    typeof errorLog.lastError === "string" &&
    errorLog.lastError.length > 0
  ) {
    return errorLog.lastError;
  }

  const errors = Array.isArray(failedJob.errors) ? failedJob.errors : [];
  const firstError = errors[0];
  if (firstError && typeof firstError === "object" && "error" in firstError && typeof firstError.error === "string") {
    return firstError.error;
  }

  return null;
};

const buildScheduledIngestFailure = async (
  payload: Pick<Payload, "findByID" | "find">,
  ingestFileId: string | number
): Promise<Error | null> => {
  const ingestFile = await payload.findByID({
    collection: COLLECTION_NAMES.INGEST_FILES,
    id: String(ingestFileId),
    overrideAccess: true,
  });

  if (!ingestFile) {
    return new Error(`Ingest file ${String(ingestFileId)} not found after scheduled ingest run.`);
  }

  if (ingestFile.status === "completed") {
    return null;
  }

  const ingestJobs = await payload.find({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    where: { ingestFile: { equals: ingestFileId } },
    pagination: false,
    overrideAccess: true,
  });

  const reviewJob = ingestJobs.docs.find(
    (doc: { stage?: string | null }) => doc.stage === PROCESSING_STAGE.NEEDS_REVIEW
  );
  if (reviewJob) {
    return new Error(`Scheduled ingest paused for review: ${getReviewReason(reviewJob)}`);
  }

  const failedJob = ingestJobs.docs.find((doc: { stage?: string | null }) => doc.stage === PROCESSING_STAGE.FAILED);
  if (failedJob) {
    return new Error(getFailedJobError(failedJob) ?? "Scheduled ingest failed during downstream processing.");
  }

  if (typeof ingestFile.errorLog === "string" && ingestFile.errorLog.length > 0) {
    return new Error(ingestFile.errorLog);
  }

  return new Error(
    `Scheduled ingest finished without a terminal success state (ingest file status: ${String(ingestFile.status ?? "unknown")}).`
  );
};

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
    let ingestFileId: string | number | undefined;
    logger.info("scheduled-ingest workflow started", { scheduledIngestId, sourceUrl });

    try {
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

      if (!fetchResult.ingestFileId) {
        throw new Error("Scheduled ingest did not create an ingest file.");
      }

      ingestFileId = fetchResult.ingestFileId;

      if (fetchResult.isDuplicate) {
        const scheduledIngest = await loadScheduledIngestForLifecycle(req.payload, scheduledIngestId);
        if (scheduledIngest) {
          await updateScheduledIngestSuccess(req.payload, scheduledIngest, ingestFileId, Date.now() - workflowStart);
        }
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

      if (!detection.sheets?.length) {
        throw new Error("Scheduled ingest detected no sheets to process.");
      }

      await processSheets(tasks, detection.sheets, req);
      await updateIngestFileStatus(req.payload, detection.sheets);

      const terminalFailure = await buildScheduledIngestFailure(req.payload, ingestFileId);
      if (terminalFailure) {
        throw terminalFailure;
      }

      const scheduledIngest = await loadScheduledIngestForLifecycle(req.payload, scheduledIngestId);
      if (scheduledIngest) {
        await updateScheduledIngestSuccess(req.payload, scheduledIngest, ingestFileId, Date.now() - workflowStart);
      }

      logger.info("scheduled-ingest workflow completed", { scheduledIngestId, ingestFileId });
    } catch (error) {
      const scheduledIngest = await loadScheduledIngestForLifecycle(req.payload, scheduledIngestId);
      if (scheduledIngest) {
        await updateScheduledIngestFailure(
          req.payload,
          scheduledIngest,
          error instanceof Error ? error : new Error(String(error)),
          req
        );
      }
      throw error;
    }
  },
};
