/**
 * Unit tests for the sources stats API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => ({ mockGetPayload: vi.fn(), mockDrizzleSelect: vi.fn() }));

vi.mock("@/lib/middleware/auth", () => ({}));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/sources/stats/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (user: unknown = null) => {
  const url = "http://localhost:3000/api/v1/sources/stats";
  return { user, url, headers: new Headers(), nextUrl: new URL(url) } as unknown as AuthenticatedRequest;
};

const createSelectBuilder = (result: unknown) => {
  const builder = {
    from: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    groupBy: vi.fn(() => Promise.resolve(result)),
  };

  return builder;
};

describe.sequential("GET /api/v1/sources/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetPayload.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ user: null }),
      db: { drizzle: { select: mocks.mockDrizzleSelect } },
    });
  });

  it("returns aggregated catalog and dataset counts", async () => {
    mocks.mockDrizzleSelect
      .mockImplementationOnce(() =>
        createSelectBuilder([
          { id: 1, count: 8 },
          { id: 2, count: 3 },
        ])
      )
      .mockImplementationOnce(() =>
        createSelectBuilder([
          { id: 10, count: 5 },
          { id: 20, count: 6 },
        ])
      );

    const response = await GET(createRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      catalogCounts: { "1": 8, "2": 3 },
      datasetCounts: { "10": 5, "20": 6 },
      totalEvents: 11,
    });
    expect(mocks.mockDrizzleSelect).toHaveBeenCalledTimes(2);
  });

  it("returns empty counts when no rows match", async () => {
    mocks.mockDrizzleSelect.mockImplementation(() => createSelectBuilder([]));

    const response = await GET(createRequest({ id: 42 }), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ catalogCounts: {}, datasetCounts: {}, totalEvents: 0 });
  });
});
