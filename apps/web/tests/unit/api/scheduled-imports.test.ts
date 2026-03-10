/**
 * Unit tests for the scheduled-imports trigger custom endpoint.
 *
 * Tests the POST /:id/trigger Payload custom endpoint handler.
 * GET/PATCH/DELETE are handled by Payload's built-in REST API with
 * collection-level access control (tested in integration/security tests).
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it, vi } from "vitest";

import { triggerEndpoint } from "@/lib/collections/scheduled-imports/endpoints";
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

const createMockPayload = () => ({ findByID: vi.fn(), update: vi.fn(), jobs: { queue: vi.fn() } });

/**
 * Creates a mock PayloadRequest for testing custom endpoint handlers.
 */
const createMockRequest = (
  overrides: {
    user?: typeof mockUser | null;
    routeParams?: Record<string, string>;
    payload?: ReturnType<typeof createMockPayload>;
  } = {}
) => {
  const payload = overrides.payload ?? createMockPayload();
  return {
    user: "user" in overrides ? overrides.user : mockUser,
    routeParams: overrides.routeParams ?? { id: "1" },
    payload,
  } as unknown as Parameters<typeof triggerEndpoint.handler>[0];
};

describe.sequential("POST /api/scheduled-imports/:id/trigger", () => {
  it("should return 401 when not authenticated", async () => {
    const req = createMockRequest({ user: null });

    const response = await triggerEndpoint.handler(req);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Authentication required");
  });

  it("should return 400 for missing ID", async () => {
    const req = createMockRequest({ routeParams: {} });

    const response = await triggerEndpoint.handler(req);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid ID");
  });

  it("should return 400 for non-numeric ID", async () => {
    const req = createMockRequest({ routeParams: { id: "abc" } });

    const response = await triggerEndpoint.handler(req);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid ID");
  });

  it("should return 400 for partially numeric ID", async () => {
    const mockPayload = createMockPayload();
    const req = createMockRequest({ routeParams: { id: "1abc" }, payload: mockPayload });

    const response = await triggerEndpoint.handler(req);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid ID");
    expect(mockPayload.findByID).not.toHaveBeenCalled();
    expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
  });

  it("should return 404 when schedule not found or access denied", async () => {
    const mockPayload = createMockPayload();
    mockPayload.findByID.mockRejectedValue(new Error("Not Found"));
    const req = createMockRequest({ payload: mockPayload });

    const response = await triggerEndpoint.handler(req);
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Schedule not found or access denied");
  });

  it("should enforce access control via overrideAccess: false", async () => {
    const mockPayload = createMockPayload();
    mockPayload.findByID.mockResolvedValue(mockSchedule);
    mockPayload.update.mockResolvedValue({ docs: [{ ...mockSchedule, lastStatus: "running" }], errors: [] });
    mockPayload.jobs.queue.mockResolvedValue({ id: "job-123" });
    const req = createMockRequest({ payload: mockPayload });

    await triggerEndpoint.handler(req);

    expect(mockPayload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "scheduled-imports", id: 1, user: mockUser, overrideAccess: false })
    );
  });

  it("should return 409 when import is already running (atomic claim)", async () => {
    const mockPayload = createMockPayload();
    mockPayload.findByID.mockResolvedValue({ ...mockSchedule, lastStatus: "running" });
    mockPayload.update.mockResolvedValue({ docs: [], errors: [] });
    const req = createMockRequest({ payload: mockPayload });

    const response = await triggerEndpoint.handler(req);
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
    const req = createMockRequest({ payload: mockPayload });

    const response = await triggerEndpoint.handler(req);
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
