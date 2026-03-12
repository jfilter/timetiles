/**
 * Pure helper functions for the data source selector component.
 *
 * @module
 * @category Components
 */
import type { DataSourceCatalog, DataSourceDataset } from "@/lib/hooks/use-data-sources-query";

/** Number of catalogs to show before collapsing */
export const CATALOG_COLLAPSE_THRESHOLD = 6;
/** Number of catalogs to show when collapsed */
export const CATALOG_VISIBLE_WHEN_COLLAPSED = 4;

/** Number of datasets to show before collapsing */
export const DATASET_COLLAPSE_THRESHOLD = 10;

/** Count datasets per catalog */
export const countDatasetsByCatalog = (datasets: DataSourceDataset[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const dataset of datasets) {
    if (dataset.catalogId != null) {
      const catalogId = String(dataset.catalogId);
      counts[catalogId] = (counts[catalogId] ?? 0) + 1;
    }
  }
  return counts;
};

/** Filter and sort catalogs by event count, applying view scope if present */
export const filterAndSortCatalogs = (
  catalogs: DataSourceCatalog[],
  scopeCatalogIds: number[] | undefined,
  eventCounts: Record<string, number> | undefined
): DataSourceCatalog[] => {
  let filtered = catalogs;
  if (scopeCatalogIds?.length) {
    const scopeIds = new Set(scopeCatalogIds);
    filtered = filtered.filter((c) => scopeIds.has(c.id));
  }
  return [...filtered].sort((a, b) => {
    const countA = eventCounts?.[String(a.id)] ?? 0;
    const countB = eventCounts?.[String(b.id)] ?? 0;
    if (countB !== countA) return countB - countA;
    return a.name.localeCompare(b.name);
  });
};

/** Filter and sort datasets by catalog and scope, sorted by event count */
export const filterAndSortDatasets = (
  datasets: DataSourceDataset[],
  catalogFilter: string | null,
  scopeDatasetIds: number[] | undefined,
  eventCounts: Record<string, number> | undefined
): DataSourceDataset[] => {
  let filtered = datasets;
  if (scopeDatasetIds?.length) {
    const scopeIds = new Set(scopeDatasetIds);
    filtered = filtered.filter((d) => scopeIds.has(d.id));
  }
  const catalogDatasets =
    catalogFilter == null
      ? filtered
      : filtered.filter((d) => d.catalogId != null && String(d.catalogId) === catalogFilter);
  return [...catalogDatasets].sort((a, b) => {
    const countA = eventCounts?.[String(a.id)] ?? 0;
    const countB = eventCounts?.[String(b.id)] ?? 0;
    if (countB !== countA) return countB - countA;
    return a.name.localeCompare(b.name);
  });
};

/**
 * Format large numbers compactly (e.g., 12450 -> "12.4k")
 */
export const formatCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
};
