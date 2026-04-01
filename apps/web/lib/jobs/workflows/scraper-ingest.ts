/**
 * Scraper ingest workflow — scraper execution + full pipeline.
 *
 * Triggered by manual scraper run, schedule, or webhook.
 * Executes the scraper, then if auto-import is enabled, runs
 * dataset-detection and processes all sheets in parallel.
 *
 * @module
 * @category Jobs
 */
import type { WorkflowConfig } from "payload";

import { logger } from "@/lib/logger";

import type { DatasetDetectionOutput, ScraperExecutionOutput } from "../types/task-outputs";
import { updateIngestFileStatus } from "./completion";
import { processSheets } from "./process-sheets";

export const scraperIngestWorkflow: WorkflowConfig<"scraper-ingest"> = {
  slug: "scraper-ingest",
  label: "Scraper Ingest",
  queue: "ingest",
  inputSchema: [
    { name: "scraperId", type: "number", required: true },
    { name: "triggeredBy", type: "text", required: true },
  ],
  concurrency: ({ input }) => `ingest:scraper:${input.scraperId}`,
  handler: async ({ job, tasks, req }) => {
    const { scraperId, triggeredBy } = job.input;
    logger.info("scraper-ingest workflow started", { scraperId, triggeredBy });

    const scraperResult = (await tasks["scraper-execution"]("run-scraper", {
      input: { scraperId, triggeredBy },
    })) as ScraperExecutionOutput;

    if (!scraperResult.ingestFileId) {
      logger.info("scraper-ingest: no output file (autoImport disabled?)", { scraperId });
      return;
    }

    logger.info("scraper-ingest: scraper completed, detecting sheets", {
      scraperId,
      ingestFileId: scraperResult.ingestFileId,
    });

    const detection = (await tasks["dataset-detection"]("detect-sheets", {
      input: { ingestFileId: String(scraperResult.ingestFileId) },
    })) as DatasetDetectionOutput;

    if (!detection.sheets?.length) {
      logger.info("scraper-ingest: no sheets detected", { scraperId });
      return;
    }

    await processSheets(tasks, detection.sheets, req);
    await updateIngestFileStatus(req.payload, detection.sheets);

    logger.info("scraper-ingest workflow completed", { scraperId });
  },
};
