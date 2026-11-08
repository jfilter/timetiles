/**
 * Task that creates the ingest run of a file and queues one `ingest-process`
 * child per sheet. Idempotent: a redelivered or retried dispatch finds the run
 * already dispatched and does nothing. See ADR 0043.
 *
 * @module
 * @category Jobs
 */
import { COLLECTION_NAMES, INGEST_RUN_SOURCES, type IngestRunSource } from "@/lib/constants/ingest-constants";
import { dispatchIngestRun } from "@/lib/ingest/ingest-runs";
import { logError } from "@/lib/logger";

import type { JobHandlerContext, TaskCallbackArgs } from "../utils/job-context";
import { isFinalAttempt } from "../utils/job-context";

export interface DispatchIngestRunInput {
  ingestFileId: number;
  ingestJobIds: number[];
  source: IngestRunSource;
  scheduledIngestId?: number | null;
  scraperRunId?: number | null;
}

const RETRIES = 2;

const parseInput = (raw: unknown): DispatchIngestRunInput => {
  const input = (raw ?? {}) as Partial<DispatchIngestRunInput>;
  if (typeof input.ingestFileId !== "number") throw new Error("dispatch-ingest-run requires ingestFileId");
  if (!Array.isArray(input.ingestJobIds) || input.ingestJobIds.length === 0) {
    throw new Error("dispatch-ingest-run requires at least one ingest job");
  }
  if (!INGEST_RUN_SOURCES.includes(input.source as IngestRunSource)) {
    throw new Error(`dispatch-ingest-run got unknown source ${String(input.source)}`);
  }
  return input as DispatchIngestRunInput;
};

export const dispatchIngestRunJob = {
  slug: "dispatch-ingest-run",
  retries: RETRIES,
  inputSchema: [
    { name: "ingestFileId", type: "number" as const, required: true },
    { name: "ingestJobIds", type: "json" as const, required: true },
    { name: "source", type: "text" as const, required: true },
    { name: "scheduledIngestId", type: "number" as const },
    { name: "scraperRunId", type: "number" as const },
  ],
  outputSchema: [
    { name: "runId", type: "number" as const },
    { name: "dispatched", type: "checkbox" as const },
  ],
  onFail: async (args: TaskCallbackArgs) => {
    if (!isFinalAttempt(args, RETRIES)) return;
    const ingestFileId = (args.input as Record<string, unknown> | undefined)?.ingestFileId;
    if (typeof ingestFileId !== "number") return;
    try {
      await args.req.payload.update({
        collection: COLLECTION_NAMES.INGEST_FILES,
        id: ingestFileId,
        data: { status: "failed", errorLog: "The sheets of this file could not be queued for processing" },
      });
    } catch (error) {
      logError(error, "Failed to mark ingest file failed after dispatch failure", { ingestFileId });
    }
  },
  handler: async (context: JobHandlerContext) => {
    const input = parseInput(context.input ?? context.job?.input);
    const result = await dispatchIngestRun(context.req.payload, input);
    return { output: result };
  },
};
