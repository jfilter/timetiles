/**
 * Unit tests for the events geo API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockCanAccessCatalog: vi.fn(),
  mockDrizzleExecute: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({}));

vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));

vi.mock("@/lib/services/access-control", () => ({ canAccessCatalog: mocks.mockCanAccessCatalog }));

vi.mock("@payloadcms/db-postgres", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: "sql", strings: Array.from(strings), values }),
    {
      join: vi.fn((parts: unknown[], separator: unknown) => ({ type: "join", parts, separator })),
      raw: vi.fn((value: string) => ({ type: "raw", value })),
    }
  ),
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/events/geo/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (queryString: string, user: unknown = null) => {
  const url = `http://localhost:3000/api/v1/events/geo${queryString}`;
  return { user, url, headers: new Headers(), nextUrl: new URL(url) } as unknown as AuthenticatedRequest;
};

const collectQueryScalars = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectQueryScalars(item));
  }

  if (value != null && typeof value === "object") {
    return Object.values(value).flatMap((item) => collectQueryScalars(item));
  }

  return value == null ? [] : [value];
};

describe.sequential("GET /api/v1/events/geo", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockGetPayload.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ user: null }),
      db: { drizzle: { execute: mocks.mockDrizzleExecute } },
    });
    mocks.mockCanAccessCatalog.mockResolvedValue(true);
    mocks.mockDrizzleExecute.mockResolvedValue({ rows: [] });
  });

  it("passes multiple dataset filters through to cluster_events", async () => {
    const bounds = JSON.stringify({ north: 90, south: -90, east: 180, west: -180 });
    const response = await GET(createRequest(`?bounds=${encodeURIComponent(bounds)}&zoom=2&datasets=10,20`), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    expect(mocks.mockDrizzleExecute).toHaveBeenCalledOnce();

    const executedQuery = mocks.mockDrizzleExecute.mock.calls[0]?.[0];
    const jsonPayload = collectQueryScalars(executedQuery).find(
      (value): value is string => typeof value === "string" && value.startsWith("{") && value.includes("datasets")
    );

    expect(jsonPayload).toBeDefined();
    expect(JSON.parse(jsonPayload!)).toMatchObject({ datasets: [10, 20], includePublic: true });
  });
});
