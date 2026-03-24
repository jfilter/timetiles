/**
 * Unit tests for POST /api/data-exports/request.
 *
 * Tests export creation, conflict detection, and job queue failure rollback.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

import { TEST_CREDENTIALS, TEST_EMAILS } from "@/tests/constants/test-credentials";

const mockSummary = { events: 100, datasets: 3 };

const mocks = vi.hoisted(() => ({ mockGetPayload: vi.fn(), mockCreateDataExportService: vi.fn() }));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/export/service", () => ({ createDataExportService: mocks.mockCreateDataExportService }));

import { NextRequest } from "next/server";
import { getPayload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { POST } = await import("@/app/api/data-exports/request/route");

const mockUser = { id: 1, email: TEST_EMAILS.user, role: "user" };

const createMockPayload = () => ({
  auth: vi.fn().mockResolvedValue({ user: mockUser }),
  find: vi.fn().mockResolvedValue({ docs: [] }),
  create: vi.fn(),
  update: vi.fn(),
  jobs: { queue: vi.fn().mockResolvedValue({ id: "job-1" }) },
});

const createRequest = () =>
  new NextRequest("http://localhost/api/data-exports/request", {
    method: "POST",
    headers: new Headers({ Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}` }),
  });

// oxlint-disable-next-line promise/prefer-await-to-then
const emptyParams = { params: Promise.resolve({}) };

describe.sequential("POST /api/data-exports/request", () => {
  let mockPayload: ReturnType<typeof createMockPayload>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload = createMockPayload();
    mocks.mockGetPayload.mockResolvedValue(mockPayload);
    vi.mocked(getPayload).mockReset();
    vi.mocked(getPayload).mockResolvedValue(mockPayload as any);
    mocks.mockCreateDataExportService.mockReturnValue({ getExportSummary: vi.fn().mockResolvedValue(mockSummary) });
  });

  it("returns 401 when not authenticated", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });

    const response = await POST(createRequest(), emptyParams);
    expect(response.status).toBe(401);
  });

  it("returns 409 when export already in progress", async () => {
    mockPayload.find.mockResolvedValue({ docs: [{ id: 99, status: "processing" }] });

    const response = await POST(createRequest(), emptyParams);
    expect(response.status).toBe(409);

    const data = await response.json();
    expect(data.error).toBe("Export already in progress");
    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("creates export record and queues job on success", async () => {
    mockPayload.find.mockResolvedValue({ docs: [] });
    mockPayload.create.mockResolvedValue({ id: 42 });
    mockPayload.jobs.queue.mockResolvedValue({ id: "job-1" });

    const response = await POST(createRequest(), emptyParams);
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.exportId).toBe(42);
    expect(data.summary).toEqual(mockSummary);

    expect(mockPayload.jobs.queue).toHaveBeenCalledWith({ task: "data-export", input: { exportId: 42 } });
  });

  it("reverts export status to failed when job queue fails", async () => {
    mockPayload.find.mockResolvedValue({ docs: [] });
    mockPayload.create.mockResolvedValue({ id: 42 });
    mockPayload.jobs.queue.mockRejectedValue(new Error("Queue connection failed"));

    const response = await POST(createRequest(), emptyParams);
    expect(response.status).toBe(500);

    // Verify rollback marked the export as failed
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "data-exports",
        id: 42,
        data: { status: "failed", errorLog: "Failed to queue export job" },
        overrideAccess: true,
      })
    );
  });

  it("returns 409 on race condition during create", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [] }) // initial check: no active export
      .mockResolvedValueOnce({ docs: [{ id: 100, status: "pending" }] }); // race check: found one
    mockPayload.create.mockRejectedValue(new Error("Unique constraint violation"));

    const response = await POST(createRequest(), emptyParams);
    expect(response.status).toBe(409);

    const data = await response.json();
    expect(data.error).toBe("Export already in progress");
  });
});
