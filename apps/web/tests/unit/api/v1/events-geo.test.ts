/**
 * Unit tests for the events geo API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockGetAllAccessibleCatalogIds: vi.fn(),
  mockExtractMapClusterParameters: vi.fn(),
  mockIsValidBounds: vi.fn(),
  mockDrizzleExecute: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({
  withOptionalAuth: vi.fn((handler: (...args: unknown[]) => unknown) => handler),
}));

vi.mock("payload", () => ({
  getPayload: mocks.mockGetPayload,
}));

vi.mock("@/lib/services/access-control", () => ({
  getAllAccessibleCatalogIds: mocks.mockGetAllAccessibleCatalogIds,
}));

vi.mock("@/lib/utils/event-params", () => ({
  extractMapClusterParameters: mocks.mockExtractMapClusterParameters,
}));

vi.mock("@/lib/geospatial", () => ({
  isValidBounds: mocks.mockIsValidBounds,
}));

vi.mock("@payloadcms/db-postgres", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: "sql",
      strings: Array.from(strings),
      values,
    }),
    {
      join: vi.fn((parts: unknown[], separator: unknown) => ({
        type: "join",
        parts,
        separator,
      })),
      raw: vi.fn((value: string) => ({ type: "raw", value })),
    }
  ),
}));

vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/events/geo/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (queryString: string, user: unknown = null) =>
  ({
    user,
    nextUrl: new URL(`http://localhost:3000/api/v1/events/geo${queryString}`),
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

describe.sequential("GET /api/v1/events/geo", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockGetPayload.mockResolvedValue({
      db: { drizzle: { execute: mocks.mockDrizzleExecute } },
    });
    mocks.mockGetAllAccessibleCatalogIds.mockResolvedValue([1, 2]);
    mocks.mockExtractMapClusterParameters.mockReturnValue({
      catalog: null,
      datasets: ["10", "20"],
      startDate: null,
      endDate: null,
      fieldFilters: {},
      boundsParam: JSON.stringify({
        north: 90,
        south: -90,
        east: 180,
        west: -180,
      }),
      zoom: 2,
    });
    mocks.mockIsValidBounds.mockReturnValue(true);
    mocks.mockDrizzleExecute.mockResolvedValue({ rows: [] });
  });

  it("passes multiple dataset filters through to cluster_events", async () => {
    const response = await GET(createRequest("?bounds=%7B%7D&zoom=2"), undefined);

    expect(response.status).toBe(200);
    expect(mocks.mockDrizzleExecute).toHaveBeenCalledOnce();

    const executedQuery = mocks.mockDrizzleExecute.mock.calls[0]?.[0];
    const jsonPayload = collectQueryScalars(executedQuery).find(
      (value): value is string => typeof value === "string" && value.startsWith("{") && value.includes("catalogIds")
    );

    expect(jsonPayload).toBeDefined();
    expect(JSON.parse(jsonPayload!)).toMatchObject({
      datasets: [10, 20],
    });
  });
});
