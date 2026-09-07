/**
 * Unit tests for the webhook trigger route.
 *
 * Tests Bug 22 (status revert on queue failure) and Bug 23 (no premature
 * success in execution history).
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => {
  const mockDrizzleUpdate = vi.fn();
  const mockPayload = {
    find: vi.fn(),
    update: vi.fn(),
    jobs: { queue: vi.fn() },
    db: { drizzle: { update: mockDrizzleUpdate } },
  };
  const mockGetPayload = vi.fn().mockResolvedValue(mockPayload);
  const mockRateLimitService = { checkConfiguredRateLimit: vi.fn().mockReturnValue({ allowed: true }) };
  return { mockPayload, mockGetPayload, mockRateLimitService, mockDrizzleUpdate };
});

vi.mock("payload", () => ({
  getPayload: mocks.mockGetPayload,
  createLocalReq: vi.fn().mockImplementation((_options, payload) => Promise.resolve({ payload })),
  initTransaction: vi.fn().mockResolvedValue(true),
  commitTransaction: vi.fn(),
  killTransaction: vi.fn(),
}));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/services/rate-limit-service", () => ({
  getRateLimitService: () => mocks.mockRateLimitService,
  getClientIdentifier: () => "127.0.0.1",
  RATE_LIMITS: { WEBHOOK_TRIGGER: {}, WEBHOOK_TRIGGER_ATTEMPT: {} },
}));

import { commitTransaction, killTransaction } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhooks/trigger/[token]/route";
import { hashOpaqueValue } from "@/lib/security/hash";
import { mockLogger } from "@/tests/mocks/services/logger";

const { mockPayload, mockRateLimitService, mockDrizzleUpdate } = mocks;

const createUpdateBuilder = (result: unknown[]) => {
  const builder = {
    set: vi.fn(() => builder),
    where: vi.fn(() => builder),
    returning: vi.fn(() => Promise.resolve(result)),
  };

  return builder;
};

const mockScheduledIngest = {
  id: 1,
  name: "Test Import",
  sourceUrl: "https://example.com/data.csv",
  webhookEnabled: true,
  webhookToken: "test-token-abc",
  lastStatus: "success",
  createdBy: { id: 1 },
  catalog: { id: 10 },
  executionHistory: [],
  statistics: { totalRuns: 5, successfulRuns: 4, failedRuns: 1, averageDuration: 1000 },
};

const createRequest = () => {
  return new Request("http://localhost/api/webhooks/trigger/test-token-abc", { method: "POST" });
};

const createContext = (token: string) => ({
  // oxlint-disable-next-line promise/prefer-await-to-then
  params: Promise.resolve({ token }),
});

describe.sequential("POST /api/webhooks/trigger/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitService.checkConfiguredRateLimit.mockReturnValue({ allowed: true });
    mockPayload.find.mockResolvedValue({ docs: [{ ...mockScheduledIngest }] });
    // Atomic claim via Drizzle builder returns rows on success.
    mockDrizzleUpdate.mockImplementation(() => createUpdateBuilder([{ id: 1 }]));
    mockPayload.update.mockResolvedValue({ id: 1 });
    mockPayload.jobs.queue.mockResolvedValue({ id: "job-456" });
  });

  it.each(["success", "failed", undefined])("rolls back a failed import trigger from %s", async (lastStatus) => {
    mockPayload.find.mockResolvedValue({ docs: [{ ...mockScheduledIngest, lastStatus, currentRetries: 2 }] });
    mockPayload.jobs.queue.mockRejectedValue(new Error("Queue connection failed"));

    const response = await POST(createRequest() as never, createContext("test-token-abc"));

    expect(response.status).toBe(500);
    expect(mockDrizzleUpdate).toHaveBeenCalledOnce();
    expect(mockPayload.update).not.toHaveBeenCalled();
    expect(killTransaction).toHaveBeenCalledWith({ payload: mockPayload });
    expect(commitTransaction).not.toHaveBeenCalled();
  });

  it.each(["success", "failure", "already-running"])("closes the scraper transaction on %s", async (outcome) => {
    // Resolve the token to a scraper, not a scheduled ingest.
    mockPayload.find.mockImplementation((args: { collection: string }) => {
      if (args.collection === "scrapers") {
        return Promise.resolve({
          docs: [{ id: 7, name: "Test Scraper", webhookEnabled: true, enabled: true, repoCreatedBy: { id: 1 } }],
        });
      }
      return Promise.resolve({ docs: [] });
    });
    mockDrizzleUpdate.mockImplementation(() => createUpdateBuilder(outcome === "already-running" ? [] : [{ id: 7 }]));
    if (outcome === "failure") mockPayload.jobs.queue.mockRejectedValue(new Error("Queue down"));

    const response = await POST(createRequest() as never, createContext("test-token-abc"));

    expect(response.status).toBe(outcome === "failure" ? 500 : 200);
    expect(mockPayload.update).not.toHaveBeenCalled();
    const req = { payload: mockPayload };
    if (outcome === "failure") {
      expect(killTransaction).toHaveBeenCalledWith(req);
      expect(commitTransaction).not.toHaveBeenCalled();
    } else {
      expect(commitTransaction).toHaveBeenCalledWith(req);
      expect(killTransaction).not.toHaveBeenCalled();
    }
    if (outcome === "already-running") {
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
      expect(await response.json()).toMatchObject({ status: "skipped" });
    } else {
      expect(mockPayload.jobs.queue).toHaveBeenCalledWith(expect.objectContaining({ req }));
    }
  });

  it("should not record premature success in execution history (Bug 23)", async () => {
    const response = await POST(createRequest() as never, createContext("test-token-abc"));

    expect(response.status).toBe(200);

    // At queue time, neither executionHistory nor statistics should be updated.
    // totalRuns is incremented by the job handler on completion, not at queue time.
    const updateCalls = mockPayload.update.mock.calls;
    for (const call of updateCalls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      expect(data.executionHistory).toBeUndefined();
      expect(data.statistics).toBeUndefined();
    }
  });

  it("should skip when import is already running", async () => {
    mockPayload.find.mockResolvedValue({ docs: [{ ...mockScheduledIngest, lastStatus: "running" }] });
    // Atomic claim returns no rows because lastStatus is already "running".
    mockDrizzleUpdate.mockImplementation(() => createUpdateBuilder([]));

    const response = await POST(createRequest() as never, createContext("test-token-abc"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("skipped");
    expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("should successfully trigger and update statistics", async () => {
    const response = await POST(createRequest() as never, createContext("test-token-abc"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("triggered");
    expect(data.jobId).toBe("job-456");
    expect(mockPayload.jobs.queue).toHaveBeenCalled();
  });

  it("logs a hashed fingerprint instead of a token prefix for invalid webhooks", async () => {
    const invalidToken = "invalid-token-xyz";
    mockPayload.find.mockResolvedValue({ docs: [] });

    const response = await POST(createRequest() as never, createContext(invalidToken));

    expect(response.status).toBe(401);
    expect(mockLogger.logger.warn).toHaveBeenCalledWith(
      { tokenHash: hashOpaqueValue(invalidToken) },
      "Webhook trigger failed - invalid or disabled token"
    );
  });
});
