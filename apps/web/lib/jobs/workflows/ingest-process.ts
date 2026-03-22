/**
 * Post-review ingest processing workflow.
 *
 * Queued after a user resolves a NEEDS_REVIEW state on an IngestJob.
 * Supports resuming from different points depending on the review reason:
 * - `detect-schema`: re-runs detect-schema → validate → create-version → geocode → create-events
 * - `create-schema-version` (default): create-version → geocode → create-events
 * - `create-events`: only create-events (e.g. after geocoding partial approval)
 *
 * @module
 * @category Jobs
 */
import type { WorkflowConfig } from "payload";

import { logger } from "@/lib/logger";

import type {
  CreateEventsOutput,
  CreateSchemaVersionOutput,
  DetectSchemaOutput,
  GeocodeBatchOutput,
  ValidateSchemaOutput,
} from "../types/task-outputs";

export const ingestProcessWorkflow: WorkflowConfig<"ingest-process"> = {
  slug: "ingest-process",
  label: "Ingest Process (Post-Review)",
  inputSchema: [
    { name: "ingestJobId", type: "text", required: true },
    { name: "resumeFrom", type: "text" },
  ],
  concurrency: ({ input }) => `ingest:${input.ingestJobId}`,
  handler: async ({ job, tasks }) => {
    const id = job.input.ingestJobId;
    const resumeFrom = (job.input as Record<string, unknown>).resumeFrom ?? "create-schema-version";
    logger.info("ingest-process workflow started (post-review)", { ingestJobId: id, resumeFrom });

    if (resumeFrom === "detect-schema") {
      const schema = (await tasks["detect-schema"]("detect", { input: { ingestJobId: id } })) as DetectSchemaOutput;
      if (!schema.success) {
        logger.info("ingest-process: detect-schema failed", { ingestJobId: id, reason: schema.reason });
        return;
      }

      const validate = (await tasks["validate-schema"]("validate", {
        input: { ingestJobId: id },
      })) as ValidateSchemaOutput;
      if (!validate.success) {
        logger.info("ingest-process: validate-schema failed", { ingestJobId: id, reason: validate.reason });
        return;
      }
    }

    if (resumeFrom !== "create-events") {
      const version = (await tasks["create-schema-version"]("create-version", {
        input: { ingestJobId: id },
      })) as CreateSchemaVersionOutput;
      if (!version.success) {
        logger.info("ingest-process: create-schema-version failed", { ingestJobId: id, reason: version.reason });
        return;
      }

      const geocode = (await tasks["geocode-batch"]("geocode", {
        input: { ingestJobId: id, batchNumber: 0 },
      })) as GeocodeBatchOutput;
      if (!geocode.success) {
        logger.info("ingest-process: geocode-batch failed", { ingestJobId: id, reason: geocode.reason });
        return;
      }
    }

    (await tasks["create-events"]("create-events", { input: { ingestJobId: id } })) as CreateEventsOutput;

    logger.info("ingest-process workflow completed", { ingestJobId: id });
  },
};
