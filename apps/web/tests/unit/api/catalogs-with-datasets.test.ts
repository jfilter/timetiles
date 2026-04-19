/**
 * Unit tests for the catalogs-with-datasets API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => ({ mockGetPayload: vi.fn(), mockPayloadFind: vi.fn(), mockDrizzleSelect: vi.fn() }));

vi.mock("@/lib/middleware/auth", () => ({}));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/catalogs/with-datasets/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (user = { id: 7, role: "user" }) => {
  const url = "http://localhost:3000/api/catalogs/with-datasets";
  return { user, url, headers: new Headers(), nextUrl: new URL(url) } as unknown as AuthenticatedRequest;
};

const createSelectBuilder = (result: unknown) => {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    groupBy: vi.fn(() => Promise.resolve(result)),
  };

  return builder;
};

describe.sequential("GET /api/catalogs/with-datasets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetPayload.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ user: { id: 7, role: "user" } }),
      find: mocks.mockPayloadFind,
      db: { drizzle: { select: mocks.mockDrizzleSelect } },
    });
  });

  it("returns catalogs with grouped datasets and event counts", async () => {
    mocks.mockPayloadFind
      .mockResolvedValueOnce({
        docs: [
          { id: 1, name: "Catalog A" },
          { id: 2, name: "Catalog B" },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          { id: 10, name: "Dataset X", catalog: { id: 1 } },
          { id: 20, name: "Dataset Y", catalog: { id: 1 } },
          { id: 30, name: "Dataset Z", catalog: { id: 2 } },
        ],
      });
    mocks.mockDrizzleSelect.mockImplementation(() =>
      createSelectBuilder([
        { datasetId: 10, count: 4 },
        { datasetId: 30, count: 1 },
      ])
    );

    const response = await GET(createRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      catalogs: [
        {
          id: 1,
          name: "Catalog A",
          datasets: [
            { id: 10, name: "Dataset X", eventCount: 4 },
            { id: 20, name: "Dataset Y", eventCount: 0 },
          ],
        },
        { id: 2, name: "Catalog B", datasets: [{ id: 30, name: "Dataset Z", eventCount: 1 }] },
      ],
    });
  });

  it("skips the event count query when there are no datasets", async () => {
    mocks.mockPayloadFind
      .mockResolvedValueOnce({ docs: [{ id: 1, name: "Catalog A" }] })
      .mockResolvedValueOnce({ docs: [] });

    const response = await GET(createRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ catalogs: [{ id: 1, name: "Catalog A", datasets: [] }] });
    expect(mocks.mockDrizzleSelect).not.toHaveBeenCalled();
  });
});
