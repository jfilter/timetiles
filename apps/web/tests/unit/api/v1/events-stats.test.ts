/**
 * Unit tests for the events stats aggregation API route.
 *
 * Tests GET /api/v1/events/stats with groupBy, filtering, and access control.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockCanAccessCatalog: vi.fn(),
  mockBuildAggregationWhereClause: vi.fn(),
  mockDrizzleSelect: vi.fn(),
  mockPayloadFind: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({}));

vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));

vi.mock("@/lib/services/access-control", () => ({ canAccessCatalog: mocks.mockCanAccessCatalog }));

vi.mock("@/lib/filters/to-sql-conditions", () => ({ toSqlWhereClause: mocks.mockBuildAggregationWhereClause }));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/events/stats/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

/**
 * Helper to create a mock request with the given query string.
 */
const createRequest = (queryString: string, user: unknown = null) => {
  const url = `http://localhost:3000/api/v1/events/stats${queryString}`;
  return { user, url, headers: new Headers(), nextUrl: new URL(url) } as unknown as AuthenticatedRequest;
};

const createSelectBuilder = (result: unknown) => {
  const builder = {
    from: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    groupBy: vi.fn(() => builder),
    orderBy: vi.fn(() => Promise.resolve(result)),
  };

  return builder;
};

/**
 * Sets up default mock implementations for a standard successful request.
 */
const setupDefaults = () => {
  mocks.mockGetPayload.mockResolvedValue({
    auth: vi.fn().mockResolvedValue({ user: null }),
    db: { drizzle: { select: mocks.mockDrizzleSelect } },
    find: mocks.mockPayloadFind,
  });

  mocks.mockCanAccessCatalog.mockResolvedValue(true);
  mocks.mockBuildAggregationWhereClause.mockReturnValue("1=1");
  mocks.mockDrizzleSelect.mockImplementation(() => createSelectBuilder([]));
  mocks.mockPayloadFind.mockResolvedValue({ docs: [] });
};

describe.sequential("GET /api/v1/events/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  describe.sequential("Parameter Validation", () => {
    it("should return 422 when groupBy parameter is missing", async () => {
      const req = createRequest("");

      const response = await GET(req, { params: Promise.resolve({}) });

      // Zod validation returns 422 for missing required fields
      expect(response.status).toBe(422);
      const data = await response.json();
      expect(data.error).toBe("Validation failed");
    });

    it("should return 422 when groupBy value is invalid", async () => {
      const req = createRequest("?groupBy=invalid");

      const response = await GET(req, { params: Promise.resolve({}) });

      // Zod validation returns 422 for invalid enum values
      expect(response.status).toBe(422);
      const data = await response.json();
      expect(data.error).toBe("Validation failed");
    });

    it("should silently ignore invalid bounds parameter", async () => {
      const req = createRequest("?groupBy=catalog&bounds=invalid");

      const response = await GET(req, { params: Promise.resolve({}) });

      // Invalid bounds are ignored by the schema, so the route still succeeds.
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ items: [], total: 0, groupedBy: "catalog" });
    });
  });

  describe.sequential("Access Control", () => {
    it("should return empty result when the requested catalog is inaccessible", async () => {
      mocks.mockCanAccessCatalog.mockResolvedValue(false);

      const req = createRequest("?groupBy=catalog&catalog=999");

      const response = await GET(req, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ items: [], total: 0, groupedBy: "catalog" });
      // Should not execute any SQL query
      expect(mocks.mockDrizzleSelect).not.toHaveBeenCalled();
    });
  });

  describe.sequential("Catalog Aggregation", () => {
    it("should return aggregated items grouped by catalog", async () => {
      mocks.mockDrizzleSelect.mockImplementation(() =>
        createSelectBuilder([
          { id: 1, name: "Catalog A", count: 15 },
          { id: 2, name: "Catalog B", count: 5 },
        ])
      );

      const req = createRequest("?groupBy=catalog");

      const response = await GET(req, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.groupedBy).toBe("catalog");
      expect(data.total).toBe(20);
      expect(data.items).toHaveLength(2);
      expect(data.items[0]).toEqual({ id: 1, name: "Catalog A", count: 15 });
      expect(data.items[1]).toEqual({ id: 2, name: "Catalog B", count: 5 });
    });
  });

  describe.sequential("Dataset Aggregation", () => {
    it("should return aggregated items grouped by dataset", async () => {
      mocks.mockDrizzleSelect.mockImplementation(() =>
        createSelectBuilder([
          { id: 10, name: "Dataset X", count: 30 },
          { id: 20, name: "Dataset Y", count: 12 },
        ])
      );

      const req = createRequest("?groupBy=dataset");

      const response = await GET(req, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.groupedBy).toBe("dataset");
      expect(data.total).toBe(42);
      expect(data.items).toHaveLength(2);
      expect(data.items[0]).toEqual({ id: 10, name: "Dataset X", count: 30 });
      expect(data.items[1]).toEqual({ id: 20, name: "Dataset Y", count: 12 });
    });

    it("should add 0-count entries for filtered datasets not in results", async () => {
      mocks.mockDrizzleSelect.mockImplementationOnce(() =>
        createSelectBuilder([{ id: 10, name: "Dataset X", count: 5 }])
      );
      mocks.mockPayloadFind.mockResolvedValueOnce({
        docs: [
          { id: 20, name: "Dataset Y" },
          { id: 30, name: "Dataset Z" },
        ],
      });

      const req = createRequest("?groupBy=dataset&datasets=10,20,30");

      const response = await GET(req, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.groupedBy).toBe("dataset");
      expect(data.total).toBe(5);
      expect(data.items).toHaveLength(3);
      // Sorted by count descending: dataset 10 first, then 0-count ones
      expect(data.items[0]).toEqual({ id: 10, name: "Dataset X", count: 5 });
      expect(data.items[1]).toEqual(expect.objectContaining({ count: 0 }));
      expect(data.items[2]).toEqual(expect.objectContaining({ count: 0 }));

      expect(mocks.mockDrizzleSelect).toHaveBeenCalledTimes(1);
      expect(mocks.mockPayloadFind).toHaveBeenCalledOnce();
    });
  });

  describe.sequential("Error Handling", () => {
    it("should return 500 when an unexpected error occurs", async () => {
      mocks.mockGetPayload.mockRejectedValue(new Error("Database connection failed"));

      const req = createRequest("?groupBy=catalog");

      const response = await GET(req, { params: Promise.resolve({}) });

      expect(response.status).toBe(500);
      const data = await response.json();
      // Error is caught by the apiRoute framework's outer handler
      expect(data.error).toBe("Internal server error");
    });
  });
});
