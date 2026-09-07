/**
 * Unit tests for the two failure policies of `claimAndQueueScheduledIngest`.
 *
 * The claim stamps `lastStatus`, `lastRun` and `currentRetries` before the job is queued, so
 * what a failed queue step leaves behind is a real decision — user-initiated runs must undo it,
 * the scheduler must keep it and record a failure instead.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

vi.mock("payload", () => ({
  createLocalReq: vi.fn().mockImplementation((_options, payload) => Promise.resolve({ payload })),
  initTransaction: vi.fn().mockResolvedValue(true),
  commitTransaction: vi.fn(),
  killTransaction: vi.fn(),
}));

import { commitTransaction, initTransaction, killTransaction } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { claimAndQueueScheduledIngest, ScheduledIngestBusyError } from "@/lib/ingest/trigger-service";
import type { ScheduledIngest } from "@/payload-types";

const SCHEDULE = {
  id: 7,
  name: "Nightly",
  sourceUrl: "https://example.com/data.csv",
  lastStatus: "success",
  lastRun: "2026-08-01T03:00:00.000Z",
  currentRetries: 2,
} as unknown as ScheduledIngest;

const createPayload = (queueError?: Error) => ({
  update: vi.fn().mockResolvedValue({}),
  jobs: { queue: queueError ? vi.fn().mockRejectedValue(queueError) : vi.fn().mockResolvedValue({ id: 123 }) },
  db: {
    drizzle: {
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([{ id: SCHEDULE.id }]) }) }) }),
    },
  },
});

describe.sequential("claimAndQueueScheduledIngest failure policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores status, lastRun and currentRetries under the rollback policy", async () => {
    const payload = createPayload(new Error("Queue connection failed"));

    await expect(
      claimAndQueueScheduledIngest(payload as never, SCHEDULE, new Date(), {
        triggeredBy: "manual",
        onQueueFailure: "rollback",
      })
    ).rejects.toThrow("Queue connection failed");

    expect(killTransaction).toHaveBeenCalledWith({ payload });
    expect(commitTransaction).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
    expect(payload.jobs.queue).toHaveBeenCalledWith(expect.objectContaining({ req: { payload } }));
  });

  it("leaves the claim in place under the record-failure policy", async () => {
    const payload = createPayload(new Error("Queue connection failed"));

    await expect(
      claimAndQueueScheduledIngest(payload as never, SCHEDULE, new Date(), {
        triggeredBy: "schedule",
        nextRun: "2026-08-02T03:00:00.000Z",
        onQueueFailure: "record-failure",
      })
    ).rejects.toThrow("Queue connection failed");

    // The scheduler turns the surviving claim into a recorded failure with an advanced
    // nextRun; undoing it here would make it re-fire on the same broken import every minute.
    expect(payload.update).not.toHaveBeenCalled();
    expect(initTransaction).not.toHaveBeenCalled();
    expect(killTransaction).not.toHaveBeenCalled();
  });

  it("re-throws a lost claim untouched under either policy", async () => {
    for (const onQueueFailure of ["rollback", "record-failure"] as const) {
      const payload = createPayload();
      payload.db.drizzle.update = () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) });

      await expect(
        claimAndQueueScheduledIngest(payload as never, SCHEDULE, new Date(), { triggeredBy: "manual", onQueueFailure })
      ).rejects.toBeInstanceOf(ScheduledIngestBusyError);

      // Nothing was claimed, so there is nothing to undo — and no job was queued.
      expect(payload.update).not.toHaveBeenCalled();
      expect(payload.jobs.queue).not.toHaveBeenCalled();
    }
  });
});
