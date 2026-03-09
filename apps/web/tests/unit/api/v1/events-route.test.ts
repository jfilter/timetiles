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

vi.mock("payload", () => ({
  getPayload: mocks.mockGetPayload,
}));

vi.mock("@/lib/geospatial", () => ({
  parseBoundsParameter: mocks.mockParseBoundsParameter,
}));

vi.mock("@/lib/utils/event-params", () => ({
  extractListParameters: mocks.mockExtractListParameters,
}));

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

    const response = await GET(createRequest(""), undefined);

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
});
