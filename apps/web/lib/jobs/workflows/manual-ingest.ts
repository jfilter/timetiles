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
import { processSheets } from "./process-sheets";

export const manualIngestWorkflow: WorkflowConfig<"manual-ingest"> = {
  slug: "manual-ingest",
  label: "Manual Ingest",
  inputSchema: [{ name: "ingestFileId", type: "text", required: true }],
  concurrency: ({ input }) => `file:${input.ingestFileId}`,
  handler: async ({ job, tasks, req }) => {
    const { ingestFileId } = job.input;
    logger.info("manual-ingest workflow started", { ingestFileId });

    const detection = (await tasks["dataset-detection"]("detect-sheets", {
      input: { ingestFileId },
    })) as DatasetDetectionOutput;

    if (!detection.success) {
      logger.info("manual-ingest: dataset detection failed", { ingestFileId, reason: detection.reason });
      return;
    }

    if (!detection.sheets?.length) {
      logger.info("manual-ingest: no sheets detected", { ingestFileId });
      return;
    }

    logger.info("manual-ingest: detected sheets, starting pipeline", {
      ingestFileId,
      sheetCount: detection.sheets.length,
    });

    await processSheets(tasks, detection.sheets, req);

    logger.info("manual-ingest workflow completed", { ingestFileId });
  },
};
