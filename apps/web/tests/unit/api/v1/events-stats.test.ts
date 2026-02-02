/**
 * Unit tests for the events stats aggregation API route.
 *
 * Tests GET /api/v1/events/stats with groupBy, filtering, and access control.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockGetAllAccessibleCatalogIds: vi.fn(),
  mockParseBoundsParameter: vi.fn(),
  mockExtractBaseEventParameters: vi.fn(),
  mockBuildAggregationWhereClause: vi.fn(),
  mockNormalizeEndDate: vi.fn(),
  mockDrizzleExecute: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({
  withOptionalAuth: vi.fn((handler: (...args: unknown[]) => unknown) => handler),
  withAuth: vi.fn((handler: (...args: unknown[]) => unknown) => handler),
}));

vi.mock("payload", () => ({
  getPayload: mocks.mockGetPayload,
}));

vi.mock("@/lib/services/access-control", () => ({
  getAllAccessibleCatalogIds: mocks.mockGetAllAccessibleCatalogIds,
}));

vi.mock("@/lib/geospatial", () => ({
  parseBoundsParameter: mocks.mockParseBoundsParameter,
}));

vi.mock("@/lib/utils/event-params", () => ({
  extractBaseEventParameters: mocks.mockExtractBaseEventParameters,
}));

vi.mock("@/lib/services/aggregation-filters", () => ({
  buildAggregationWhereClause: mocks.mockBuildAggregationWhereClause,
  normalizeEndDate: mocks.mockNormalizeEndDate,
}));

vi.mock("@payloadcms/db-postgres", () => ({
  sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }), {
    join: vi.fn(),
    raw: vi.fn(),
  }),
}));

vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/events/stats/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

/**
 * Helper to create a mock request with the given query string.
 */
const createRequest = (queryString: string, user: unknown = null) => {
  return {
    user,
    nextUrl: new URL(`http://localhost:3000/api/v1/events/stats${queryString}`),
  } as unknown as AuthenticatedRequest;
};

/**
 * Sets up default mock implementations for a standard successful request.
 */
const setupDefaults = () => {
  mocks.mockGetPayload.mockResolvedValue({
    db: { drizzle: { execute: mocks.mockDrizzleExecute } },
  });

  mocks.mockExtractBaseEventParameters.mockReturnValue({
    catalog: null,
    datasets: [],
    startDate: null,
    endDate: null,
    fieldFilters: {},
  });

  mocks.mockNormalizeEndDate.mockReturnValue(null);
  mocks.mockParseBoundsParameter.mockReturnValue({ bounds: null });
  mocks.mockGetAllAccessibleCatalogIds.mockResolvedValue([1, 2]);
  mocks.mockBuildAggregationWhereClause.mockReturnValue("1=1");
  mocks.mockDrizzleExecute.mockResolvedValue({ rows: [] });
};

describe.sequential("GET /api/v1/events/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  describe.sequential("Parameter Validation", () => {
    it("should return 400 when groupBy parameter is missing", async () => {
      const req = createRequest("");

      const response = await GET(req, undefined);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Missing required parameter: groupBy");
    });

    it("should return 400 when groupBy value is invalid", async () => {
      const req = createRequest("?groupBy=invalid");

      const response = await GET(req, undefined);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Invalid groupBy value: invalid");
    });

    it("should return error when bounds parameter is invalid", async () => {
      const mockErrorResponse = {
        status: 400,
        json: () => Promise.resolve({ error: "Invalid bounds" }),
      };
      mocks.mockParseBoundsParameter.mockReturnValue({ error: mockErrorResponse });

      const req = createRequest("?groupBy=catalog&bounds=invalid");

      const response = await GET(req, undefined);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid bounds");
    });
  });

  describe.sequential("Access Control", () => {
    it("should return empty result when no accessible catalogs", async () => {
      mocks.mockGetAllAccessibleCatalogIds.mockResolvedValue([]);

      const req = createRequest("?groupBy=catalog");

      const response = await GET(req, undefined);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        items: [],
        total: 0,
        groupedBy: "catalog",
      });
      // Should not execute any SQL query
      expect(mocks.mockDrizzleExecute).not.toHaveBeenCalled();
    });
  });

  describe.sequential("Catalog Aggregation", () => {
    it("should return aggregated items grouped by catalog", async () => {
      mocks.mockDrizzleExecute.mockResolvedValue({
        rows: [
          { id: 1, name: "Catalog A", count: 15 },
          { id: 2, name: "Catalog B", count: 5 },
        ],
      });

      const req = createRequest("?groupBy=catalog");

      const response = await GET(req, undefined);

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
      mocks.mockDrizzleExecute.mockResolvedValue({
        rows: [
          { id: 10, name: "Dataset X", count: 30 },
          { id: 20, name: "Dataset Y", count: 12 },
        ],
      });

      const req = createRequest("?groupBy=dataset");

      const response = await GET(req, undefined);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.groupedBy).toBe("dataset");
      expect(data.total).toBe(42);
      expect(data.items).toHaveLength(2);
      expect(data.items[0]).toEqual({ id: 10, name: "Dataset X", count: 30 });
      expect(data.items[1]).toEqual({ id: 20, name: "Dataset Y", count: 12 });
    });

    it("should add 0-count entries for filtered datasets not in results", async () => {
      // Simulate filtering by datasets 10, 20, 30 but only 10 has events
      mocks.mockExtractBaseEventParameters.mockReturnValue({
        catalog: null,
        datasets: ["10", "20", "30"],
        startDate: null,
        endDate: null,
        fieldFilters: {},
      });

      // First execute: main aggregation query returns only dataset 10
      mocks.mockDrizzleExecute
        .mockResolvedValueOnce({
          rows: [{ id: 10, name: "Dataset X", count: 5 }],
        })
        // Second execute: fetch missing dataset names for 20 and 30
        .mockResolvedValueOnce({
          rows: [
            { id: 20, name: "Dataset Y" },
            { id: 30, name: "Dataset Z" },
          ],
        });

      const req = createRequest("?groupBy=dataset&datasets=10,20,30");

      const response = await GET(req, undefined);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.groupedBy).toBe("dataset");
      expect(data.total).toBe(5);
      expect(data.items).toHaveLength(3);
      // Sorted by count descending: dataset 10 first, then 0-count ones
      expect(data.items[0]).toEqual({ id: 10, name: "Dataset X", count: 5 });
      expect(data.items[1]).toEqual(expect.objectContaining({ count: 0 }));
      expect(data.items[2]).toEqual(expect.objectContaining({ count: 0 }));

      // Verify second query was made for missing datasets
      expect(mocks.mockDrizzleExecute).toHaveBeenCalledTimes(2);
    });
  });

  describe.sequential("Error Handling", () => {
    it("should return 500 when an unexpected error occurs", async () => {
      mocks.mockGetPayload.mockRejectedValue(new Error("Database connection failed"));

      const req = createRequest("?groupBy=catalog");

      const response = await GET(req, undefined);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Failed to aggregate events");
    });
  });
});
