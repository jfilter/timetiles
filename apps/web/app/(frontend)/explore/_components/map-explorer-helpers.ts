/**
 * Helper functions for the MapExplorer component.
 *
 * @module
 * @category Components
 */
import type { DataSourceCatalog, DataSourceDataset } from "@/lib/hooks/use-data-sources-query";
import type { FilterState } from "@/lib/store";

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
  fieldFilters?: Record<string, string[]>;
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
export const getCatalogName = (catalogs: DataSourceCatalog[], catalogId: string): string => {
  const catalog = catalogs.find((c) => String(c.id) === catalogId);
  return catalog?.name ?? "Unknown Catalog";
};

/** Get dataset name by ID */
export const getDatasetName = (datasets: DataSourceDataset[], datasetId: string): string => {
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
export const getFilterLabels = (
  filters: FilterState,
  catalogs: DataSourceCatalog[],
  datasets: DataSourceDataset[]
): FilterLabels => ({
  catalog: filters.catalog != null && filters.catalog !== "" ? getCatalogName(catalogs, filters.catalog) : undefined,
  datasets: filters.datasets.map((id) => ({
    id,
    name: getDatasetName(datasets, id),
  })),
  dateRange: formatDateRange(filters.startDate, filters.endDate),
  fieldFilters:
    filters.fieldFilters && Object.keys(filters.fieldFilters).length > 0 ? filters.fieldFilters : undefined,
});

/** Format dataset names for display in description */
const formatDatasetNames = (names: string[]): string | null => {
  const first = names[0];
  const second = names[1];
  if (first == null) return null;
  if (second == null) return first;
  if (names.length === 2) return `${first} and ${second}`;
  return `${first}, ${second} and ${names.length - 2} more`;
};

/** Format field filters for display (e.g., "agency (EPA, DOT) and status (open, resolved)") */
const formatFieldFilters = (fieldFilters: Record<string, string[]>): string | null => {
  const entries = Object.entries(fieldFilters).filter(([, values]) => values.length > 0);
  if (entries.length === 0) return null;

  const parts = entries.map(([field, values]) => {
    const valuesList = values.length <= 3 ? values.join(", ") : `${values[0]}, ${values[1]} +${values.length - 2} more`;
    return `${field} (${valuesList})`;
  });

  // Join with "and" for natural English
  if (parts.length === 1) return parts[0] ?? null;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  const last = parts.pop();
  return `${parts.join(", ")}, and ${last}`;
};

/** Build a natural sentence describing what events are being shown */
export const buildEventsDescription = (
  visibleCount: number,
  globalTotal: number | undefined,
  filterLabels: FilterLabels,
  hasBounds: boolean
): string => {
  // Build natural sentences like:
  // "Showing 34 of 1,245 events from Historical Events in the map view, spanning Jan to Dec 2024."
  // "Showing all 200 events from Historical Events."
  // "Showing 500 of 1,245 events in the map view."
  // "Showing all 1,245 events."
  // "Showing 90 events filtered by category: Music, Sports."

  const datasetNames = filterLabels.datasets.map((d) => d.name);
  const datasetsText = formatDatasetNames(datasetNames);
  const fieldFiltersText = filterLabels.fieldFilters ? formatFieldFilters(filterLabels.fieldFilters) : null;

  // Determine if map bounds are limiting the results
  const isMapLimiting = hasBounds && globalTotal != null && visibleCount < globalTotal;

  // Start with the count
  let sentence = "Showing ";
  if (isMapLimiting) {
    sentence += `${visibleCount.toLocaleString()} of ${globalTotal.toLocaleString()} events`;
  } else if (globalTotal != null) {
    sentence += `all ${visibleCount.toLocaleString()} events`;
  } else {
    sentence += `${visibleCount.toLocaleString()} event${visibleCount === 1 ? "" : "s"}`;
  }

  // Add dataset filter
  if (datasetsText) {
    sentence += ` from ${datasetsText}`;
  }

  // Add spatial constraint (only when map is actually limiting)
  if (isMapLimiting) {
    sentence += " in the map view";
  }

  // Add field filters
  if (fieldFiltersText) {
    sentence += `, filtered by ${fieldFiltersText}`;
  }

  // Add date filter
  if (filterLabels.dateRange) {
    // Make the date range flow naturally
    sentence += `, spanning ${filterLabels.dateRange.toLowerCase().replace(/^from /, "")}`;
  }

  return sentence + ".";
};

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
