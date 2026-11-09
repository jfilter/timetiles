/**
 * Integration test for the job worker's one-job runs against the real queue.
 *
 * @module
 * @category Tests
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runQueuePass, runWorkerLoop } from "@/lib/jobs/utils/worker-loop";

import { createIntegrationTestEnvironment } from "../../setup/integration/environment";

describe("job worker slots", () => {
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("works off the queue with one run per job and stops at the empty queue", async () => {
    const queueJob = () => payload.jobs.queue({ task: "cache-cleanup", input: {}, queue: "ingest" });
    const queued = await Promise.all([queueJob(), queueJob()]);
    const run = vi.fn(payload.jobs.run);
    const worker = {
      find: payload.find.bind(payload),
      jobs: { handleSchedules: vi.fn(() => Promise.resolve({} as never)), run },
    };
    const controller = new AbortController();

    await runWorkerLoop(
      async (slots) => {
        await runQueuePass(worker, { queue: "ingest", limit: 10 }, controller.signal, slots);
        controller.abort();
      },
      { intervalMs: 0, signal: controller.signal }
    );

    expect(run).toHaveBeenCalledTimes(3);
    const open = await payload.find({
      collection: "payload-jobs",
      where: { id: { in: queued.map((job) => job.id) }, completedAt: { exists: false } },
    });
    expect(open.totalDocs).toBe(0);
  });
});
