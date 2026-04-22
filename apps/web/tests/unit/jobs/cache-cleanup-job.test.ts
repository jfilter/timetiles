/**
 * Unit tests for Cache Cleanup Job Handler.
 *
 * Tests the cache-cleanup job which cleans up expired cache entries
 * and returns cleanup statistics.
 *
 * @module
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { cacheCleanupJob } from "@/lib/jobs/handlers/cache-cleanup-job";

// Mock dependencies
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logError: vi.fn(),
}));

const mockCleanup = vi.fn();
const mockGetStats = vi.fn();

vi.mock("@/lib/services/cache", () => ({ getUrlFetchCache: () => ({ cleanup: mockCleanup, getStats: mockGetStats }) }));

describe.sequential("cacheCleanupJob", () => {
  let mockPayload: any;

  const createContext = (input: { force?: boolean } = {}) => ({
    input,
    job: { id: "job-1" },
    req: { payload: mockPayload },
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockPayload = { findByID: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  });

  it("should clean cache and return success output", async () => {
    mockCleanup.mockResolvedValue(5);
    mockGetStats.mockResolvedValue({ size: 10 });

    const result = await cacheCleanupJob.handler(createContext({ force: false }));

    expect(result.output.success).toBe(true);
    expect(result.output.totalCleaned).toBe(5);
    expect(result.output.totalEvicted).toBe(0);
    expect(result.output.duration).toEqual(expect.any(Number));
    expect(result.output.results).toEqual({ urlFetchCache: { cleaned: 5, stats: { size: 10 } } });
  });

  it("should return success:false with error message when cleanup throws", async () => {
    mockCleanup.mockRejectedValue(new Error("Cache storage unavailable"));

    const result = await cacheCleanupJob.handler(createContext({ force: true }));

    expect(result.output.success).toBe(false);
    expect(result.output.error).toBe("Cache storage unavailable");
  });

  it("should return 'Unknown error' when cleanup throws a non-Error", async () => {
    mockCleanup.mockRejectedValue("something went wrong");

    const result = await cacheCleanupJob.handler(createContext());

    expect(result.output.success).toBe(false);
    expect(result.output.error).toBe("Unknown error");
  });
});
