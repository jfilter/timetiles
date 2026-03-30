/**
 * Pure helper functions for the data source selector component.
 *
 * @module
 * @category Components
 */
import type { DataSourceCatalog, DataSourceDataset } from "@/lib/hooks/use-data-sources-query";

/** Number of datasets within a catalog group before collapsing */
export const DATASET_COLLAPSE_THRESHOLD = 10;

/** A catalog with its child datasets and total event count */
export interface CatalogGroup {
  catalog: DataSourceCatalog;
  datasets: DataSourceDataset[];
  totalEvents: number;
}

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

/** Sort datasets by event count then name */
const sortDatasets = (
  datasets: DataSourceDataset[],
  eventCounts: Record<string, number> | undefined
): DataSourceDataset[] =>
  [...datasets].sort((a, b) => {
    const countA = eventCounts?.[String(a.id)] ?? 0;
    const countB = eventCounts?.[String(b.id)] ?? 0;
    if (countB !== countA) return countB - countA;
    return a.name.localeCompare(b.name);
  });

/** Group datasets by catalog, sorted by total event count */
export const groupDatasetsByCatalog = (
  datasets: DataSourceDataset[],
  catalogs: DataSourceCatalog[],
  scopeCatalogIds: number[] | undefined,
  scopeDatasetIds: number[] | undefined,
  eventCountsByCatalog: Record<string, number> | undefined,
  eventCountsByDataset: Record<string, number> | undefined
): CatalogGroup[] => {
  const sortedCatalogs = filterAndSortCatalogs(catalogs, scopeCatalogIds, eventCountsByCatalog);

  // Build a set of allowed dataset IDs if scope is active
  const scopeIds = scopeDatasetIds?.length ? new Set(scopeDatasetIds) : null;

  // Map datasets to their catalog
  const datasetsByCatalog = new Map<number, DataSourceDataset[]>();
  for (const dataset of datasets) {
    if (dataset.catalogId == null) continue;
    if (scopeIds && !scopeIds.has(dataset.id)) continue;
    const list = datasetsByCatalog.get(dataset.catalogId) ?? [];
    list.push(dataset);
    datasetsByCatalog.set(dataset.catalogId, list);
  }

  return sortedCatalogs
    .map((catalog) => ({
      catalog,
      datasets: sortDatasets(datasetsByCatalog.get(catalog.id) ?? [], eventCountsByDataset),
      totalEvents: eventCountsByCatalog?.[String(catalog.id)] ?? 0,
    }))
    .filter((group) => group.datasets.length > 0);
};

export interface GroupedCatalogs {
  owned: CatalogGroup[];
  public: CatalogGroup[];
}

/** Split catalog groups into owned and public */
export const groupCatalogs = (groups: CatalogGroup[]): GroupedCatalogs => ({
  owned: groups.filter((g) => g.catalog.isOwned),
  public: groups.filter((g) => !g.catalog.isOwned),
});

/** Determine the check state of a catalog based on its datasets' selection */
export const getCatalogCheckState = (
  catalogDatasetIds: string[],
  selectedDatasets: string[]
): "all" | "some" | "none" => {
  if (catalogDatasetIds.length === 0) return "none";
  const selectedSet = new Set(selectedDatasets);
  const selectedCount = catalogDatasetIds.filter((id) => selectedSet.has(id)).length;
  if (selectedCount === 0) return "none";
  if (selectedCount === catalogDatasetIds.length) return "all";
  return "some";
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
