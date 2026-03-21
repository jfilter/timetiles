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
  const mockDrizzleExecute = vi.fn();
  const mockPayload = {
    find: vi.fn(),
    update: vi.fn(),
    jobs: { queue: vi.fn() },
    db: { drizzle: { execute: mockDrizzleExecute } },
  };
  const mockGetPayload = vi.fn().mockResolvedValue(mockPayload);
  const mockRateLimitService = { checkConfiguredRateLimit: vi.fn().mockReturnValue({ allowed: true }) };
  return { mockPayload, mockGetPayload, mockRateLimitService, mockDrizzleExecute };
});

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/services/rate-limit-service", () => ({
  getRateLimitService: () => mocks.mockRateLimitService,
  RATE_LIMITS: { WEBHOOK_TRIGGER: {} },
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhooks/trigger/[token]/route";

const { mockPayload, mockRateLimitService, mockDrizzleExecute } = mocks;

const mockScheduledImport = {
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
    mockPayload.find.mockResolvedValue({ docs: [{ ...mockScheduledImport }] });
    // Atomic claim via raw SQL returns { rows: [{ id }] } on success
    mockDrizzleExecute.mockResolvedValue({ rows: [{ id: 1 }] });
    mockPayload.update.mockResolvedValue({ id: 1 });
    mockPayload.jobs.queue.mockResolvedValue({ id: "job-456" });
  });

  it("should revert lastStatus when job queue fails (Bug 22)", async () => {
    mockPayload.find.mockResolvedValue({ docs: [{ ...mockScheduledImport, lastStatus: "success" }] });
    mockPayload.jobs.queue.mockRejectedValue(new Error("Queue connection failed"));

    const response = await POST(createRequest() as never, createContext("test-token-abc"));

    expect(response.status).toBe(500);

    // Atomic claim happens via raw SQL (drizzle.execute), not payload.update
    expect(mockDrizzleExecute).toHaveBeenCalledOnce();

    // payload.update calls: [0] = metadata update (alreadyClaimed), [1] = revert
    const updateCalls = mockPayload.update.mock.calls;
    expect(updateCalls).toHaveLength(2);
    // First call: triggerScheduledImport updates metadata (status already claimed via SQL)
    expect(updateCalls[0]![0]).toEqual(
      expect.objectContaining({ data: expect.objectContaining({ currentRetries: 0 }) })
    );
    // Second call: queueWebhookImport reverts to previous status "success"
    expect(updateCalls[1]![0]).toEqual(
      expect.objectContaining({ data: expect.objectContaining({ lastStatus: "success" }) })
    );
  });

  it("should revert to null when lastStatus was undefined (Bug 22)", async () => {
    mockPayload.find.mockResolvedValue({ docs: [{ ...mockScheduledImport, lastStatus: undefined }] });
    mockPayload.jobs.queue.mockRejectedValue(new Error("Queue error"));

    const response = await POST(createRequest() as never, createContext("test-token-abc"));

    expect(response.status).toBe(500);

    const updateCalls = mockPayload.update.mock.calls;
    // [0] = pre-queue running guard, [1] = revert
    expect(updateCalls).toHaveLength(2);
    // Second call should revert to null (the fallback for undefined)
    expect(updateCalls[1]![0]).toEqual(
      expect.objectContaining({ data: expect.objectContaining({ lastStatus: null }) })
    );
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
    mockPayload.find.mockResolvedValue({ docs: [{ ...mockScheduledImport, lastStatus: "running" }] });
    // Atomic SQL claim returns empty rows because lastStatus IS "running"
    mockDrizzleExecute.mockResolvedValue({ rows: [] });

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
});
