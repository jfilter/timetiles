/**
 * Unit tests for the events cluster summary API route.
 *
 * Tests GET /api/v1/events/cluster-summary — validates access control,
 * empty-path handling, and the HTTP cache policy.
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
  mockPayloadFind: vi.fn(),
  mockToSqlWhereClause: vi.fn(),
  mockBuildH3CellSqlCondition: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({}));

vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));

vi.mock("@/lib/services/access-control", () => ({ canAccessCatalog: mocks.mockCanAccessCatalog }));

vi.mock("@/lib/filters/to-sql-conditions", () => ({
  toSqlWhereClause: mocks.mockToSqlWhereClause,
  buildH3CellSqlCondition: mocks.mockBuildH3CellSqlCondition,
}));

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

import { GET } from "@/app/api/v1/events/cluster-summary/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (queryString: string, user: unknown = null) => {
  const url = `http://localhost:3000/api/v1/events/cluster-summary${queryString}`;
  return { user, url, headers: new Headers(), nextUrl: new URL(url) } as unknown as AuthenticatedRequest;
};

const setupDefaults = () => {
  mocks.mockGetPayload.mockResolvedValue({
    auth: vi.fn().mockResolvedValue({ user: null }),
    db: { drizzle: { execute: mocks.mockDrizzleExecute } },
    find: mocks.mockPayloadFind,
  });

  mocks.mockCanAccessCatalog.mockResolvedValue(true);
  mocks.mockToSqlWhereClause.mockReturnValue({ type: "sql", strings: ["1=1"], values: [] });
  mocks.mockBuildH3CellSqlCondition.mockReturnValue({ type: "sql", strings: ["cell_condition"], values: [] });
  mocks.mockPayloadFind.mockResolvedValue({ docs: [] });

  // Four parallel queries: summary, datasets, catalogs, preview. Return empty rows for each.
  mocks.mockDrizzleExecute.mockResolvedValue({ rows: [] });
};

describe.sequential("GET /api/v1/events/cluster-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it("returns Cache-Control header for a successful request", async () => {
    const response = await GET(createRequest("?cells=abc&h3Resolution=8"), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);

    const cacheControl = response.headers.get("Cache-Control");
    expect(cacheControl).not.toBeNull();
    expect(cacheControl).toContain("private");
    expect(cacheControl).toContain("max-age=30");
    expect(cacheControl).toContain("stale-while-revalidate=60");
  });

  it("returns Cache-Control header when the requested catalog is inaccessible", async () => {
    mocks.mockCanAccessCatalog.mockResolvedValue(false);

    const response = await GET(createRequest("?cells=abc&h3Resolution=8&catalog=999"), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      totalCount: 0,
      locationCount: 0,
      temporalRange: null,
      datasets: [],
      catalogs: [],
      categories: [],
      preview: [],
    });

    const cacheControl = response.headers.get("Cache-Control");
    expect(cacheControl).toContain("private");
    expect(cacheControl).toContain("max-age=30");
    expect(cacheControl).toContain("stale-while-revalidate=60");
  });

  it("returns 422 when required cells parameter is missing", async () => {
    const response = await GET(createRequest("?h3Resolution=8"), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
  });

  it("returns 422 when h3Resolution is out of range", async () => {
    const response = await GET(createRequest("?cells=abc&h3Resolution=99"), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
  });
});
