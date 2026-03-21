/**
 * Unit tests for default site gating in API routes and auth helpers.
 *
 * Tests that:
 * - `requireDefaultSite` throws ForbiddenError for non-default sites
 * - `apiRoute({ site: "default" })` rejects requests from non-default sites
 * - Default sites and null sites (no multi-site) are allowed through
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { TEST_CREDENTIALS, TEST_EMAILS } from "@/tests/constants/test-credentials";
import { mockResolveSite } from "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => ({ mockGetPayload: vi.fn() }));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

import { NextRequest } from "next/server";
import { getPayload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireDefaultSite } = await import("@/lib/api/auth-helpers");
const { apiRoute } = await import("@/lib/api/handler");

const mockUser = { id: 1, email: TEST_EMAILS.user, role: "user" };

const createMockPayload = () => ({ auth: vi.fn().mockResolvedValue({ user: mockUser }), find: vi.fn() });

const createRequest = (host = "localhost:3000") =>
  new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers: new Headers({ Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}`, host }),
    body: JSON.stringify({}),
  });

// oxlint-disable-next-line promise/prefer-await-to-then
const createParams = () => ({ params: Promise.resolve({}) });

describe("requireDefaultSite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow when site is null (no multi-site configured)", async () => {
    mockResolveSite.mockResolvedValue(null);
    const payload = createMockPayload();

    await expect(requireDefaultSite(payload as any, createRequest())).resolves.toBeUndefined();
  });

  it("should allow when site is the default site", async () => {
    mockResolveSite.mockResolvedValue({ id: 1, isDefault: true });
    const payload = createMockPayload();

    await expect(requireDefaultSite(payload as any, createRequest())).resolves.toBeUndefined();
  });

  it("should throw ForbiddenError when site is not the default", async () => {
    mockResolveSite.mockResolvedValue({ id: 2, isDefault: false, domain: "events.city.gov" });
    const payload = createMockPayload();

    await expect(requireDefaultSite(payload as any, createRequest("events.city.gov"))).rejects.toThrow(
      "This feature is only available on the main site"
    );
  });

  it("should pass the host header to resolveSite", async () => {
    mockResolveSite.mockResolvedValue(null);
    const payload = createMockPayload();

    await requireDefaultSite(payload as any, createRequest("custom.example.com"));

    expect(mockResolveSite).toHaveBeenCalledWith(payload, "custom.example.com");
  });
});

describe.sequential("apiRoute with site: 'default'", () => {
  let mockPayload: ReturnType<typeof createMockPayload>;
  let testRoute: ReturnType<typeof apiRoute>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload = createMockPayload();
    mocks.mockGetPayload.mockResolvedValue(mockPayload);
    vi.mocked(getPayload).mockResolvedValue(mockPayload as any);
    mockResolveSite.mockResolvedValue(null);
    testRoute = apiRoute({ auth: "required", site: "default", handler: () => ({ message: "ok" }) });
  });

  it("should return 403 when request is from a non-default site", async () => {
    mockResolveSite.mockResolvedValue({ id: 2, isDefault: false });

    const response = await testRoute(createRequest("events.city.gov"), createParams());

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("This feature is only available on the main site");
  });

  it("should allow requests from the default site", async () => {
    mockResolveSite.mockResolvedValue({ id: 1, isDefault: true });

    const response = await testRoute(createRequest(), createParams());

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe("ok");
  });

  it("should allow requests when no sites are configured", async () => {
    mockResolveSite.mockResolvedValue(null);

    const response = await testRoute(createRequest(), createParams());

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe("ok");
  });

  it("should check site after auth (401 takes precedence)", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });
    mockResolveSite.mockResolvedValue({ id: 2, isDefault: false });

    const response = await testRoute(createRequest(), createParams());

    expect(response.status).toBe(401);
  });

  it("should not check site when site option is not set", async () => {
    const ungatedRoute = apiRoute({ auth: "required", handler: () => ({ message: "no gating" }) });
    mockResolveSite.mockResolvedValue({ id: 2, isDefault: false });

    const response = await ungatedRoute(createRequest("events.city.gov"), createParams());

    expect(response.status).toBe(200);
    expect(mockResolveSite).not.toHaveBeenCalled();
  });
});
