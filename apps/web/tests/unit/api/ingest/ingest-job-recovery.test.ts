/**
 * Unit tests for ingest-job recovery routes.
 *
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";

const mocks = vi.hoisted(() => ({ safeFindByID: vi.fn() }));

class MockValidationError extends Error {}

vi.mock("@/lib/api", () => ({
  apiRoute: (config: { handler: (...args: never[]) => unknown }) => config.handler,
  safeFindByID: mocks.safeFindByID,
  ValidationError: MockValidationError,
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { POST: retryPost } = await import("@/app/api/ingest-jobs/[id]/retry/route");
const { POST: resetPost } = await import("@/app/api/ingest-jobs/[id]/reset/route");

describe.sequential("ingest-job recovery routes", () => {
  let payload: { jobs: { queue: ReturnType<typeof vi.fn> }; update: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    payload = { jobs: { queue: vi.fn().mockResolvedValue({ id: "wf-1" }) }, update: vi.fn().mockResolvedValue({}) };
  });

  it("retries failed jobs from analyze-duplicates instead of detect-schema", async () => {
    mocks.safeFindByID.mockResolvedValue({ id: 17, stage: PROCESSING_STAGE.FAILED });

    await retryPost({ payload, user: { id: 99 }, params: { id: "17" } } as never, {} as never);

    expect(payload.jobs.queue).toHaveBeenCalledWith({
      workflow: "ingest-process",
      input: { ingestJobId: "17", resumeFrom: "analyze-duplicates" },
    });
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
    });
    expect(payload.jobs.queue).toHaveBeenCalledWith({
      workflow: "ingest-process",
      input: { ingestJobId: "42", resumeFrom: "analyze-duplicates" },
    });
  });
});
