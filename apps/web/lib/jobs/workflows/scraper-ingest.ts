/**
 * Scraper ingest workflow — scraper execution + full pipeline.
 *
 * Triggered by manual scraper run, schedule, or webhook.
 * Executes the scraper, then if auto-import is enabled, runs
 * dataset-detection and dispatches one `ingest-process` job per sheet.
 *
 * @module
 * @category Jobs
 */
import type { WorkflowConfig } from "payload";

import { logger } from "@/lib/logger";

import type { DatasetDetectionOutput, ScraperExecutionOutput } from "../types/task-outputs";
import { dispatchSheets } from "./dispatch";

export const scraperIngestWorkflow: WorkflowConfig<"scraper-ingest"> = {
  slug: "scraper-ingest",
  label: "Scraper Ingest",
  queue: "ingest",
  inputSchema: [
    { name: "scraperId", type: "number", required: true },
    { name: "triggeredBy", type: "text", required: true },
  ],
  concurrency: ({ input }) => `ingest:scraper:${input.scraperId}`,
  handler: async ({ job, tasks }) => {
    const { scraperId, triggeredBy } = job.input;
    logger.info("scraper-ingest workflow started", { scraperId, triggeredBy });

    const scraperResult = (await tasks["scraper-execution"]("run-scraper", {
      input: { scraperId, triggeredBy },
    })) as ScraperExecutionOutput;

    if (!scraperResult.ingestFileId) {
      if (scraperResult.autoImportError != null) {
        logger.error("scraper-ingest: auto-import failed, no data was imported", {
          scraperId,
          error: scraperResult.autoImportError,
        });
      } else {
        logger.info("scraper-ingest: no output file (autoImport disabled?)", { scraperId });
      }
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

    await dispatchSheets(tasks, detection.sheets, {
      ingestFileId: Number(scraperResult.ingestFileId),
      source: "scraper",
      scraperRunId: scraperResult.runId,
    });
    logger.info("scraper-ingest: sheets dispatched", { scraperId });
  },
};
