/**
 * Unit tests for miscellaneous API routes: health, quotas.
 *
 * Tests route handler logic with mocked dependencies.
 *
 * @module
 * @category Tests
 */

// 1. Centralized mocks FIRST
import "@/tests/mocks/services/logger";

// 2. vi.hoisted for values needed in vi.mock factories
const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockRunHealthChecks: vi.fn(),
  mockCheckQuota: vi.fn(),
  mockGetEffectiveQuotas: vi.fn(),
  mockGetQuotaHeaders: vi.fn(),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));

// 3. vi.mock calls
vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

vi.mock("@/lib/health", () => ({ runHealthChecks: mocks.mockRunHealthChecks }));

vi.mock("@/lib/services/quota-service", () => ({
  getQuotaService: vi
    .fn()
    .mockReturnValue({
      checkQuota: mocks.mockCheckQuota,
      getEffectiveQuotas: mocks.mockGetEffectiveQuotas,
      getQuotaHeaders: mocks.mockGetQuotaHeaders,
    }),
}));

vi.mock("@/lib/constants/quota-constants", () => ({
  QUOTA_TYPES: {
    FILE_UPLOADS_PER_DAY: "file_uploads_per_day",
    URL_FETCHES_PER_DAY: "url_fetches_per_day",
    IMPORT_JOBS_PER_DAY: "import_jobs_per_day",
    ACTIVE_SCHEDULES: "active_schedules",
    TOTAL_EVENTS: "total_events",
    EVENTS_PER_IMPORT: "events_per_import",
  },
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: any) => handler,
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: (handler: any) => async (req: any, ctx: any) => {
    const payload = await mocks.mockGetPayload();
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      const { NextResponse } = await import("next/server");
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    Object.assign(req, { user });
    return handler(req, ctx);
  },
}));

vi.mock("@/lib/services/rate-limit-service", () => ({
  getClientIdentifier: vi.fn().mockReturnValue("test-client"),
  getRateLimitService: vi.fn().mockReturnValue({ checkConfiguredRateLimit: mocks.mockCheckRateLimit }),
  RATE_LIMITS: {},
}));

// 4. Vitest imports and source code AFTER mocks
import { NextRequest } from "next/server";
import { getPayload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as healthGET } from "@/app/api/health/route";
import { GET as quotasGET } from "@/app/api/quotas/route";
import { getQuotaService } from "@/lib/services/quota-service";

const mockUser = { id: 1, email: "test@test.com", role: "user" };

const createRequest = (url: string, method = "GET") =>
  new NextRequest(url, { method, headers: new Headers({ Authorization: "Bearer test" }) });

let mockPayload: any;

beforeEach(() => {
  vi.clearAllMocks();
  // Reset implementations that vi.clearAllMocks does not clear
  mocks.mockRunHealthChecks.mockReset();

  mockPayload = { auth: vi.fn().mockResolvedValue({ user: mockUser }), find: vi.fn().mockResolvedValue({ docs: [] }) };
  mocks.mockGetPayload.mockResolvedValue(mockPayload);
  // With isolate: false, another file's vi.mock("payload") may have replaced the
  // module-level getPayload binding. Configure whichever fn is currently bound.
  vi.mocked(getPayload).mockReset();
  vi.mocked(getPayload).mockResolvedValue(mockPayload);

  // Re-apply mocks that clearAllMocks wiped
  vi.mocked(getQuotaService).mockReturnValue({
    checkQuota: mocks.mockCheckQuota,
    getEffectiveQuotas: mocks.mockGetEffectiveQuotas,
    getQuotaHeaders: mocks.mockGetQuotaHeaders,
  } as any);
});

