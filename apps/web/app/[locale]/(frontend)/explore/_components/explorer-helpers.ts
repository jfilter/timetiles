/**
 * Helper functions shared by MapExplorer and ListExplorer.
 *
 * @module
 * @category Components
 */
import type { MapBounds } from "@/lib/geospatial/types";
import type { DataSourceCatalog, DataSourceDataset } from "@/lib/hooks/use-data-sources-query";
import type { FilterState } from "@/lib/types/filter-state";
import { formatDateRangeLabel } from "@/lib/utils/date";

export interface DateRangeLabel {
  type: "range" | "since" | "until";
  formatted: string;
}

export interface FilterLabels {
  datasets: Array<{ id: string; name: string }>;
  dateRange?: DateRangeLabel;
  fieldFilters?: Record<string, string[]>;
}

export type TranslateFn = (key: string, values?: Record<string, unknown>) => string;

/** Convert map bounds to simple object format for React Query compatibility */
export const simplifyBounds = (mapBounds: MapBounds | null): MapBounds | null => {
  if (!mapBounds) return null;
  return { north: mapBounds.north, south: mapBounds.south, east: mapBounds.east, west: mapBounds.west };
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

/** Format date range for display -- delegates to shared utility */
export const formatDateRange = formatDateRangeLabel;

/** Get human-readable filter labels */
export const getFilterLabels = (
  filters: FilterState,
  _catalogs: DataSourceCatalog[],
  datasets: DataSourceDataset[],
  locale?: string
): FilterLabels => ({
  datasets: filters.datasets.map((id) => ({ id, name: getDatasetName(datasets, id) })),
  dateRange: formatDateRange(filters.startDate, filters.endDate, locale),
  fieldFilters: filters.fieldFilters && Object.keys(filters.fieldFilters).length > 0 ? filters.fieldFilters : undefined,
});

/** Format dataset names for display in description */
const formatDatasetNames = (names: string[], t: TranslateFn): string | null => {
  const first = names[0];
  const second = names[1];
  if (first == null) return null;
  if (second == null) return first;
  if (names.length === 2) return t("descJoinTwo", { first, second });
  return t("descJoinMore", { first, second, count: names.length - 2 });
};

/** Format field filters for display (e.g., "agency (EPA, DOT) and status (open, resolved)") */
const formatFieldFilters = (fieldFilters: Record<string, string[]>, t: TranslateFn): string | null => {
  const entries = Object.entries(fieldFilters).filter(([, values]) => values.length > 0);
  if (entries.length === 0) return null;

  const parts = entries.map(([field, values]) => {
    const valuesList = values.length <= 3 ? values.join(", ") : `${values[0]}, ${values[1]} +${values.length - 2}`;
    return `${field} (${valuesList})`;
  });

  if (parts.length === 1) return parts[0] ?? null;
  if (parts.length === 2) return t("descJoinTwo", { first: parts[0] ?? "", second: parts[1] ?? "" });
  const last = parts.pop();
  return `${parts.join(", ")}, ${last}`;
};

/** Build a natural sentence describing what events are being shown */
export const buildEventsDescription = (
  visibleCount: number,
  globalTotal: number | undefined,
  filterLabels: FilterLabels,
  hasBounds: boolean,
  t: TranslateFn
): string => {
  const datasetNames = filterLabels.datasets.map((d) => d.name);
  const datasetsText = formatDatasetNames(datasetNames, t);
  const fieldFiltersText = filterLabels.fieldFilters ? formatFieldFilters(filterLabels.fieldFilters, t) : null;

  // Determine if map bounds are limiting the results
  const isMapLimiting = hasBounds && globalTotal != null && visibleCount < globalTotal;

  // Build the base sentence
  let sentence: string;
  if (isMapLimiting) {
    sentence = t("descShowingOfTotal", { visible: visibleCount.toLocaleString(), total: globalTotal.toLocaleString() });
  } else if (globalTotal == null) {
    sentence = t("descShowingEvents", { count: visibleCount });
  } else {
    sentence = t("descShowingAll", { count: visibleCount.toLocaleString() });
  }

  // Add dataset filter
  if (datasetsText) {
    sentence += t("descFromDatasets", { datasets: datasetsText });
  }

  // Add spatial constraint (only when map is actually limiting)
  if (isMapLimiting) {
    sentence += t("descInMapView");
  }

  // Add field filters
  if (fieldFiltersText) {
    sentence += t("descFilteredBy", { filters: fieldFiltersText });
  }

  // Add date filter
  if (filterLabels.dateRange) {
    const { type, formatted } = filterLabels.dateRange;
    const dateText =
      type === "since"
        ? t("descSince", { date: formatted })
        : type === "until"
          ? t("descUntil", { date: formatted })
          : formatted;
    sentence += t("descSpanning", { dateRange: dateText });
  }

  return sentence + ".";
};

/** Check if data bounds are outside the current viewport */
export const isDataBoundsOutsideViewport = (
  dataBounds: MapBounds | null | undefined,
  mapBounds: MapBounds | null | undefined
): boolean => {
  if (!dataBounds || !mapBounds) return false;
  return (
    dataBounds.west < mapBounds.west ||
    dataBounds.south < mapBounds.south ||
    dataBounds.east > mapBounds.east ||
    dataBounds.north > mapBounds.north
  );
};

interface MapPosition {
  latitude: number | null;
  longitude: number | null;
  zoom: number | null;
}

/** Convert map position to initial view state, returns null if incomplete */
export const getInitialViewState = (
  hasMapPosition: boolean,
  mapPosition: MapPosition
): { latitude: number; longitude: number; zoom: number } | null => {
  if (!hasMapPosition) return null;
  if (mapPosition.latitude == null || mapPosition.longitude == null || mapPosition.zoom == null) return null;
  return { latitude: mapPosition.latitude, longitude: mapPosition.longitude, zoom: mapPosition.zoom };
};

/** Check if zoom to data button should be shown */
export const shouldShowZoomToData = (
  hasUserPanned: boolean,
  dataBoundsOutsideViewport: boolean,
  boundsExist: boolean,
  boundsLoading: boolean
): boolean => (hasUserPanned || dataBoundsOutsideViewport) && boundsExist && !boundsLoading;
