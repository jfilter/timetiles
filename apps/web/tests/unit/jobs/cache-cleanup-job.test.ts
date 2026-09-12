/**
 * Unit tests for Cache Cleanup Job Handler.
 *
 * Tests the cache-cleanup job which cleans up expired cache entries
 * and returns cleanup statistics.
 *
 * @module
 */

import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { cacheCleanupJob } from "@/lib/jobs/handlers/cache-cleanup-job";
import { createMockContext, createMockPayload } from "@/tests/setup/factories";

// Mock dependencies
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logError: vi.fn(),
}));

const mockCleanup = vi.fn();
const mockGetStats = vi.fn();
const mockLocationCleanup = vi.fn();

vi.mock("@/lib/services/geocoding/geocoding-service", () => ({
  createGeocodingService: () => ({ cleanupCache: mockLocationCleanup }),
}));

vi.mock("@/lib/services/cache", () => ({ getUrlFetchCache: () => ({ cleanup: mockCleanup, getStats: mockGetStats }) }));

describe.sequential("cacheCleanupJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCleanup.mockResolvedValue(5);
    mockGetStats.mockResolvedValue({ size: 10 });
    mockLocationCleanup.mockResolvedValue(3);
  });

  it("schedules cleanup in the worker that owns the ingest cache", () => {
    const compose = parse(
      readFileSync(new URL("../../../../../deployment/docker-compose.prod.yml", import.meta.url), "utf8")
    );
    const command: string[] = compose.services["worker-ingest"].command;

    expect(cacheCleanupJob.schedule).toEqual([{ cron: "0 */6 * * *", queue: "ingest" }]);
    expect(command[command.indexOf("--queue") + 1]).toBe("ingest");
    expect(command).toContain("--handle-schedules");
  });

  it("should clean cache and return success output", async () => {
    mockCleanup.mockResolvedValue(5);
    mockGetStats.mockResolvedValue({ size: 10 });

    const result = await cacheCleanupJob.handler(createMockContext(createMockPayload(), {}));

    expect(result.output.success).toBe(true);
    expect(result.output.totalCleaned).toBe(8);
    expect(result.output.totalEvicted).toBe(0);
    expect(result.output.duration).toEqual(expect.any(Number));
    expect(result.output.results).toEqual({
      urlFetchCache: { cleaned: 5, stats: { size: 10 } },
      locationCache: { cleaned: 3 },
    });
  });

  it("should throw when cleanup fails so Payload can retry the job", async () => {
    mockCleanup.mockRejectedValue(new Error("Cache storage unavailable"));

    await expect(cacheCleanupJob.handler(createMockContext(createMockPayload(), {}))).rejects.toThrow(
      "Cache storage unavailable"
    );
  });

  it("should rethrow non-Error cleanup failures", async () => {
    mockCleanup.mockRejectedValue("something went wrong");

    await expect(cacheCleanupJob.handler(createMockContext(createMockPayload(), {}))).rejects.toBe(
      "something went wrong"
    );
  });

  it("propagates location cleanup failures for Payload retries", async () => {
    mockLocationCleanup.mockRejectedValue(new Error("Location cache unavailable"));
    await expect(cacheCleanupJob.handler(createMockContext(createMockPayload(), {}))).rejects.toThrow(
      "Location cache unavailable"
    );
  });
});
