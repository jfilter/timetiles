/**
 * Job worker for one queue, or for all queues with `all`.
 *
 * Usage: `payload run scripts/jobs-worker.ts <queue|all> [limit=10] [intervalSeconds=10]`.
 * Each pass queues due schedules of its queues and tops up to `limit` running
 * jobs. On SIGTERM or SIGINT the worker claims no new jobs, waits for the running
 * ones, and exits, so a container stop within its grace period interrupts no task.
 *
 * @module
 * @category Scripts
 */
import { getPayload } from "payload";

import { closeDatasetLeasePool } from "@/lib/database/dataset-import-lock";
import { type QueueScope, runQueuePass, runWorkerLoop } from "@/lib/jobs/utils/worker-loop";
import { logger } from "@/lib/logger";

import config from "../payload.config";

const [queueArg, limitArg = "10", intervalArg = "10"] = process.argv.slice(2);
const limit = Number(limitArg);
const intervalSeconds = Number(intervalArg);
if (
  queueArg == null ||
  queueArg === "" ||
  !Number.isInteger(limit) ||
  limit < 1 ||
  !Number.isFinite(intervalSeconds) ||
  intervalSeconds <= 0
) {
  console.error("usage: jobs-worker.ts <queue|all> [limit=10] [intervalSeconds=10]");
  process.exit(1);
}

const shutdown = new AbortController();
const stop = (signal: NodeJS.Signals) => {
  if (shutdown.signal.aborted) return;
  logger.info({ signal }, "Job worker stopping after the running jobs");
  shutdown.abort();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

const payload = await getPayload({ config });
const scope: QueueScope = queueArg === "all" ? { allQueues: true } : { queue: queueArg };
logger.info({ queue: queueArg, limit, intervalSeconds }, "Job worker started");

await runWorkerLoop((slots) => runQueuePass(payload, { ...scope, limit }, shutdown.signal, slots), {
  intervalMs: intervalSeconds * 1000,
  signal: shutdown.signal,
});

await closeDatasetLeasePool();
await payload.destroy();
logger.info("Job worker stopped");
