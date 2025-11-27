/**
 * Helper functions for the MapExplorer component.
 *
 * @module
 * @category Components
 */
import type { FilterState } from "@/lib/store";
import type { Catalog, Dataset } from "@/payload-types";

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface FilterLabels {
  catalog?: string;
  datasets: Array<{ id: string; name: string }>;
  dateRange?: string;
}

/** Convert map bounds to simple object format for React Query compatibility */
export const simplifyBounds = (mapBounds: MapBounds | null): MapBounds | null => {
  if (!mapBounds) return null;
  return {
    north: mapBounds.north,
    south: mapBounds.south,
    east: mapBounds.east,
    west: mapBounds.west,
  };
};

/** Get catalog name by ID */
export const getCatalogName = (catalogs: Catalog[], catalogId: string): string => {
  const catalog = catalogs.find((c) => String(c.id) === catalogId);
  return catalog?.name ?? "Unknown Catalog";
};

/** Get dataset name by ID */
export const getDatasetName = (datasets: Dataset[], datasetId: string): string => {
  const dataset = datasets.find((d) => String(d.id) === datasetId);
  return dataset?.name ?? "Unknown Dataset";
};

/** Format date range for display */
export const formatDateRange = (startDate: string | null, endDate: string | null): string | undefined => {
  const hasStartDate = startDate != null && startDate !== "";
  const hasEndDate = endDate != null && endDate !== "";

  if (!hasStartDate && !hasEndDate) {
    return undefined;
  }

  const start = hasStartDate ? new Date(startDate).toLocaleDateString("en-US") : "Start";
  const end = hasEndDate ? new Date(endDate).toLocaleDateString("en-US") : "End";

  if (hasStartDate && hasEndDate) {
    return `${start} - ${end}`;
  } else if (hasStartDate) {
    return `From ${start}`;
  } else if (hasEndDate) {
    return `Until ${end}`;
  }
  return undefined;
};

/** Get human-readable filter labels */
export const getFilterLabels = (filters: FilterState, catalogs: Catalog[], datasets: Dataset[]): FilterLabels => ({
  catalog: filters.catalog != null && filters.catalog !== "" ? getCatalogName(catalogs, filters.catalog) : undefined,
  datasets: filters.datasets.map((id) => ({
    id,
    name: getDatasetName(datasets, id),
  })),
  dateRange: formatDateRange(filters.startDate, filters.endDate),
});

/** Determine loading states */
export const getLoadingStates = (
  isLoading: boolean,
  hasLoadedOnce: boolean,
  eventsCount: number,
  clustersCount: number
): { isInitialLoad: boolean; isUpdating: boolean; shouldMarkLoaded: boolean } => ({
  isInitialLoad: isLoading && !hasLoadedOnce,
  isUpdating: isLoading && hasLoadedOnce,
  shouldMarkLoaded: !isLoading && !hasLoadedOnce && (eventsCount > 0 || clustersCount > 0),
});
