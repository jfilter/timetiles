/**
 * Unit tests for the events bounds API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockCanAccessCatalog: vi.fn(),
  mockDrizzleSelect: vi.fn(),
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

import { GET } from "@/app/api/v1/events/bounds/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createSelectBuilder = (result: unknown) => {
  const builder = {
    from: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(result)),
  };

  return builder;
};

const queueSelectResults = (...results: unknown[]) => {
  const builders: ReturnType<typeof createSelectBuilder>[] = [];

  mocks.mockDrizzleSelect.mockImplementation(() => {
    const builder = createSelectBuilder(results.shift() ?? []);
    builders.push(builder);
    return builder;
  });

  return builders;
};

const createRequest = (queryString: string, user: unknown = null) => {
  const url = `http://localhost:3000/api/v1/events/bounds${queryString}`;
  return { user, url, headers: new Headers(), nextUrl: new URL(url) } as unknown as AuthenticatedRequest;
};

describe.sequential("GET /api/v1/events/bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockGetPayload.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ user: null }),
      db: { drizzle: { select: mocks.mockDrizzleSelect } },
    });
    mocks.mockCanAccessCatalog.mockResolvedValue(true);
    queueSelectResults([]);
  });

  it("returns an empty result when the requested catalog is inaccessible", async () => {
    mocks.mockCanAccessCatalog.mockResolvedValue(false);

    const response = await GET(createRequest("?catalog=99"), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bounds: null, count: 0 });
    expect(mocks.mockDrizzleSelect).not.toHaveBeenCalled();
  });

  it("returns a validation error when the catalog id is non-numeric", async () => {
    // "1abc" cannot be coerced to an integer by Zod
    const response = await GET(createRequest("?catalog=1abc"), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toBe("Validation failed");
  });

  it("returns bounds for field-filter requests", async () => {
    const ff = encodeURIComponent(JSON.stringify({ "venue.address.city": ["Berlin"] }));
    queueSelectResults([{ west: "13.1", south: "52.4", east: "13.6", north: "52.7", count: 3 }]);

    const response = await GET(createRequest(`?ff=${ff}`), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.mockDrizzleSelect).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({
      bounds: { west: 13.1, south: 52.4, east: 13.6, north: 52.7 },
      count: 3,
    });
  });

  it("returns bounds when a plain end date is provided", async () => {
    queueSelectResults([{ west: "13.1", south: "52.4", east: "13.6", north: "52.7", count: 3 }]);

    const response = await GET(createRequest("?endDate=2024-03-31"), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.mockDrizzleSelect).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({
      bounds: { west: 13.1, south: 52.4, east: 13.6, north: 52.7 },
      count: 3,
    });
  });
});
