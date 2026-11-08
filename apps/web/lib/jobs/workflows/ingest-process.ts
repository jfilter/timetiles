/**
 * Per-sheet ingest processing workflow.
 *
 * Queued once per sheet by the run dispatch, and again after a review is resolved
 * or a job is retried. Each queueing bumps the IngestJob's generation; a child whose
 * generation is outdated, or whose job already completed, returns before its first
 * task. Supports resuming from different points:
 * - `analyze-duplicates`: re-runs analyze → detect-schema → validate → create-version → geocode → create-events
 * - `detect-schema`: re-runs detect-schema → validate → create-version → geocode → create-events
 * - `create-schema-version` (default): create-version → geocode → create-events
 * - `create-events`: only create-events (e.g. after geocoding partial approval)
 *
 * Tasks throw on error — since there's no Promise.allSettled here,
 * errors propagate to Payload, which retries the task and calls onFail on the
 * last attempt; onFail then marks the job FAILED and reconciles its run.
 *
 * @module
 * @category Jobs
 */
import type { Payload, WorkflowConfig } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logger } from "@/lib/logger";

import type {
  AnalyzeDuplicatesOutput,
  CreateEventsOutput,
  DetectSchemaOutput,
  GeocodeBatchOutput,
  ValidateSchemaOutput,
} from "../types/task-outputs";
import { reconcileAfterJobTransition } from "../utils/reconcile-run";
import { recordTaskError } from "../utils/resource-loading";

/** A redelivered or superseded child must not run tasks against a newer generation. */
const isStale = async (payload: Payload, ingestJobId: string, generation: number): Promise<boolean> => {
  const job = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId, depth: 0 });
  return Number(job.generation) !== generation || job.stage === PROCESSING_STAGE.COMPLETED;
};

export const ingestProcessWorkflow: WorkflowConfig<"ingest-process"> = {
  slug: "ingest-process",
  label: "Ingest Process",
  queue: "ingest",
  inputSchema: [
    { name: "ingestJobId", type: "text", required: true },
    { name: "resumeFrom", type: "text" },
    // Absent on children queued before generations existed; those match generation 0.
    { name: "generation", type: "number" },
  ],
  concurrency: ({ input }) => `ingest:process:${input.ingestJobId}`,
  handler: async ({ job, tasks, req }) => {
    const id = job.input.ingestJobId;
    const resumeFrom = job.input.resumeFrom ?? "create-schema-version";
    const generation = job.input.generation ?? 0;
    if (await isStale(req.payload, id, generation)) {
      logger.info("ingest-process: stale child, nothing to do", { ingestJobId: id, generation });
      return;
    }
    logger.info("ingest-process workflow started", { ingestJobId: id, resumeFrom, generation });

    try {
      // Tasks throw on error → Payload retries, then onFail marks IngestJob FAILED
      if (resumeFrom === "analyze-duplicates") {
        const analyze = (await tasks["analyze-duplicates"]("analyze", {
          input: { ingestJobId: id, generation },
        })) as AnalyzeDuplicatesOutput;
        if (analyze.failed) {
          // Hard limit (e.g. unique-row cap): the handler already marked the job
          // FAILED with a user-facing message — stop without running later stages.
          logger.info("ingest-process: failed during analyze-duplicates", { ingestJobId: id, reason: analyze.reason });
          return;
        }
        if (analyze.needsReview) {
          logger.info("ingest-process: analyze-duplicates requires review", { ingestJobId: id });
          return;
        }
      }

      if (resumeFrom === "analyze-duplicates" || resumeFrom === "detect-schema") {
        const detect = (await tasks["detect-schema"]("detect", {
          input: { ingestJobId: id, generation },
        })) as DetectSchemaOutput;
        if (detect.needsReview) {
          logger.info("ingest-process: detect-schema requires review", { ingestJobId: id });
          return;
        }
        const validate = (await tasks["validate-schema"]("validate", {
          input: { ingestJobId: id, generation },
        })) as ValidateSchemaOutput;
        if (validate.failed) {
          logger.info("ingest-process: failed during validate-schema", {
            ingestJobId: id,
            reason: validate.failureReason,
          });
          return;
        }
        if (validate.needsReview) {
          logger.info("ingest-process: validate-schema requires review", { ingestJobId: id });
          return;
        }
      }

      if (resumeFrom !== "create-events") {
        const version = (await tasks["create-schema-version"]("create-version", {
          input: { ingestJobId: id, generation },
        })) as { needsReview?: boolean };
        if (version.needsReview) {
          logger.info("ingest-process: schema still awaits approval", { ingestJobId: id });
          return;
        }
        const geocode = (await tasks["geocode-batch"]("geocode", {
          input: { ingestJobId: id, generation, batchNumber: 0 },
        })) as GeocodeBatchOutput;

        if (geocode.needsReview) {
          logger.info("ingest-process: geocode-batch requires review", { ingestJobId: id });
          return;
        }
      }

      const events = (await tasks["create-events"]("create-events", {
        input: { ingestJobId: id, generation },
      })) as CreateEventsOutput;
      if (events.needsReview) {
        logger.info("ingest-process: create-events requires review", { ingestJobId: id });
        return;
      }

      logger.info("ingest-process workflow completed", { ingestJobId: id });
    } catch (error) {
      await recordTaskError(req.payload, id, error, generation);
      throw error;
    } finally {
      // Covers completion and review pauses; a final task failure is handled by onFail, which runs later.
      await reconcileAfterJobTransition(req.payload, id);
    }
  },
};
