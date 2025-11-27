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

import type { DataSourcesResponse } from "@/app/api/v1/data-sources/route";

// Re-export types for consumers
export type { DataSourceCatalog, DataSourceDataset, DataSourcesResponse } from "@/app/api/v1/data-sources/route";

const fetchDataSources = async (): Promise<DataSourcesResponse> => {
  const response = await fetch("/api/v1/data-sources");

  if (!response.ok) {
    throw new Error("Failed to fetch data sources");
  }

  return response.json();
};

export const dataSourcesKeys = {
  all: ["data-sources"] as const,
};

/**
 * Hook to fetch lightweight catalog and dataset data.
 *
 * Returns only id, name, and catalogId - much lighter than full objects.
 * Results are cached for 5 minutes.
 */
export const useDataSourcesQuery = () =>
  useQuery({
    queryKey: dataSourcesKeys.all,
    queryFn: fetchDataSources,
    staleTime: 5 * 60 * 1000, // 5 minutes - names rarely change
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
