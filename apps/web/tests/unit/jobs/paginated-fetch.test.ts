// @vitest-environment node
/**
 * Unit tests for paginated URL fetch behavior.
 *
 * @module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchWithRetry: vi.fn() }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/lib/jobs/handlers/url-fetch-job/fetch-utils", () => ({ fetchWithRetry: mocks.fetchWithRetry }));

import { fetchPaginated } from "@/lib/jobs/handlers/url-fetch-job/paginated-fetch";

describe("fetchPaginated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enforces the overall timeout across the page loop", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00.000Z"));

    mocks.fetchWithRetry.mockImplementation(() => {
      vi.setSystemTime(new Date("2026-04-28T12:00:01.001Z"));
      return {
        data: Buffer.from(JSON.stringify({ items: [{ id: 1 }, { id: 2 }] })),
        contentType: "application/json",
        attempts: 1,
      };
    });

    await expect(
      fetchPaginated(
        "https://example.test/events",
        { enabled: true, type: "page", limitParam: "limit", limitValue: 2, pageParam: "page", maxPages: 3 },
        "items",
        { timeout: 1_000 }
      )
    ).rejects.toThrow("Paginated fetch exceeded overall timeout of 1000ms");

    expect(mocks.fetchWithRetry).toHaveBeenCalledTimes(1);
  });
});
