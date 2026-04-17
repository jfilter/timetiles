/**
 * Unit tests for useDataSourcesQuery.
 *
 * Verifies the query key and that the query function fetches every paginated
 * dataset page while preserving the aggregated client response shape.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

import { dataSourcesKeys } from "@/lib/hooks/use-data-sources-query";

const mockFetchJson = vi.hoisted(() => vi.fn());
const capturedOptions = vi.hoisted(() => ({ queryFn: null as (() => Promise<unknown>) | null }));

vi.mock("@/lib/api/http-error", () => ({ fetchJson: mockFetchJson }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryFn: () => Promise<unknown> }) => {
    capturedOptions.queryFn = options.queryFn;
    return { data: undefined, isLoading: false, error: null };
  },
}));

describe("dataSourcesKeys", () => {
  it("uses the expected query key", () => {
    expect(dataSourcesKeys.all).toEqual(["data-sources"]);
  });
});

describe("useDataSourcesQuery queryFn", () => {
  it("fetches and aggregates all paginated dataset pages", async () => {
    const { useDataSourcesQuery } = await import("@/lib/hooks/use-data-sources-query");
    useDataSourcesQuery();

    mockFetchJson
      .mockResolvedValueOnce({
        catalogs: [{ id: 1, name: "Catalog", isOwned: false }],
        datasets: [{ id: 10, name: "Dataset A", catalogId: 1, hasTemporalData: true }],
        pagination: { page: 1, limit: 250, totalDocs: 2, totalPages: 2, hasNextPage: true, hasPrevPage: false },
      })
      .mockResolvedValueOnce({
        catalogs: [{ id: 1, name: "Catalog", isOwned: false }],
        datasets: [{ id: 11, name: "Dataset B", catalogId: 1, hasTemporalData: true }],
        pagination: { page: 2, limit: 250, totalDocs: 2, totalPages: 2, hasNextPage: false, hasPrevPage: true },
      });

    const result = await capturedOptions.queryFn!();

    expect(mockFetchJson).toHaveBeenNthCalledWith(1, "/api/v1/data-sources?page=1&limit=250");
    expect(mockFetchJson).toHaveBeenNthCalledWith(2, "/api/v1/data-sources?page=2&limit=250");
    expect(result).toEqual({
      catalogs: [{ id: 1, name: "Catalog", isOwned: false }],
      datasets: [
        { id: 10, name: "Dataset A", catalogId: 1, hasTemporalData: true },
        { id: 11, name: "Dataset B", catalogId: 1, hasTemporalData: true },
      ],
    });
  });
});
