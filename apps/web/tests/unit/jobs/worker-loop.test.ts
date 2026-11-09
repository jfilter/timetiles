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

import { runQueuePass, runWorkerLoop, type WorkerSlots } from "@/lib/jobs/utils/worker-loop";

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

  it("starts the next pass while a job of the previous one still runs, and waits for it on shutdown", async () => {
    const controller = new AbortController();
    let finishJob!: () => void;
    const job = new Promise<never>((resolve) => {
      finishJob = resolve as () => void;
    });
    const pass = vi.fn((slots: WorkerSlots) => {
      if (pass.mock.calls.length === 1) void slots.track(job);
      if (pass.mock.calls.length === 2) controller.abort();
      return Promise.resolve();
    });

    const loop = runWorkerLoop(pass, { intervalMs: 0, signal: controller.signal });
    await vi.waitFor(() => expect(pass).toHaveBeenCalledTimes(2));
    expect(await within(loop, 50)).toBe("timeout");

    finishJob();
    await loop;
  });

  it("holds a slot until the run settles", async () => {
    const controller = new AbortController();
    let finishJob!: () => void;
    const job = new Promise<never>((resolve) => {
      finishJob = resolve as () => void;
    });
    let slots!: WorkerSlots;
    const pass = vi.fn((given: WorkerSlots) => {
      slots = given;
      if (pass.mock.calls.length === 1) void given.track(job);
      return Promise.resolve();
    });

    const loop = runWorkerLoop(pass, { intervalMs: 1, signal: controller.signal });
    await vi.waitFor(() => expect(pass).toHaveBeenCalled());
    expect(slots.used()).toBe(1);

    finishJob();
    await vi.waitFor(() => expect(slots.used()).toBe(0));
    controller.abort();
    await loop;
  });

  it("logs a failed job run and keeps polling", async () => {
    const controller = new AbortController();
    const failure = new Error("worker crashed");
    const pass = vi.fn((slots: WorkerSlots) => {
      if (pass.mock.calls.length === 1) void slots.track(Promise.reject(failure));
      else controller.abort();
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
  const finished = { jobStatus: {}, remainingJobsFromQueried: 0 } as never;
  const empty = { noJobsRemaining: true, remainingJobsFromQueried: 0 } as never;
  const longJob = () => new Promise<never>(() => {});

  /** Every started run shows up as one more processing job unless `claimsVisible` is off. */
  const payloadStub = () => {
    const state = { claimsVisible: true, shown: 0 };
    const run = vi.fn(() => Promise.resolve(finished));
    const stub = {
      state,
      jobs: { handleSchedules: vi.fn(() => Promise.resolve({} as never)), run },
      find: vi.fn(() => {
        if (state.claimsVisible) state.shown = run.mock.calls.length;
        return Promise.resolve({ docs: Array.from({ length: state.shown }, (_, id) => ({ id })) } as never);
      }),
    };
    return stub;
  };
  const slotsStub = (initial = 0): WorkerSlots => {
    let used = initial;
    return {
      used: () => used,
      track: async (run) => {
        used++;
        try {
          return await run;
        } catch {
          return undefined;
        } finally {
          used--;
        }
      },
    };
  };
  const signal = () => new AbortController().signal;

  it("queues the scope's schedules, then runs one-job runs until the queue is empty", async () => {
    const payload = payloadStub();
    payload.jobs.run.mockResolvedValueOnce(finished).mockResolvedValueOnce(finished).mockResolvedValueOnce(empty);

    await runQueuePass(payload, { queue: "ingest", limit: 10 }, signal(), slotsStub());

    expect(payload.jobs.handleSchedules).toHaveBeenCalledWith({ queue: "ingest" });
    expect(payload.jobs.run).toHaveBeenCalledTimes(3);
    expect(payload.jobs.run).toHaveBeenCalledWith({ queue: "ingest", limit: 1 });
  });

  it("refills the slots of jobs that finish during the pass", async () => {
    const payload = payloadStub();
    payload.jobs.run
      .mockResolvedValueOnce(finished)
      .mockResolvedValueOnce(finished)
      .mockResolvedValueOnce(finished)
      .mockResolvedValueOnce(empty);

    await runQueuePass(payload, { queue: "ingest", limit: 2 }, signal(), slotsStub());

    expect(payload.jobs.run).toHaveBeenCalledTimes(4);
  });

  it("fills only the free slots and does not wait behind a long job", async () => {
    const payload = payloadStub();
    payload.jobs.run.mockImplementation(longJob);

    await runQueuePass(payload, { allQueues: true, limit: 10 }, signal(), slotsStub(7));

    expect(payload.jobs.run).toHaveBeenCalledTimes(3);
    expect(payload.jobs.run).toHaveBeenCalledWith({ allQueues: true, limit: 1 });
  });

  it("starts no second claim before the first is visible as processing", async () => {
    const payload = payloadStub();
    payload.state.claimsVisible = false;
    payload.jobs.run.mockImplementation(longJob);

    const pass = runQueuePass(payload, { queue: "ingest", limit: 2 }, signal(), slotsStub());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(payload.jobs.run).toHaveBeenCalledTimes(1);

    payload.state.claimsVisible = true;
    await pass;
    expect(payload.jobs.run).toHaveBeenCalledTimes(2);
  });

  it("looks at processing jobs of its own queue only", async () => {
    const payload = payloadStub();
    payload.jobs.run.mockResolvedValueOnce(empty);

    await runQueuePass(payload, { queue: "ingest", limit: 1 }, signal(), slotsStub());

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { processing: { equals: true }, queue: { equals: "ingest" } } })
    );
  });

  it("ends the pass when a run fails instead of retrying at once", async () => {
    const payload = payloadStub();
    payload.jobs.run.mockRejectedValue(new Error("database gone"));

    await runQueuePass(payload, { queue: "ingest", limit: 10 }, signal(), slotsStub());

    expect(payload.jobs.run).toHaveBeenCalledOnce();
  });

  it("starts nothing while every slot is used", async () => {
    const payload = payloadStub();
    await runQueuePass(payload, { queue: "ingest", limit: 10 }, signal(), slotsStub(10));

    expect(payload.jobs.handleSchedules).toHaveBeenCalledOnce();
    expect(payload.jobs.run).not.toHaveBeenCalled();
  });

  it("starts nothing when shutdown begins while the processing jobs are read", async () => {
    const controller = new AbortController();
    const payload = payloadStub();
    payload.find.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve({ docs: [] } as never);
    });

    await runQueuePass(payload, { queue: "ingest", limit: 10 }, controller.signal, slotsStub());

    expect(payload.jobs.run).not.toHaveBeenCalled();
  });

  it("starts nothing when shutdown begins while schedules are queued", async () => {
    const controller = new AbortController();
    const payload = payloadStub();
    payload.jobs.handleSchedules.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve({} as never);
    });

    await runQueuePass(payload, { allQueues: true, limit: 10 }, controller.signal, slotsStub());

    expect(payload.jobs.run).not.toHaveBeenCalled();
  });
});
