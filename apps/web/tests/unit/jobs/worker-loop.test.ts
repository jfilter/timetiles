/**
 * Unit tests for the job worker's polling loop and its graceful shutdown.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  logError: mocks.logError,
}));

import { runQueuePass, runWorkerLoop } from "@/lib/jobs/utils/worker-loop";

/** Resolves with "timeout" unless the promise settles within `ms`. */
const within = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);

describe("runWorkerLoop", () => {
  it("lets the pass in flight finish and starts no new one after an abort", async () => {
    const controller = new AbortController();
    let finishPass!: () => void;
    let finished = false;
    const pass = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPass = () => {
            finished = true;
            resolve();
          };
        })
    );

    const loop = runWorkerLoop(pass, { intervalMs: 0, signal: controller.signal });
    controller.abort();
    expect(await within(loop, 50)).toBe("timeout");

    finishPass();
    await loop;
    expect(finished).toBe(true);
    expect(pass).toHaveBeenCalledTimes(1);
  });

  it("wakes from the wait between passes as soon as it is aborted", async () => {
    const controller = new AbortController();
    const pass = vi.fn(async () => {});

    const loop = runWorkerLoop(pass, { intervalMs: 60_000, signal: controller.signal });
    await vi.waitFor(() => expect(pass).toHaveBeenCalledTimes(1));
    controller.abort();

    expect(await within(loop, 500)).toBeUndefined();
    expect(pass).toHaveBeenCalledTimes(1);
  });

  it("logs a failed pass and keeps polling", async () => {
    const controller = new AbortController();
    const failure = new Error("database gone");
    const pass = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(() => {
        controller.abort();
        return Promise.resolve();
      });

    await runWorkerLoop(pass, { intervalMs: 0, signal: controller.signal });

    expect(pass).toHaveBeenCalledTimes(2);
    expect(mocks.logError).toHaveBeenCalledWith(failure, "Job worker pass failed");
  });

  it("does not run at all when started after the abort", async () => {
    const controller = new AbortController();
    controller.abort();
    const pass = vi.fn(async () => {});

    await runWorkerLoop(pass, { intervalMs: 0, signal: controller.signal });

    expect(pass).not.toHaveBeenCalled();
  });
});

describe("runQueuePass", () => {
  const jobsStub = () => ({
    handleSchedules: vi.fn(() => Promise.resolve({} as never)),
    run: vi.fn(() => Promise.resolve({} as never)),
  });

  it("queues the scope's schedules, then runs one batch", async () => {
    const jobs = jobsStub();
    await runQueuePass(jobs, { queue: "ingest", limit: 10 }, new AbortController().signal);

    expect(jobs.handleSchedules).toHaveBeenCalledWith({ queue: "ingest" });
    expect(jobs.run).toHaveBeenCalledWith({ queue: "ingest", limit: 10 });
  });

  it("claims no batch when shutdown begins while schedules are queued", async () => {
    const controller = new AbortController();
    const jobs = jobsStub();
    jobs.handleSchedules.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve({} as never);
    });

    await runQueuePass(jobs, { allQueues: true, limit: 10 }, controller.signal);

    expect(jobs.run).not.toHaveBeenCalled();
  });
});
