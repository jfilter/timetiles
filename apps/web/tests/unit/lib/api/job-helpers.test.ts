/**
 * Unit tests for queueJobWithRollback helper.
 *
 * @module
 */
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { queueJobWithRollback } from "@/lib/api/job-helpers";
import { logError } from "@/lib/logger";

vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

const createMockPayload = () => ({ jobs: { queue: vi.fn() }, update: vi.fn() });

describe("queueJobWithRollback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues the job without rollback when queue succeeds", async () => {
    const payload = createMockPayload();
    payload.jobs.queue.mockResolvedValue({ id: 1 });

    await queueJobWithRollback(payload as never, { task: "data-export", input: { exportId: 42 } } as never, {
      collection: "data-exports" as never,
      id: 42,
      data: { status: "failed" },
    });

    expect(payload.jobs.queue).toHaveBeenCalledWith({ task: "data-export", input: { exportId: 42 } });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("rolls back by ID and re-throws when queue fails", async () => {
    const payload = createMockPayload();
    const queueError = new Error("Queue connection failed");
    payload.jobs.queue.mockRejectedValue(queueError);

    await expect(
      queueJobWithRollback(payload as never, { task: "data-export", input: { exportId: 42 } } as never, {
        collection: "data-exports" as never,
        id: 42,
        data: { status: "failed", errorLog: "Queue failed" },
      })
    ).rejects.toThrow("Queue connection failed");

    expect(payload.update).toHaveBeenCalledWith({
      collection: "data-exports",
      id: 42,
      data: { status: "failed", errorLog: "Queue failed" },
      overrideAccess: true,
    });
  });

  it("rolls back by WHERE clause when no id is provided", async () => {
    const payload = createMockPayload();
    const queueError = new Error("Queue timeout");
    payload.jobs.queue.mockRejectedValue(queueError);

    await expect(
      queueJobWithRollback(payload as never, { task: "url-fetch", input: { scheduledIngestId: 7 } } as never, {
        collection: "scheduled-ingests" as never,
        where: { id: { equals: 7 } },
        data: { lastStatus: "failed" },
      })
    ).rejects.toThrow("Queue timeout");

    expect(payload.update).toHaveBeenCalledWith({
      collection: "scheduled-ingests",
      where: { id: { equals: 7 } },
      data: { lastStatus: "failed" },
      overrideAccess: true,
    });
  });

  it("uses custom context message for logging", async () => {
    const payload = createMockPayload();
    const queueError = new Error("fail");
    payload.jobs.queue.mockRejectedValue(queueError);

    await expect(
      queueJobWithRollback(
        payload as never,
        { task: "data-export", input: {} } as never,
        { collection: "data-exports" as never, id: 1, data: { status: "failed" } },
        "Custom error context"
      )
    ).rejects.toThrow("fail");

    expect(logError).toHaveBeenCalledWith(queueError, "Custom error context");
  });

  it("uses default context message with task name when no custom context", async () => {
    const payload = createMockPayload();
    const queueError = new Error("fail");
    payload.jobs.queue.mockRejectedValue(queueError);

    await expect(
      queueJobWithRollback(payload as never, { task: "scraper-execution", input: {} } as never, {
        collection: "scrapers" as never,
        id: 1,
        data: { lastRunStatus: "failed" },
      })
    ).rejects.toThrow("fail");

    expect(logError).toHaveBeenCalledWith(queueError, "Failed to queue scraper-execution job, reverting status");
  });

  it("calls logError before rollback update", async () => {
    const payload = createMockPayload();
    const queueError = new Error("connection reset");
    payload.jobs.queue.mockRejectedValue(queueError);

    await expect(
      queueJobWithRollback(payload as never, { task: "data-export", input: {} } as never, {
        collection: "data-exports" as never,
        id: 1,
        data: { status: "failed" },
      })
    ).rejects.toThrow("connection reset");

    expect(logError).toHaveBeenCalledTimes(1);
    expect(payload.update).toHaveBeenCalledTimes(1);
    expect((logError as Mock).mock.invocationCallOrder[0]!).toBeLessThan(payload.update.mock.invocationCallOrder[0]!);
  });
});
