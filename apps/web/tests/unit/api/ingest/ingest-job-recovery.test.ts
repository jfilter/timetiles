/**
 * Unit tests for ingest-job recovery routes.
 *
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";

const mocks = vi.hoisted(() => ({ safeFindByID: vi.fn() }));

vi.mock("payload", () => ({
  createLocalReq: vi.fn(({ user }, payload) => ({ payload, user, context: {} })),
  initTransaction: vi.fn().mockResolvedValue(true),
  commitTransaction: vi.fn().mockResolvedValue(undefined),
  killTransaction: vi.fn().mockResolvedValue(undefined),
}));

/** Chainable mock for the retry route's raw `payload.db.drizzle.update(...).set(...).where(...).returning(...)` claim. */
const makeDrizzleUpdateMock = (returning: unknown[]) => {
  const chain = {
    from: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returning),
    for: vi.fn().mockResolvedValue([{ stage: PROCESSING_STAGE.FAILED }]),
  };
  return { update: vi.fn().mockReturnValue(chain), select: vi.fn().mockReturnValue(chain), chain };
};

class MockValidationError extends Error {}

vi.mock("@/lib/api", () => ({
  apiRoute: (config: { handler: (...args: never[]) => unknown }) => config.handler,
  safeFindByID: mocks.safeFindByID,
  ValidationError: MockValidationError,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logError: vi.fn(),
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { POST: retryPost } = await import("@/app/api/ingest-jobs/[id]/retry/route");
const { POST: resetPost } = await import("@/app/api/ingest-jobs/[id]/reset/route");
const { commitTransaction, killTransaction } = await import("payload");

describe.sequential("ingest-job recovery routes", () => {
  let payload: {
    jobs: { queue: ReturnType<typeof vi.fn> };
    update: ReturnType<typeof vi.fn>;
    db: { drizzle: ReturnType<typeof makeDrizzleUpdateMock> };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    payload = {
      jobs: { queue: vi.fn().mockResolvedValue({ id: "wf-1" }) },
      update: vi.fn().mockResolvedValue({}),
      // The retry route claims the job via a raw drizzle UPDATE ... RETURNING;
      // one matching row means the claim succeeded.
      db: { drizzle: makeDrizzleUpdateMock([{ id: 1 }]) },
    };
  });

  it("retries failed jobs from analyze-duplicates instead of detect-schema", async () => {
    mocks.safeFindByID.mockResolvedValue({ id: 17, stage: PROCESSING_STAGE.FAILED });

    await retryPost({ payload, user: { id: 99 }, params: { id: "17" } } as never, {} as never);

    expect(payload.jobs.queue).toHaveBeenCalledWith({
      workflow: "ingest-process",
      input: { ingestJobId: "17", resumeFrom: "analyze-duplicates" },
      req: expect.objectContaining({ payload }),
    });
    expect(commitTransaction).toHaveBeenCalledWith(payload.jobs.queue.mock.calls[0]?.[0].req);
  });

  it("admin reset maps analyze-duplicates back to a real full restart", async () => {
    mocks.safeFindByID.mockResolvedValue({ id: 42, stage: PROCESSING_STAGE.FAILED });

    await resetPost(
      {
        payload,
        user: { id: 1, email: "admin@example.com" },
        params: { id: "42" },
        body: { targetStage: PROCESSING_STAGE.ANALYZE_DUPLICATES },
      } as never,
      {} as never
    );

    expect(payload.update).toHaveBeenCalledWith({
      collection: "ingest-jobs",
      id: 42,
      data: { stage: PROCESSING_STAGE.ANALYZE_DUPLICATES, errorLog: null },
      req: expect.objectContaining({ payload }),
    });
    expect(payload.jobs.queue).toHaveBeenCalledWith({
      workflow: "ingest-process",
      input: { ingestJobId: "42", resumeFrom: "analyze-duplicates" },
      req: payload.update.mock.calls[0]?.[0].req,
    });
    expect(commitTransaction).toHaveBeenCalled();
    expect(killTransaction).not.toHaveBeenCalled();
  });

  it.each(["reset", "retry"])("rolls back the complete %s when queueing fails", async (operation) => {
    mocks.safeFindByID.mockResolvedValue({ id: 42, stage: PROCESSING_STAGE.FAILED });
    const error = new Error("Queue unavailable");
    payload.jobs.queue.mockRejectedValue(error);
    await expect(
      (operation === "reset" ? resetPost : retryPost)(
        {
          payload,
          user: { id: 1 },
          params: { id: "42" },
          body: { targetStage: PROCESSING_STAGE.ANALYZE_DUPLICATES },
        } as never,
        {} as never
      )
    ).rejects.toBe(error);
    expect(killTransaction).toHaveBeenCalledWith(payload.jobs.queue.mock.calls[0]?.[0].req);
    expect(commitTransaction).not.toHaveBeenCalled();
    expect(payload.update).toHaveBeenCalledTimes(operation === "reset" ? 1 : 0);
  });
});
