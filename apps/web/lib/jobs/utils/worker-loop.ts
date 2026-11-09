/**
 * Polling loop of a job worker that shuts down gracefully.
 *
 * Every pass starts one run per free slot and leaves them running, so a long job
 * occupies one slot and never delays the jobs behind it. Once `signal` aborts,
 * the loop claims nothing new, waits for the running jobs, and returns.
 *
 * @module
 * @category Jobs
 */
import { setTimeout as delay } from "node:timers/promises";

import type { Payload } from "payload";

import { logError } from "@/lib/logger";

export type QueueScope = { allQueues: true } | { queue: string };

type RunResult = Awaited<ReturnType<Payload["jobs"]["run"]>>;

/** The runs in flight in this worker. A run claims at most one job, so each is one slot. */
export interface WorkerSlots {
  used: () => number;
  track: (run: Promise<RunResult>) => Promise<RunResult | undefined>;
}

type WorkerPayload = Pick<Payload, "find"> & { jobs: Pick<Payload["jobs"], "handleSchedules" | "run"> };

const CLAIM_POLL_MS = 25;
const POLL = Symbol("poll");

const processingJobIds = async (payload: WorkerPayload, scope: QueueScope): Promise<Set<number | string>> => {
  const { docs } = await payload.find({
    collection: "payload-jobs",
    where: { processing: { equals: true }, ...("queue" in scope ? { queue: { equals: scope.queue } } : {}) },
    select: { processing: true },
    depth: 0,
    limit: 0,
    pagination: false,
  });
  return new Set(docs.map((doc) => doc.id));
};

/** Wait until the run has claimed a job or ended; false when it claimed nothing or failed. */
const claimedJob = async (
  payload: WorkerPayload,
  scope: QueueScope,
  before: Set<number | string>,
  settled: Promise<RunResult | undefined>
): Promise<boolean> => {
  for (;;) {
    const outcome = await Promise.race([settled, delay(CLAIM_POLL_MS, POLL)]);
    if (outcome !== POLL) return outcome?.jobStatus != null;
    const current = await processingJobIds(payload, scope);
    if ([...current].some((id) => !before.has(id))) return true;
  }
};

/**
 * Queue the scope's due schedules, then fill the free slots one claim at a time. Payload checks
 * concurrency keys against jobs already marked running, so claims must not overlap.
 */
export const runQueuePass = async (
  payload: WorkerPayload,
  options: QueueScope & { limit: number },
  signal: AbortSignal,
  slots: WorkerSlots
): Promise<void> => {
  const { limit, ...scope } = options;
  const runOneJob = async (): Promise<RunResult> => payload.jobs.run({ ...scope, limit: 1 });
  await payload.jobs.handleSchedules(scope);
  while (slots.used() < limit && !signal.aborted) {
    const before = await processingJobIds(payload, scope);
    if (signal.aborted) return;
    if (!(await claimedJob(payload, scope, before, slots.track(runOneJob())))) return;
  }
};

export const runWorkerLoop = async (
  pass: (slots: WorkerSlots) => Promise<void>,
  options: { intervalMs: number; signal: AbortSignal }
): Promise<void> => {
  const { intervalMs, signal } = options;
  const running = new Set<Promise<RunResult>>();
  const settle = async (run: Promise<RunResult>) => {
    try {
      return await run;
    } catch (error) {
      logError(error, "Job worker pass failed");
      return undefined;
    } finally {
      running.delete(run);
    }
  };
  const slots: WorkerSlots = {
    used: () => running.size,
    track: (run) => {
      running.add(run);
      return settle(run);
    },
  };
  while (!signal.aborted) {
    const startedAt = Date.now();
    try {
      await pass(slots);
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
  await Promise.allSettled(running);
};
