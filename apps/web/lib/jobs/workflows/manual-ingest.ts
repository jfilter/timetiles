/**
 * Manual ingest workflow — full pipeline for user-uploaded files.
 *
 * Triggered when a user uploads a CSV/Excel file via the ingest wizard.
 * Runs dataset-detection (identifies sheets, creates IngestJobs), then
 * dispatches one `ingest-process` job per sheet.
 *
 * @module
 * @category Jobs
 */
import type { WorkflowConfig } from "payload";

import { logger } from "@/lib/logger";

import type { DatasetDetectionOutput } from "../types/task-outputs";
import { dispatchSheets } from "./dispatch";

export const manualIngestWorkflow: WorkflowConfig<"manual-ingest"> = {
  slug: "manual-ingest",
  label: "Manual Ingest",
  queue: "ingest",
  inputSchema: [{ name: "ingestFileId", type: "text", required: true }],
  concurrency: ({ input }) => `ingest:manual:${input.ingestFileId}`,
  handler: async ({ job, tasks }) => {
    const { ingestFileId } = job.input;
    const workflowStart = Date.now();
    logger.info("[manual-ingest] started", { ingestFileId, jobId: job.id });

    const detectStart = Date.now();
    const detection = (await tasks["dataset-detection"]("detect-sheets", {
      input: { ingestFileId },
    })) as DatasetDetectionOutput;
    logger.info("[manual-ingest] dataset-detection done", {
      ingestFileId,
      durationMs: Date.now() - detectStart,
      sheetCount: detection.sheets?.length ?? 0,
    });

    if (!detection.sheets?.length) {
      logger.info("[manual-ingest] no sheets detected, finishing", { ingestFileId });
      return;
    }

    await dispatchSheets(tasks, detection.sheets, { ingestFileId: Number(ingestFileId), source: "manual" });
    logger.info("[manual-ingest] dispatched", { ingestFileId, totalDurationMs: Date.now() - workflowStart });
  },
};
