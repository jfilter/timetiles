/**
 * Unit tests for the events geo stats API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockGetAllAccessibleCatalogIds: vi.fn(),
  mockExtractClusterStatsParameters: vi.fn(),
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
  extractClusterStatsParameters: mocks.mockExtractClusterStatsParameters,
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

import { GET } from "@/app/api/v1/events/geo/stats/route";
import { DEFAULT_CLUSTER_STATS } from "@/lib/constants/map";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (queryString: string, user: unknown = null) =>
  ({
    user,
    nextUrl: new URL(`http://localhost:3000/api/v1/events/geo/stats${queryString}`),
  }) as unknown as AuthenticatedRequest;

describe.sequential("GET /api/v1/events/geo/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockGetPayload.mockResolvedValue({
      db: { drizzle: { execute: mocks.mockDrizzleExecute } },
    });
    mocks.mockGetAllAccessibleCatalogIds.mockResolvedValue([1, 2]);
    mocks.mockExtractClusterStatsParameters.mockReturnValue({
      catalog: null,
      datasets: [],
      startDate: null,
      endDate: null,
      fieldFilters: {},
    });
    mocks.mockDrizzleExecute.mockResolvedValue({
      rows: [{ p20: 2, p40: 5, p60: 10, p80: 20, p100: 50, total_clusters: 1 }],
    });
  });

  it("returns default stats when all dataset ids are invalid", async () => {
    mocks.mockExtractClusterStatsParameters.mockReturnValue({
      catalog: null,
      datasets: ["abc"],
      startDate: null,
      endDate: null,
      fieldFilters: {},
    });

    const response = await GET(createRequest("?datasets=abc"), undefined);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(DEFAULT_CLUSTER_STATS);
    expect(mocks.mockDrizzleExecute).not.toHaveBeenCalled();
  });
});
