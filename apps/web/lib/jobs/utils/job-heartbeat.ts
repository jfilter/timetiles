/**
 * Heartbeat of running ingest workflows (ADR 0043).
 *
 * While a workflow of the `ingest` queue runs, its worker touches the Payload
 * job's `updatedAt` every minute. A `processing` job whose `updatedAt` is older
 * than the lease therefore belongs to a dead worker; ingest recovery reports it.
 * The timer also covers stretches without progress writes, such as a geocoding
 * provider's backoff.
 *
 * @module
 * @category Jobs
 */
import { and, eq } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import { logError } from "@/lib/logger";
import { payload_jobs } from "@/payload-generated-schema";

export const HEARTBEAT_INTERVAL_MS = 60_000;

/** Touch a running Payload job so recovery sees its worker alive. */
export const touchJob = async (payload: Payload, jobId: number | string): Promise<void> => {
  await payload.db.drizzle
    .update(payload_jobs)
    .set({ updatedAt: new Date().toISOString() })
    .where(and(eq(payload_jobs.id, Number(jobId)), eq(payload_jobs.processing, true)));
};

/** Beat until the returned stop function is called. A failed beat is logged, never thrown. */
export const startJobHeartbeat = (
  payload: Payload,
  jobId: number | string,
  intervalMs: number = HEARTBEAT_INTERVAL_MS
): (() => void) => {
  const beat = async () => {
    try {
      await touchJob(payload, jobId);
    } catch (error) {
      logError(error, "Job heartbeat failed", { jobId });
    }
  };
  const timer = setInterval(() => void beat(), intervalMs);
  return () => clearInterval(timer);
};

interface HeartbeatArgs {
  job: { id: number | string };
  req: { payload: Payload };
}

/** Wrap a workflow so its job beats for as long as the handler runs. */
export const withJobHeartbeat = <W extends { handler: unknown }>(
  workflow: W,
  intervalMs: number = HEARTBEAT_INTERVAL_MS
): W => {
  const handler = workflow.handler;
  if (typeof handler !== "function") return workflow;
  const run = handler as (args: HeartbeatArgs) => Promise<unknown>;
  const beating = async (args: HeartbeatArgs): Promise<void> => {
    const stop = startJobHeartbeat(args.req.payload, args.job.id, intervalMs);
    try {
      await run(args);
    } finally {
      stop();
    }
  };
  return { ...workflow, handler: beating };
};
