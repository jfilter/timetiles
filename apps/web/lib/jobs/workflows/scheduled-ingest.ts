/**
 * Scheduled ingest workflow — automated URL fetch + full pipeline.
 *
 * Triggered by the schedule-manager job or webhooks. Fetches data from
 * a URL, runs dataset-detection, then processes all sheets in parallel.
 *
 * @module
 * @category Jobs
 */
import type { WorkflowConfig } from "payload";

import { logger } from "@/lib/logger";

import type { DatasetDetectionOutput, UrlFetchOutput } from "../types/task-outputs";
import { processSheets } from "./process-sheets";

export const scheduledIngestWorkflow: WorkflowConfig<"scheduled-ingest"> = {
  slug: "scheduled-ingest",
  label: "Scheduled Ingest",
  inputSchema: [
    { name: "scheduledIngestId", type: "number", required: true },
    { name: "sourceUrl", type: "text", required: true },
    { name: "authConfig", type: "json" },
    { name: "catalogId", type: "text" },
    { name: "originalName", type: "text", required: true },
    { name: "userId", type: "text" },
    { name: "triggeredBy", type: "text" },
    { name: "skipDuplicateChecking", type: "checkbox" },
    { name: "autoApproveSchema", type: "checkbox" },
    { name: "schemaMode", type: "text" },
  ],
  concurrency: ({ input }) => `sched:${input.scheduledIngestId}`,
  handler: async ({ job, tasks, req }) => {
    const { scheduledIngestId, sourceUrl } = job.input;
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
        skipDuplicateChecking: job.input.skipDuplicateChecking,
        autoApproveSchema: job.input.autoApproveSchema,
        schemaMode: job.input.schemaMode,
      },
    })) as UrlFetchOutput;

    if (!fetchResult.success) {
      logger.info("scheduled-ingest: URL fetch failed", { scheduledIngestId, reason: fetchResult.reason });
      return;
    }
    if (!fetchResult.ingestFileId) {
      logger.info("scheduled-ingest: no ingest file created", { scheduledIngestId });
      return;
    }

    logger.info("scheduled-ingest: URL fetched, detecting sheets", {
      scheduledIngestId,
      ingestFileId: fetchResult.ingestFileId,
    });

    const detection = (await tasks["dataset-detection"]("detect-sheets", {
      input: { ingestFileId: String(fetchResult.ingestFileId) },
    })) as DatasetDetectionOutput;

    if (!detection.success || !detection.sheets?.length) {
      logger.info("scheduled-ingest: no sheets detected", { scheduledIngestId });
      return;
    }

    await processSheets(tasks, detection.sheets, req);

    logger.info("scheduled-ingest workflow completed", { scheduledIngestId });
  },
};
