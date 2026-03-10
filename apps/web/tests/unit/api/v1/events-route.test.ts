/**
 * Unit tests for the events list API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockParseBoundsParameter: vi.fn(),
  mockExtractListParameters: vi.fn(),
  mockPayloadFind: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({
  withOptionalAuth: vi.fn((handler: (...args: unknown[]) => unknown) => handler),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: any) => handler,
}));

vi.mock("payload", () => ({
  getPayload: mocks.mockGetPayload,
}));

vi.mock("@/lib/geospatial", () => ({
  parseBoundsParameter: mocks.mockParseBoundsParameter,
}));

vi.mock("@/lib/utils/event-params", () => ({
  extractListParameters: mocks.mockExtractListParameters,
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

vi.mock("@/lib/services/aggregation-filters", () => ({
  normalizeEndDate: (endDate: string | null): string | null => {
    if (!endDate) return null;
    if (endDate.includes("T")) return endDate;
    return `${endDate}T23:59:59.999Z`;
  },
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/events/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (queryString: string, user: unknown = null) =>
  ({
    user,
    nextUrl: new URL(`http://localhost:3000/api/v1/events${queryString}`),
  }) as unknown as AuthenticatedRequest;

describe.sequential("GET /api/v1/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockGetPayload.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ user: null }),
      find: mocks.mockPayloadFind,
    });
    mocks.mockParseBoundsParameter.mockReturnValue({ bounds: null });
    mocks.mockExtractListParameters.mockReturnValue({
      catalog: null,
      datasets: [],
      startDate: null,
      endDate: null,
      fieldFilters: {},
      boundsParam: null,
      page: 1,
      limit: 100,
      sort: "-eventTimestamp",
    });
    mocks.mockPayloadFind.mockResolvedValue({
      docs: [],
      page: 1,
      limit: 100,
      totalDocs: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
      nextPage: null,
      prevPage: null,
    });
  });

  it("normalizes a plain end date to the end of the day", async () => {
    mocks.mockExtractListParameters.mockReturnValue({
      catalog: null,
      datasets: [],
      startDate: null,
      endDate: "2024-03-31",
      fieldFilters: {},
      boundsParam: null,
      page: 1,
      limit: 100,
      sort: "-eventTimestamp",
    });

    const response = await GET(createRequest(""), { params: Promise.resolve({}) });

    if (response.status !== 200) {
      const body = await response.clone().json();
      console.error("DEBUG events-route 500 body:", JSON.stringify(body));
    }
    expect(response.status).toBe(200);
    expect(mocks.mockPayloadFind).toHaveBeenCalledOnce();
    expect(mocks.mockPayloadFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([
            {
              eventTimestamp: {
                less_than_equal: "2024-03-31T23:59:59.999Z",
              },
            },
          ]),
        }),
      })
    );
  });

  it("uses an OR longitude filter for antimeridian-crossing bounds", async () => {
    mocks.mockExtractListParameters.mockReturnValue({
      catalog: null,
      datasets: [],
      startDate: null,
      endDate: null,
      fieldFilters: {},
      boundsParam: '{"west":170,"east":-170,"south":-10,"north":10}',
      page: 1,
      limit: 100,
      sort: "-eventTimestamp",
    });
    mocks.mockParseBoundsParameter.mockReturnValue({
      bounds: {
        west: 170,
        east: -170,
        south: -10,
        north: 10,
      },
    });

    const response = await GET(createRequest(""), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.mockPayloadFind).toHaveBeenCalledOnce();
    expect(mocks.mockPayloadFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([
            {
              or: [
                {
                  "location.longitude": {
                    greater_than_equal: 170,
                  },
                },
                {
                  "location.longitude": {
                    less_than_equal: -170,
                  },
                },
              ],
            },
          ]),
        }),
      })
    );
  });

  it("returns no results when the catalog filter is invalid", async () => {
    mocks.mockExtractListParameters.mockReturnValue({
      catalog: "abc",
      datasets: [],
      startDate: null,
      endDate: null,
      fieldFilters: {},
      boundsParam: null,
      page: 1,
      limit: 100,
      sort: "-eventTimestamp",
    });

    const response = await GET(createRequest("?catalog=abc"), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.mockPayloadFind).toHaveBeenCalledOnce();
    expect(mocks.mockPayloadFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([
            {
              id: {
                equals: -1,
              },
            },
          ]),
        }),
      })
    );
  });

  it("returns no results when dataset ids are only partially numeric", async () => {
    mocks.mockExtractListParameters.mockReturnValue({
      catalog: null,
      datasets: ["10oops"],
      startDate: null,
      endDate: null,
      fieldFilters: {},
      boundsParam: null,
      page: 1,
      limit: 100,
      sort: "-eventTimestamp",
    });

    const response = await GET(createRequest("?datasets=10oops"), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.mockPayloadFind).toHaveBeenCalledOnce();
    expect(mocks.mockPayloadFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([
            {
              id: {
                equals: -1,
              },
            },
          ]),
        }),
      })
    );
  });
});
