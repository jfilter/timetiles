/**
 * React Query hook for fetching lightweight catalog and dataset data.
 *
 * Used by filter components to display catalog/dataset names without
 * fetching full objects. Results are cached for 5 minutes.
 *
 * @module
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/http-error";
import type { DataSourcesResponse, PaginatedDataSourcesResponse } from "@/lib/types/data-sources";

import { QUERY_PRESETS } from "./query-presets";

// Re-export types for consumers
export type { DataSourceCatalog, DataSourceDataset, DataSourcesResponse } from "@/lib/types/data-sources";

const DATA_SOURCES_PAGE_LIMIT = 250;

const fetchDataSourcesPage = async (page: number): Promise<PaginatedDataSourcesResponse> =>
  fetchJson<PaginatedDataSourcesResponse>(`/api/v1/data-sources?page=${page}&limit=${DATA_SOURCES_PAGE_LIMIT}`);

const fetchDataSources = async (): Promise<DataSourcesResponse> => {
  const firstPage = await fetchDataSourcesPage(1);
  if (!firstPage.pagination.hasNextPage) {
    return { catalogs: firstPage.catalogs, datasets: firstPage.datasets };
  }

  const remainingPages = Array.from({ length: Math.max(firstPage.pagination.totalPages - 1, 0) }, (_, index) =>
    fetchDataSourcesPage(index + 2)
  );
  const remainingResults = await Promise.all(remainingPages);

  return {
    catalogs: firstPage.catalogs,
    datasets: [firstPage.datasets, ...remainingResults.map((page) => page.datasets)].flat(),
  };
};

export const dataSourcesKeys = { all: ["data-sources"] as const };

/**
 * Hook to fetch lightweight catalog and dataset data.
 *
 * Returns only id, name, and catalogId - much lighter than full objects.
 * Results are cached for 5 minutes.
 */
export const useDataSourcesQuery = () =>
  useQuery({ queryKey: dataSourcesKeys.all, queryFn: fetchDataSources, ...QUERY_PRESETS.stable });
