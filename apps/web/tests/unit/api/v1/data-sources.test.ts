/**
 * Unit tests for the data-sources API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => ({ mockGetPayload: vi.fn(), mockPayloadFind: vi.fn() }));

vi.mock("@/lib/middleware/auth", () => ({}));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/data-sources/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (queryString = "") => {
  const url = `http://localhost:3000/api/v1/data-sources${queryString}`;
  return { user: null, url, headers: new Headers(), nextUrl: new URL(url) } as unknown as AuthenticatedRequest;
};

describe.sequential("GET /api/v1/data-sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetPayload.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ user: null }),
      find: mocks.mockPayloadFind,
    });
  });

  it("paginates datasets while returning all accessible catalogs", async () => {
    mocks.mockPayloadFind
      .mockResolvedValueOnce({ docs: [{ id: 1, name: "Catalog", description: null, createdBy: 99 }] })
      .mockResolvedValueOnce({
        docs: [{ id: 10, name: "Dataset A", description: null, language: "eng", catalog: 1, hasTemporalData: true }],
        page: 2,
        limit: 50,
        totalDocs: 120,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
        nextPage: 3,
        prevPage: 1,
      });

    const response = await GET(createRequest("?page=2&limit=50"), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.mockPayloadFind).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ collection: "datasets", page: 2, limit: 50, depth: 0 })
    );

    const data = await response.json();
    expect(data).toEqual({
      catalogs: [{ id: 1, name: "Catalog", isOwned: false, description: undefined }],
      datasets: [
        { id: 10, name: "Dataset A", catalogId: 1, hasTemporalData: true, description: undefined, language: "eng" },
      ],
      pagination: {
        page: 2,
        limit: 50,
        totalDocs: 120,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
        nextPage: 3,
        prevPage: 1,
      },
    });
  });

  it("validates the dataset page size", async () => {
    const response = await GET(createRequest("?limit=501"), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: "Validation failed" }));
  });
});
