/**
 * Hook for fetching catalog and dataset names by ID.
 *
 * Used by the header to display the current filter context without
 * fetching all catalogs/datasets upfront. Only fetches what's needed
 * and caches results.
 *
 * @module
 */
"use client";

import { useQuery } from "@tanstack/react-query";

interface NameLookup {
  id: string;
  name: string;
}

// Fetch catalog name by ID using Payload REST API with select
const fetchCatalogName = async (catalogId: string): Promise<NameLookup | null> => {
  if (!catalogId) return null;

  const response = await fetch(`/api/catalogs/${catalogId}?select[id]=true&select[name]=true`);

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error("Failed to fetch catalog");
  }

  const data = await response.json();
  return { id: String(data.id), name: data.name };
};

// Fetch dataset name by ID using Payload REST API with select
const fetchDatasetName = async (datasetId: string): Promise<NameLookup | null> => {
  if (!datasetId) return null;

  const response = await fetch(`/api/datasets/${datasetId}?select[id]=true&select[name]=true`);

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error("Failed to fetch dataset");
  }

  const data = await response.json();
  return { id: String(data.id), name: data.name };
};

// Fetch multiple dataset names
const fetchDatasetNames = async (datasetIds: string[]): Promise<NameLookup[]> => {
  if (datasetIds.length === 0) return [];

  // Fetch in parallel
  const results = await Promise.all(datasetIds.map((id) => fetchDatasetName(id)));

  return results.filter((r): r is NameLookup => r !== null);
};

// Query keys
export const filterNamesKeys = {
  catalog: (id: string | null) => ["catalog-name", id] as const,
  datasets: (ids: string[]) => ["dataset-names", [...ids].sort((a, b) => a.localeCompare(b)).join(",")] as const,
};

/**
 * Hook to fetch catalog name by ID.
 * Results are cached - subsequent calls with same ID return cached data.
 */
export const useCatalogName = (catalogId: string | null) =>
  useQuery({
    queryKey: filterNamesKeys.catalog(catalogId),
    queryFn: () => fetchCatalogName(catalogId!),
    enabled: catalogId != null && catalogId !== "",
    staleTime: 5 * 60 * 1000, // 5 minutes - names rarely change
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

/**
 * Hook to fetch dataset names by IDs.
 * Results are cached - subsequent calls with same IDs return cached data.
 */
export const useDatasetNames = (datasetIds: string[]) =>
  useQuery({
    queryKey: filterNamesKeys.datasets(datasetIds),
    queryFn: () => fetchDatasetNames(datasetIds),
    enabled: datasetIds.length > 0 && datasetIds[0] !== "",
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

/**
 * Hook to get display title based on current filters.
 * Fetches only the catalog/dataset names that are needed.
 */
export const useFilterTitle = (filters: { catalog?: string | null; datasets: string[] }) => {
  const { data: catalog } = useCatalogName(filters.catalog ?? null);
  const { data: datasets } = useDatasetNames(!filters.catalog ? filters.datasets : []);

  // Build title based on what's selected
  if (filters.catalog && catalog) {
    return catalog.name;
  }

  if (filters.datasets.length > 0 && datasets && datasets.length > 0) {
    const firstDataset = datasets[0];
    if (datasets.length === 1 && firstDataset) {
      return firstDataset.name;
    }
    if (datasets.length === 2) {
      return datasets.map((d) => d.name).join(", ");
    }
    return `${datasets.length} Datasets`;
  }

  return "All Events";
};