describe.sequential("Health Route", () => {
  it("returns 200 with healthy results", async () => {
    const healthyResults = {
      env: { status: "healthy", message: "All good" },
      cms: { status: "healthy", message: "CMS running" },
      postgis: { status: "healthy", message: "PostGIS available" },
    };
    mocks.mockRunHealthChecks.mockResolvedValue(healthyResults);

    const response = await healthGET(new NextRequest("http://localhost/api/health"), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.env.status).toBe("healthy");
    expect(body.cms.status).toBe("healthy");
  });

  it("returns 503 when any check has error status", async () => {
    const errorResults = {
      env: { status: "healthy", message: "OK" },
      cms: { status: "error", message: "DB unavailable" },
      postgis: { status: "healthy", message: "PostGIS available" },
    };
    mocks.mockRunHealthChecks.mockResolvedValue(errorResults);

    const response = await healthGET(new NextRequest("http://localhost/api/health"), { params: Promise.resolve({}) });

    expect(response.status).toBe(503);
  });

  it("returns 200 with warnings (degraded/pending)", async () => {
    const degradedResults = {
      env: { status: "healthy", message: "OK" },
      cms: { status: "warning", message: "Slow" },
      migrations: { status: "pending", message: "Pending migrations" },
      postgis: { status: "healthy", message: "PostGIS available" },
    };
    mocks.mockRunHealthChecks.mockResolvedValue(degradedResults);

    const response = await healthGET(new NextRequest("http://localhost/api/health"), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
  });

  it("returns 500 when health checks throw", async () => {
    mocks.mockRunHealthChecks.mockRejectedValue(new Error("Unexpected failure"));

    const response = await healthGET(new NextRequest("http://localhost/api/health"), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Health check failed");
  });
});

describe.sequential("Quotas Route", () => {
  it("returns 401 when not authenticated", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });

    const request = createRequest("http://localhost/api/quotas");
    const response = await (quotasGET as any)(request, { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authentication required");
  });

  it("returns quota status for all quota types", async () => {
    const quotaResult = { current: 2, limit: 10, remaining: 8, allowed: true };
    mocks.mockCheckQuota.mockResolvedValue(quotaResult);
    mocks.mockGetEffectiveQuotas.mockReturnValue({ maxFileSizeMB: 50 });
    mocks.mockGetQuotaHeaders.mockResolvedValue(new Headers());

    const request = createRequest("http://localhost/api/quotas");
    const response = await (quotasGET as any)(request, { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quotas).toBeDefined();
    expect(body.quotas.fileUploadsPerDay).toEqual({ used: 2, limit: 10, remaining: 8 });
    expect(body.quotas.urlFetchesPerDay).toEqual({ used: 2, limit: 10, remaining: 8 });
    expect(body.quotas.importJobsPerDay).toEqual({ used: 2, limit: 10, remaining: 8 });
    expect(body.quotas.activeSchedules).toEqual({ used: 2, limit: 10, remaining: 8 });
    expect(body.quotas.totalEvents).toEqual({ used: 2, limit: 10, remaining: 8 });
    expect(body.quotas.eventsPerImport).toEqual({ used: 2, limit: 10, remaining: 8 });
    expect(body.quotas.maxFileSizeMB).toEqual({ limit: 50 });
    expect(mocks.mockCheckQuota).toHaveBeenCalledTimes(6);
  });

  it("caps high limits to MAX_DISPLAYED_LIMIT (10000)", async () => {
    const highLimitQuota = { current: 5, limit: 999999, remaining: 999994, allowed: true };
    mocks.mockCheckQuota.mockResolvedValue(highLimitQuota);
    mocks.mockGetEffectiveQuotas.mockReturnValue({ maxFileSizeMB: 500 });
    mocks.mockGetQuotaHeaders.mockResolvedValue(new Headers());

    const request = createRequest("http://localhost/api/quotas");
    const response = await (quotasGET as any)(request, { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quotas.fileUploadsPerDay.limit).toBe(10000);
    expect(body.quotas.totalEvents.limit).toBe(10000);
    expect(body.quotas.maxFileSizeMB.limit).toBe(100);
  });
});
