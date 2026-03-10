/**
 * Unit tests for the events bounds API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockGetAllAccessibleCatalogIds: vi.fn(),
  mockExtractBaseEventParameters: vi.fn(),
  mockDrizzleExecute: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({
  withOptionalAuth: vi.fn((handler: (...args: unknown[]) => unknown) => handler),
}));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));

vi.mock("@/lib/services/access-control", () => ({ getAllAccessibleCatalogIds: mocks.mockGetAllAccessibleCatalogIds }));

vi.mock("@/lib/utils/event-params", () => ({
  extractBaseEventParameters: mocks.mockExtractBaseEventParameters,
  parseStrictInteger: (value: string | number | null | undefined) => {
    if (typeof value === "number") return Number.isInteger(value) ? value : null;
    if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) return null;
    return parseInt(value.trim(), 10);
  },
  normalizeStrictIntegerList: (values: Array<string | number>) =>
    values
      .map((value) => {
        if (typeof value === "number") return Number.isInteger(value) ? value : null;
        if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) return null;
        return parseInt(value.trim(), 10);
      })
      .filter((value): value is number => value != null),
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

vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/events/bounds/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (queryString: string, user: unknown = null) =>
  ({
    user,
    nextUrl: new URL(`http://localhost:3000/api/v1/events/bounds${queryString}`),
  }) as unknown as AuthenticatedRequest;

const collectQueryScalars = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectQueryScalars(item));
  }

  if (value != null && typeof value === "object") {
    return Object.values(value).flatMap((item) => collectQueryScalars(item));
  }

  return value == null ? [] : [value];
};

describe.sequential("GET /api/v1/events/bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockGetPayload.mockResolvedValue({ db: { drizzle: { execute: mocks.mockDrizzleExecute } } });
    mocks.mockGetAllAccessibleCatalogIds.mockResolvedValue([]);
    mocks.mockExtractBaseEventParameters.mockReturnValue({
      catalog: "",
      datasets: [],
      startDate: null,
      endDate: null,
      fieldFilters: {},
    });
  });

  it("returns an empty result when catalog is blank and no catalogs are accessible", async () => {
    const response = await GET(createRequest("?catalog="), undefined);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bounds: null, count: 0 });
    expect(mocks.mockDrizzleExecute).not.toHaveBeenCalled();
  });

  it("returns an empty result when the catalog id is only partially numeric", async () => {
    mocks.mockGetAllAccessibleCatalogIds.mockResolvedValue([1]);
    mocks.mockExtractBaseEventParameters.mockReturnValue({
      catalog: "1abc",
      datasets: [],
      startDate: null,
      endDate: null,
      fieldFilters: {},
    });

    const response = await GET(createRequest("?catalog=1abc"), undefined);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bounds: null, count: 0 });
    expect(mocks.mockDrizzleExecute).not.toHaveBeenCalled();
  });

  it("applies field filters to the bounds query", async () => {
    mocks.mockGetAllAccessibleCatalogIds.mockResolvedValue([42]);
    mocks.mockExtractBaseEventParameters.mockReturnValue({
      catalog: null,
      datasets: [],
      startDate: null,
      endDate: null,
      fieldFilters: { "venue.address.city": ["Berlin"] },
    });
    mocks.mockDrizzleExecute.mockResolvedValue({
      rows: [{ west: "13.1", south: "52.4", east: "13.6", north: "52.7", count: 3 }],
    });

    const response = await GET(createRequest(""), undefined);

    expect(response.status).toBe(200);
    expect(mocks.mockDrizzleExecute).toHaveBeenCalledOnce();

    const executedQuery = mocks.mockDrizzleExecute.mock.calls[0]?.[0];
    const queryScalars = collectQueryScalars(executedQuery);

    expect(queryScalars).toContain("venue.address.city");
    expect(queryScalars).toContain("Berlin");
  });

  it("normalizes a plain end date to the end of the day", async () => {
    mocks.mockGetAllAccessibleCatalogIds.mockResolvedValue([42]);
    mocks.mockExtractBaseEventParameters.mockReturnValue({
      catalog: null,
      datasets: [],
      startDate: null,
      endDate: "2024-03-31",
      fieldFilters: {},
    });
    mocks.mockDrizzleExecute.mockResolvedValue({
      rows: [{ west: "13.1", south: "52.4", east: "13.6", north: "52.7", count: 3 }],
    });

    const response = await GET(createRequest(""), undefined);

    expect(response.status).toBe(200);
    expect(mocks.mockDrizzleExecute).toHaveBeenCalledOnce();

    const executedQuery = mocks.mockDrizzleExecute.mock.calls[0]?.[0];
    const queryScalars = collectQueryScalars(executedQuery);

    expect(queryScalars).toContain("2024-03-31T23:59:59.999Z");
  });
});
