/**
 * Post-review ingest processing workflow.
 *
 * Queued after a user resolves a NEEDS_REVIEW state on an IngestJob.
 * Supports resuming from different points depending on the review reason:
 * - `detect-schema`: re-runs detect-schema → validate → create-version → geocode → create-events
 * - `create-schema-version` (default): create-version → geocode → create-events
 * - `create-events`: only create-events (e.g. after geocoding partial approval)
 *
 * Tasks throw on error — since there's no Promise.allSettled here,
 * errors propagate to Payload's top-level handler which calls onFail.
 * try/finally ensures updateIngestFileStatusForJob runs even on failure.
 *
 * @module
 * @category Jobs
 */
import type { WorkflowConfig } from "payload";

import { logger } from "@/lib/logger";

import type {
  CreateEventsOutput,
  DetectSchemaOutput,
  GeocodeBatchOutput,
  ValidateSchemaOutput,
} from "../types/task-outputs";
import { updateIngestFileStatusForJob } from "./completion";

export const ingestProcessWorkflow: WorkflowConfig<"ingest-process"> = {
  slug: "ingest-process",
  label: "Ingest Process (Post-Review)",
  queue: "ingest",
  inputSchema: [
    { name: "ingestJobId", type: "text", required: true },
    { name: "resumeFrom", type: "text" },
  ],
  concurrency: () => "ingest-pipeline",
  handler: async ({ job, tasks, req }) => {
    const id = job.input.ingestJobId;
    const resumeFrom = job.input.resumeFrom ?? "create-schema-version";
    logger.info("ingest-process workflow started (post-review)", { ingestJobId: id, resumeFrom });

    try {
      // Tasks throw on error → propagates to Payload → onFail marks IngestJob FAILED
      if (resumeFrom === "detect-schema") {
        const detect = (await tasks["detect-schema"]("detect", { input: { ingestJobId: id } })) as DetectSchemaOutput;
        if (detect.needsReview) {
          logger.info("ingest-process: detect-schema requires review", { ingestJobId: id });
          return;
        }
        const validate = (await tasks["validate-schema"]("validate", {
          input: { ingestJobId: id },
        })) as ValidateSchemaOutput;
        if (validate.needsReview) {
          logger.info("ingest-process: validate-schema requires review", { ingestJobId: id });
          return;
        }
      }

      if (resumeFrom !== "create-events") {
        await tasks["create-schema-version"]("create-version", { input: { ingestJobId: id } });
        const geocode = (await tasks["geocode-batch"]("geocode", {
          input: { ingestJobId: id, batchNumber: 0 },
        })) as GeocodeBatchOutput;

        if (geocode.needsReview) {
          logger.info("ingest-process: geocode-batch requires review", { ingestJobId: id });
          return;
        }
      }

      const events = (await tasks["create-events"]("create-events", {
        input: { ingestJobId: id },
      })) as CreateEventsOutput;
      if (events.needsReview) {
        logger.info("ingest-process: create-events requires review", { ingestJobId: id });
        return;
      }

      logger.info("ingest-process workflow completed", { ingestJobId: id });
    } finally {
      // Always update file status — even if a task threw (IngestJob marked FAILED by onFail)
      await updateIngestFileStatusForJob(req.payload, id);
    }
  },
};
