/**
 * Polling loop of a job worker that shuts down gracefully.
 *
 * Runs one pass, then waits out the rest of the interval. Once `signal` aborts,
 * the loop claims no new pass, lets the pass in flight finish, and returns.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { logError } from "@/lib/logger";

export type QueueScope = { allQueues: true } | { queue: string };

/** Queue the scope's due schedules, then run one batch unless shutdown began meanwhile. */
export const runQueuePass = async (
  jobs: Pick<Payload["jobs"], "handleSchedules" | "run">,
  options: QueueScope & { limit: number },
  signal: AbortSignal
): Promise<void> => {
  const { limit, ...scope } = options;
  await jobs.handleSchedules(scope);
  if (signal.aborted) return;
  await jobs.run({ ...scope, limit });
};

export const runWorkerLoop = async (
  pass: () => Promise<void>,
  options: { intervalMs: number; signal: AbortSignal }
): Promise<void> => {
  const { intervalMs, signal } = options;
  while (!signal.aborted) {
    const startedAt = Date.now();
    try {
      await pass();
    } catch (error) {
      logError(error, "Job worker pass failed");
    }
    const wait = intervalMs - (Date.now() - startedAt);
    if (signal.aborted || wait <= 0) continue;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, wait);
      signal.addEventListener("abort", done);
    });
  }
};
