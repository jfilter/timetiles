/**
 * Unit tests for the scheduled-imports trigger route.
 *
 * Tests the POST /api/scheduled-imports/[id]/trigger apiRoute handler.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { NextRequest } from "next/server";
import { getPayload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_EMAILS } from "@/tests/constants/test-credentials";

const mockUser = { id: 1, email: TEST_EMAILS.user, role: "user" };

const mockSchedule = {
  id: 1,
  sourceUrl: "https://example.com/data.csv",
  name: "Test Import",
  enabled: true,
  lastStatus: "idle",
  createdBy: { id: 1, email: TEST_EMAILS.user },
};

const mocks = vi.hoisted(() => ({ mockGetPayload: vi.fn() }));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

// Import AFTER mocks
const { POST } = await import("@/app/api/scheduled-imports/[id]/trigger/route");

const createMockPayload = () => ({
  auth: vi.fn().mockResolvedValue({ user: mockUser }),
  findByID: vi.fn(),
  update: vi.fn(),
  jobs: { queue: vi.fn() },
});

const createRequest = () => new NextRequest("http://localhost/api/scheduled-imports/1/trigger", { method: "POST" });

describe.sequential("POST /api/scheduled-imports/[id]/trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // With isolate: false, ensure the module-level getPayload binding is configured
    mocks.mockGetPayload.mockReset();
    vi.mocked(getPayload).mockReset();
  });

  it("should return 401 when not authenticated", async () => {
    const mockPayload = createMockPayload();
    mockPayload.auth.mockResolvedValue({ user: null });
    mocks.mockGetPayload.mockResolvedValue(mockPayload);
    vi.mocked(getPayload).mockResolvedValue(mockPayload as any);

    const response = await POST(createRequest(), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(401);
  });

  it("should return 422 for non-numeric ID", async () => {
    const mockPayload = createMockPayload();
    mocks.mockGetPayload.mockResolvedValue(mockPayload);
    vi.mocked(getPayload).mockResolvedValue(mockPayload as any);

    const response = await POST(createRequest(), { params: Promise.resolve({ id: "abc" }) });
    expect(response.status).toBe(422);

    const data = await response.json();
    expect(data.error).toBe("Validation failed");
  });

  it("should return 422 for partially numeric ID", async () => {
    const mockPayload = createMockPayload();
    mocks.mockGetPayload.mockResolvedValue(mockPayload);
    vi.mocked(getPayload).mockResolvedValue(mockPayload as any);

    const response = await POST(createRequest(), { params: Promise.resolve({ id: "1abc" }) });
    expect(response.status).toBe(422);

    const data = await response.json();
    expect(data.error).toBe("Validation failed");
    expect(mockPayload.findByID).not.toHaveBeenCalled();
    expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
  });

  it("should return 404 when schedule not found or access denied", async () => {
    const mockPayload = createMockPayload();
    mockPayload.findByID.mockRejectedValue(new Error("Not Found"));
    mocks.mockGetPayload.mockResolvedValue(mockPayload);

    const response = await POST(createRequest(), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("scheduled imports not found or access denied");
  });

  it("should enforce access control via overrideAccess: false", async () => {
    const mockPayload = createMockPayload();
    mockPayload.findByID.mockResolvedValue(mockSchedule);
    mockPayload.update.mockResolvedValue({ docs: [{ ...mockSchedule, lastStatus: "running" }], errors: [] });
    mockPayload.jobs.queue.mockResolvedValue({ id: "job-123" });
    mocks.mockGetPayload.mockResolvedValue(mockPayload);

    await POST(createRequest(), { params: Promise.resolve({ id: "1" }) });

    expect(mockPayload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "scheduled-imports", id: 1, user: mockUser, overrideAccess: false })
    );
  });

  it("should return 409 when import is already running (atomic claim)", async () => {
    const mockPayload = createMockPayload();
    mockPayload.findByID.mockResolvedValue({ ...mockSchedule, lastStatus: "running" });
    mockPayload.update.mockResolvedValue({ docs: [], errors: [] });
    mocks.mockGetPayload.mockResolvedValue(mockPayload);

    const response = await POST(createRequest(), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(409);

    const data = await response.json();
    expect(data.error).toBe("Import is already running");
    expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
  });

  it("should trigger import when not already running (atomic claim succeeds)", async () => {
    const mockPayload = createMockPayload();
    mockPayload.findByID.mockResolvedValue(mockSchedule);
    mockPayload.update.mockResolvedValue({ docs: [{ ...mockSchedule, lastStatus: "running" }], errors: [] });
    mockPayload.jobs.queue.mockResolvedValue({ id: "job-123" });
    mocks.mockGetPayload.mockResolvedValue(mockPayload);

    const response = await POST(createRequest(), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Import triggered");

    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "scheduled-imports",
        where: { id: { equals: 1 }, lastStatus: { not_equals: "running" } },
        overrideAccess: true,
      })
    );

    expect(mockPayload.jobs.queue).toHaveBeenCalledWith({
      task: "url-fetch",
      input: expect.objectContaining({
        scheduledImportId: "1",
        sourceUrl: "https://example.com/data.csv",
        triggeredBy: "manual",
      }),
    });
  });
});
