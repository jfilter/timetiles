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

const mocks = vi.hoisted(() => {
  const mockPayload = {
    find: vi.fn(),
    update: vi.fn(),
    jobs: {
      queue: vi.fn(),
    },
  };
  const mockGetPayload = vi.fn().mockResolvedValue(mockPayload);
  const mockRateLimitService = {
    checkConfiguredRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  };
  return { mockPayload, mockGetPayload, mockRateLimitService };
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

const { mockPayload, mockRateLimitService } = mocks;

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
  return new Request("http://localhost/api/webhooks/trigger/test-token-abc", {
    method: "POST",
  });
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
    mockPayload.update.mockResolvedValue({ id: 1 });
    mockPayload.jobs.queue.mockResolvedValue({ id: "job-456" });
  });

  it("should revert lastStatus when job queue fails (Bug 22)", async () => {
    mockPayload.find.mockResolvedValue({
      docs: [{ ...mockScheduledImport, lastStatus: "success" }],
    });
    mockPayload.jobs.queue.mockRejectedValue(new Error("Queue connection failed"));

    const response = await POST(createRequest() as never, createContext("test-token-abc"));

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Failed to queue import job");

    // Verify that lastStatus was reverted to its previous value
    const updateCalls = mockPayload.update.mock.calls;
    expect(updateCalls).toHaveLength(2);
    // First call: set to "running"
    expect(updateCalls[0]![0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ lastStatus: "running" }),
      })
    );
    // Second call: revert to previous status "success"
    expect(updateCalls[1]![0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ lastStatus: "success" }),
      })
    );
  });

  it("should revert to null when lastStatus was undefined (Bug 22)", async () => {
    mockPayload.find.mockResolvedValue({
      docs: [{ ...mockScheduledImport, lastStatus: undefined }],
    });
    mockPayload.jobs.queue.mockRejectedValue(new Error("Queue error"));

    const response = await POST(createRequest() as never, createContext("test-token-abc"));

    expect(response.status).toBe(500);

    const updateCalls = mockPayload.update.mock.calls;
    expect(updateCalls).toHaveLength(2);
    // Second call should revert to null (the fallback for undefined)
    expect(updateCalls[1]![0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ lastStatus: null }),
      })
    );
  });

  it("should not record premature success in execution history (Bug 23)", async () => {
    const response = await POST(createRequest() as never, createContext("test-token-abc"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);

    // The statistics update should NOT contain executionHistory with "success" status
    const updateCalls = mockPayload.update.mock.calls;
    const statsUpdateCall = updateCalls.find(
      (call: unknown[]) =>
        (call[0] as Record<string, unknown>).data && (call[0] as { data: Record<string, unknown> }).data.statistics
    );
    expect(statsUpdateCall).toBeDefined();
    // The stats update should not include executionHistory at all
    const statsData = (statsUpdateCall![0] as { data: Record<string, unknown> }).data;
    expect(statsData.executionHistory).toBeUndefined();
    // But it should update totalRuns
    expect(statsData.statistics).toEqual(expect.objectContaining({ totalRuns: 6 }));
  });

  it("should skip when import is already running", async () => {
    mockPayload.find.mockResolvedValue({
      docs: [{ ...mockScheduledImport, lastStatus: "running" }],
    });

    const response = await POST(createRequest() as never, createContext("test-token-abc"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("skipped");
    expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
  });

  it("should successfully trigger and update statistics", async () => {
    const response = await POST(createRequest() as never, createContext("test-token-abc"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe("triggered");
    expect(data.jobId).toBe("job-456");
    expect(mockPayload.jobs.queue).toHaveBeenCalled();
  });
});
