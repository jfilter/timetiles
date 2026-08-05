/**
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as LoggerModule from "@/lib/logger";

// Mocked before import so job-completion.ts picks up the mock.
const mocks = vi.hoisted(() => ({
  checkAndIncrementUsage: vi.fn(),
  decrementUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/quota-service", () => ({
  createQuotaService: vi.fn(() => ({
    checkAndIncrementUsage: mocks.checkAndIncrementUsage,
    decrementUsage: mocks.decrementUsage,
  })),
}));

vi.mock("@/lib/ingest/types/geocoding", () => ({ getIngestGeocodingResults: vi.fn(() => ({})) }));

vi.mock("@/lib/logger", async () => {
  const actual = await vi.importActual<typeof LoggerModule>("@/lib/logger");
  return { ...actual, createJobLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn() })) };
});

import { markJobCompleted } from "@/lib/jobs/handlers/create-events-batch/job-completion";

describe("markJobCompleted quota reconciliation", () => {
  let mockPayload: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decrementUsage.mockResolvedValue(undefined);

    mockPayload = {
      findByID: vi.fn(({ collection }: { collection: string }) => {
        if (collection === "ingest-jobs") {
          return Promise.resolve({
            id: "import-123",
            ingestFile: "file-789",
            duplicates: { internal: [], external: [], summary: {} },
            errors: [],
          });
        }
        if (collection === "ingest-files") {
          return Promise.resolve({ id: "file-789", user: { id: "user-1", role: "user" } });
        }
        return Promise.resolve(null);
      }),
      count: vi.fn().mockResolvedValue({ totalDocs: 505 }),
      update: vi.fn().mockResolvedValue({}),
    };
  });

  it("does not throw when a post-import top-up crosses the quota limit, and calls it non-throwing", async () => {
    // A user with 3 events of remaining budget imports 505 events reserved at
    // 500 — the +5 top-up crosses the limit. checkAndIncrementUsage must be
    // called with throwOnExceeded=false so this can't reject and roll back
    // the 505 already-committed events.
    mocks.checkAndIncrementUsage.mockImplementation(
      (_user: unknown, _key: string, _amount: number, _req: unknown, throwOnExceeded?: boolean) => {
        if (throwOnExceeded !== false) {
          throw new Error("QUOTA_EXCEEDED: TOTAL_EVENTS");
        }
        return Promise.resolve(false);
      }
    );

    await expect(markJobCompleted(mockPayload, "import-123", 500, 0)).resolves.toBe(505);

    expect(mocks.checkAndIncrementUsage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      "TOTAL_EVENTS",
      5,
      undefined,
      false
    );
  });
});
