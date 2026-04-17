/**
 * Unit tests for the events list API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => ({
  mockCanAccessCatalog: vi.fn(),
  mockDrizzleExecute: vi.fn(),
  mockGetPayload: vi.fn(),
  mockPayloadFind: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({}));

vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));

vi.mock("@/lib/services/access-control", () => ({ canAccessCatalog: mocks.mockCanAccessCatalog }));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/events/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (queryString: string, user: unknown = null) => {
  const url = `http://localhost:3000/api/v1/events${queryString}`;
  return { user, url, headers: new Headers(), nextUrl: new URL(url) } as unknown as AuthenticatedRequest;
};

describe.sequential("GET /api/v1/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockGetPayload.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ user: null }),
      db: { drizzle: { execute: mocks.mockDrizzleExecute } },
      find: mocks.mockPayloadFind,
    });
    mocks.mockCanAccessCatalog.mockResolvedValue(true);
    mocks.mockDrizzleExecute.mockResolvedValue({ rows: [] });
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
    const response = await GET(createRequest("?endDate=2024-03-31"), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.mockPayloadFind).toHaveBeenCalledOnce();
    expect(mocks.mockPayloadFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([{ eventTimestamp: { less_than_equal: "2024-03-31T23:59:59.999Z" } }]),
        }),
      })
    );
  });

  it("uses an OR longitude filter for antimeridian-crossing bounds", async () => {
    const bounds = JSON.stringify({ west: 170, east: -170, south: -10, north: 10 });
    const response = await GET(createRequest(`?bounds=${encodeURIComponent(bounds)}`), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.mockPayloadFind).toHaveBeenCalledOnce();
    expect(mocks.mockPayloadFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([
            {
              or: [
                { "location.longitude": { greater_than_equal: 170 } },
                { "location.longitude": { less_than_equal: -170 } },
              ],
            },
          ]),
        }),
      })
    );
  });

  it("returns a validation error when the catalog filter is non-numeric", async () => {
    // With Zod validation, "abc" cannot be coerced to a number so it's a validation error
    const response = await GET(createRequest("?catalog=abc"), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toBe("Validation failed");
  });

  it("returns a validation error when dataset ids are non-numeric", async () => {
    // With Zod validation, "10oops" cannot be coerced to an integer
    const response = await GET(createRequest("?datasets=10oops"), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toBe("Validation failed");
  });

  it("paginates SQL-only field filters via page-sized hydration", async () => {
    mocks.mockDrizzleExecute
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 202 }] });
    mocks.mockPayloadFind.mockResolvedValue({
      docs: [
        {
          id: 202,
          dataset: { id: 10, name: "Dataset A", catalog: "Catalog A", fieldMappingOverrides: null },
          transformedData: { title: "Filtered Event", category: "Music" },
          location: { latitude: 52.52, longitude: 13.405 },
          locationName: "Berlin",
          geocodingInfo: { normalizedAddress: "Berlin, Germany" },
          eventTimestamp: "2024-01-02T00:00:00.000Z",
          eventEndTimestamp: null,
          validationStatus: "valid",
        },
      ],
      page: 1,
      limit: 1,
      totalDocs: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
      nextPage: null,
      prevPage: null,
    });

    const fieldFilters = encodeURIComponent(JSON.stringify({ category: ["Music"] }));
    const response = await GET(createRequest(`?ff=${fieldFilters}&limit=1&page=2`), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.mockDrizzleExecute).toHaveBeenCalledTimes(2);
    expect(mocks.mockPayloadFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [202] } }, limit: 1 })
    );

    const data = await response.json();
    expect(data.events).toHaveLength(1);
    expect(data.pagination).toMatchObject({
      page: 2,
      limit: 1,
      totalDocs: 2,
      totalPages: 2,
      hasNextPage: false,
      hasPrevPage: true,
      nextPage: null,
      prevPage: 1,
    });
  });
});
