/**
 * Unit tests for ingest-job recovery routes.
 *
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";

const mocks = vi.hoisted(() => ({ safeFindByID: vi.fn(), queueIngestProcess: vi.fn() }));

vi.mock("@/lib/ingest/ingest-runs", () => ({ queueIngestProcess: mocks.queueIngestProcess }));

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
    for: vi.fn().mockResolvedValue([{ stage: PROCESSING_STAGE.FAILED, filename: "source.csv" }]),
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

describe("ingest-job recovery routes", () => {
  let payload: { update: ReturnType<typeof vi.fn>; db: { drizzle: ReturnType<typeof makeDrizzleUpdateMock> } };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueIngestProcess.mockResolvedValue(1);
    payload = {
      update: vi.fn().mockResolvedValue({}),
      // The retry route claims the job via a raw drizzle UPDATE ... RETURNING;
      // one matching row means the claim succeeded.
      db: { drizzle: makeDrizzleUpdateMock([{ id: 1 }]) },
    };
  });

  it("retries failed jobs from analyze-duplicates instead of detect-schema", async () => {
    mocks.safeFindByID.mockResolvedValue({ id: 17, stage: PROCESSING_STAGE.FAILED, ingestFile: 1 });

    await retryPost({ payload, user: { id: 99 }, params: { id: "17" } } as never, {} as never);

    expect(mocks.queueIngestProcess).toHaveBeenCalledWith(
      expect.objectContaining({ payload }),
      17,
      "analyze-duplicates"
    );
    expect(commitTransaction).toHaveBeenCalledWith(mocks.queueIngestProcess.mock.calls[0]?.[0]);
  });

  it("admin reset maps analyze-duplicates back to a real full restart", async () => {
    mocks.safeFindByID.mockResolvedValue({ id: 42, stage: PROCESSING_STAGE.FAILED, ingestFile: 1 });

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
    expect(mocks.queueIngestProcess).toHaveBeenCalledWith(
      payload.update.mock.calls[1]?.[0].req,
      42,
      "analyze-duplicates"
    );
    expect(commitTransaction).toHaveBeenCalled();
    expect(killTransaction).not.toHaveBeenCalled();
  });

  it.each(["reset", "retry"])("rolls back the complete %s when queueing fails", async (operation) => {
    mocks.safeFindByID.mockResolvedValue({ id: 42, stage: PROCESSING_STAGE.FAILED, ingestFile: 1 });
    const error = new Error("Queue unavailable");
    mocks.queueIngestProcess.mockRejectedValue(error);
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
    expect(killTransaction).toHaveBeenCalledWith(mocks.queueIngestProcess.mock.calls[0]?.[0]);
    expect(commitTransaction).not.toHaveBeenCalled();
    expect(payload.update).toHaveBeenCalledTimes(operation === "reset" ? 2 : 1);
  });
});
