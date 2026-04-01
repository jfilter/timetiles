/**
 * Manual ingest workflow — full pipeline for user-uploaded files.
 *
 * Triggered when a user uploads a CSV/Excel file via the ingest wizard.
 * Runs dataset-detection first (identifies sheets, creates IngestJobs),
 * then processes all sheets in parallel through the 6-task pipeline.
 *
 * @module
 * @category Jobs
 */
import type { WorkflowConfig } from "payload";

import { logger } from "@/lib/logger";

import type { DatasetDetectionOutput } from "../types/task-outputs";
import { updateIngestFileStatus } from "./completion";
import { processSheets } from "./process-sheets";

export const manualIngestWorkflow: WorkflowConfig<"manual-ingest"> = {
  slug: "manual-ingest",
  label: "Manual Ingest",
  queue: "ingest",
  inputSchema: [{ name: "ingestFileId", type: "text", required: true }],
  concurrency: ({ input }) => `ingest:manual:${input.ingestFileId}`,
  handler: async ({ job, tasks, req }) => {
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

    const processStart = Date.now();
    await processSheets(tasks, detection.sheets, req);
    logger.info("[manual-ingest] processSheets done", { ingestFileId, durationMs: Date.now() - processStart });

    await updateIngestFileStatus(req.payload, detection.sheets);

    logger.info("[manual-ingest] completed", { ingestFileId, totalDurationMs: Date.now() - workflowStart });
  },
};
