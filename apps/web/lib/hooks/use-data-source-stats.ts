/**
 * React Query hook for fetching data source statistics.
 *
 * Provides event counts per catalog and dataset for display in the
 * DataSourceSelector component. Data is cached with a long stale time
 * since total counts don't change frequently.
 *
 * @module
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { QUERY_PRESETS } from "./query-presets";

/**
 * Response format for data source stats endpoint.
 */
export interface DataSourceStatsResponse {
  catalogCounts: Record<string, number>;
  datasetCounts: Record<string, number>;
  totalEvents: number;
}

/**
 * Query key for data source stats.
 */
export const dataSourceStatsQueryKey = ["data-source-stats"] as const;

/**
 * Fetch data source statistics from the API.
 */
const fetchDataSourceStats = async (): Promise<DataSourceStatsResponse> => {
  const response = await fetch("/api/v1/sources/stats");

  if (!response.ok) {
    throw new Error(`Failed to fetch data source stats: ${response.status}`);
  }

  return response.json() as Promise<DataSourceStatsResponse>;
};

/**
 * Hook to fetch event counts by catalog and dataset.
 *
 * Returns total event counts for each catalog and dataset.
 * These counts are independent of any filters and represent
 * the total available data in each source.
 *
 * @example
 * ```tsx
 * const { data: stats } = useDataSourceStatsQuery();
 *
 * // Access counts
 * const catalogEventCount = stats?.catalogCounts["1"] ?? 0;
 * const datasetEventCount = stats?.datasetCounts["5"] ?? 0;
 * ```
 */
export const useDataSourceStatsQuery = () =>
  useQuery({
    queryKey: dataSourceStatsQueryKey,
    queryFn: fetchDataSourceStats,
    ...QUERY_PRESETS.stable,
    // Refetch on window focus to catch new imports
    refetchOnWindowFocus: true,
  });
