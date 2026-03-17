/**
 * Unit tests for the scraper repo force-sync route.
 *
 * Tests the POST /api/scraper-repos/[id]/sync apiRoute handler covering
 * feature flag checks, ownership validation, and job queuing.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { TEST_CREDENTIALS, TEST_EMAILS } from "@/tests/constants/test-credentials";

const mocks = vi.hoisted(() => ({ mockGetPayload: vi.fn(), mockIsFeatureEnabled: vi.fn() }));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/services/feature-flag-service", () => ({ isFeatureEnabled: mocks.mockIsFeatureEnabled }));

import { NextRequest } from "next/server";
import { getPayload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { POST } = await import("@/app/api/scraper-repos/[id]/sync/route");

const mockUser = { id: 1, email: TEST_EMAILS.user, role: "user" };

const mockRepo = { id: 5, repoUrl: "https://github.com/test/repo", createdBy: { id: 1 } };

const createMockPayload = () => ({
  auth: vi.fn().mockResolvedValue({ user: mockUser }),
  findByID: vi.fn(),
  jobs: { queue: vi.fn().mockResolvedValue({ id: "job-sync-1" }) },
});

const createRequest = () =>
  new NextRequest("http://localhost/api/scraper-repos/5/sync", {
    method: "POST",
    headers: new Headers({ Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}` }),
  });

// oxlint-disable-next-line promise/prefer-await-to-then
const createParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe.sequential("POST /api/scraper-repos/[id]/sync", () => {
  let mockPayload: ReturnType<typeof createMockPayload>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload = createMockPayload();
    mocks.mockGetPayload.mockResolvedValue(mockPayload);
    vi.mocked(getPayload).mockReset();
    vi.mocked(getPayload).mockResolvedValue(mockPayload as any);

    mocks.mockIsFeatureEnabled.mockResolvedValue(true);
    mockPayload.findByID.mockResolvedValue(mockRepo);
  });

  it("returns 403 when feature flag is disabled", async () => {
    mocks.mockIsFeatureEnabled.mockResolvedValue(false);

    const response = await POST(createRequest(), createParams("5"));

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Scraper feature is not enabled");
    expect(mockPayload.findByID).not.toHaveBeenCalled();
  });

  it("returns 404 when repo not found", async () => {
    mockPayload.findByID.mockRejectedValue(new Error("Not Found"));

    const response = await POST(createRequest(), createParams("5"));

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  it("returns 403 when user does not own the repo", async () => {
    const otherRepo = { ...mockRepo, createdBy: { id: 999 } };
    mockPayload.findByID.mockResolvedValue(otherRepo);

    const response = await POST(createRequest(), createParams("5"));

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Not authorized");
    expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
  });

  it("queues scraper-repo-sync job on success", async () => {
    const response = await POST(createRequest(), createParams("5"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe("Repository sync queued");

    expect(mockPayload.jobs.queue).toHaveBeenCalledWith({ task: "scraper-repo-sync", input: { scraperRepoId: 5 } });
  });

  it("allows admin to sync any repo regardless of ownership", async () => {
    const adminUser = { id: 2, email: TEST_EMAILS.admin, role: "admin" };
    mockPayload.auth.mockResolvedValue({ user: adminUser });
    const otherRepo = { ...mockRepo, createdBy: { id: 999 } };
    mockPayload.findByID.mockResolvedValue(otherRepo);

    const response = await POST(createRequest(), createParams("5"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe("Repository sync queued");
  });

  it("returns 422 for non-numeric ID", async () => {
    const response = await POST(createRequest(), createParams("abc"));

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toBe("Validation failed");
    expect(mockPayload.findByID).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });

    const response = await POST(createRequest(), createParams("5"));

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Authentication required");
  });
});
