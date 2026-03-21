/**
 * Unit tests for the scraper manual trigger route.
 *
 * Tests the POST /api/scrapers/[id]/run apiRoute handler covering
 * feature flag checks, ownership validation, concurrency claims, and job queuing.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

import { TEST_CREDENTIALS, TEST_EMAILS } from "@/tests/constants/test-credentials";

const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockIsFeatureEnabled: vi.fn(),
  mockClaimScraperRunning: vi.fn(),
}));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/services/feature-flag-service", () => ({ isFeatureEnabled: mocks.mockIsFeatureEnabled }));
vi.mock("@/lib/services/webhook-registry", () => ({ claimScraperRunning: mocks.mockClaimScraperRunning }));

import { NextRequest } from "next/server";
import { getPayload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { POST } = await import("@/app/api/scrapers/[id]/run/route");

const mockUser = { id: 1, email: TEST_EMAILS.user, role: "user" };

const mockScraper = { id: 10, name: "Test Scraper", webhookEnabled: true, repo: { id: 5, createdBy: { id: 1 } } };

const createMockPayload = () => ({
  auth: vi.fn().mockResolvedValue({ user: mockUser }),
  findByID: vi.fn(),
  jobs: { queue: vi.fn().mockResolvedValue({ id: "job-abc" }) },
});

const createRequest = () =>
  new NextRequest("http://localhost/api/scrapers/10/run", {
    method: "POST",
    headers: new Headers({ Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}` }),
  });

// oxlint-disable-next-line promise/prefer-await-to-then
const createParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe.sequential("POST /api/scrapers/[id]/run", () => {
  let mockPayload: ReturnType<typeof createMockPayload>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload = createMockPayload();
    mocks.mockGetPayload.mockResolvedValue(mockPayload);
    vi.mocked(getPayload).mockReset();
    vi.mocked(getPayload).mockResolvedValue(mockPayload as any);

    mocks.mockIsFeatureEnabled.mockResolvedValue(true);
    mocks.mockClaimScraperRunning.mockResolvedValue(true);
    mockPayload.findByID.mockResolvedValue(mockScraper);
  });

  it("returns 403 when feature flag is disabled", async () => {
    mocks.mockIsFeatureEnabled.mockResolvedValue(false);

    const response = await POST(createRequest(), createParams("10"));

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Scraper feature is not enabled");
    expect(mockPayload.findByID).not.toHaveBeenCalled();
  });

  it("returns 404 when scraper not found (findByID throws)", async () => {
    mockPayload.findByID.mockRejectedValue(new Error("Not Found"));

    const response = await POST(createRequest(), createParams("10"));

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  it("returns 403 when user does not own the scraper repo", async () => {
    const otherUserScraper = { ...mockScraper, repo: { id: 5, createdBy: { id: 999 } } };
    mockPayload.findByID.mockResolvedValue(otherUserScraper);

    const response = await POST(createRequest(), createParams("10"));

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Not authorized");
    expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
  });

  it("allows admin to trigger any scraper regardless of ownership", async () => {
    const adminUser = { id: 2, email: TEST_EMAILS.admin, role: "admin" };
    mockPayload.auth.mockResolvedValue({ user: adminUser });
    const otherUserScraper = { ...mockScraper, repo: { id: 5, createdBy: { id: 999 } } };
    mockPayload.findByID.mockResolvedValue(otherUserScraper);

    const response = await POST(createRequest(), createParams("10"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe("Scraper run queued");
  });

  it("returns 409 when claimScraperRunning returns false", async () => {
    mocks.mockClaimScraperRunning.mockResolvedValue(false);

    const response = await POST(createRequest(), createParams("10"));

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toBe("Scraper is already running");
    expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
  });

  it("queues scraper-execution job with correct input on success", async () => {
    const response = await POST(createRequest(), createParams("10"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe("Scraper run queued");

    expect(mockPayload.jobs.queue).toHaveBeenCalledWith({
      task: "scraper-execution",
      input: { scraperId: 10, triggeredBy: "manual" },
    });
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

    const response = await POST(createRequest(), createParams("10"));

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Authentication required");
  });
});
