/**
 * Provides a centralized custom hook for managing filter state across the application.
 *
 * This module uses the `nuqs` library to synchronize filter state (such as selected
 * datasets and date ranges) with the URL query parameters. This ensures that the filter
 * state is bookmarkable and shareable.
 *
 * The `useFilters` hook encapsulates the logic for reading, updating, and clearing filters,
 * providing a clean and reusable interface for any component that needs to interact with
 * the global filter state.
 *
 * @module
 */
import { parseAsArrayOf, parseAsFloat, parseAsInteger, parseAsString, useQueryState, useQueryStates } from "nuqs";

import type { FilterState } from "../types/filter-state";
import { clearAllFilters, getActiveFilterCount, hasActiveFilters, removeFilter } from "../types/filter-state";

// Re-export FilterState for external use
export type { FilterState };

// Custom parsers for nuqs
const parseAsStringOrNull = parseAsString.withDefault("");
const parseAsArrayOfStrings = parseAsArrayOf(parseAsString).withDefault([]);

/** Format a Date as YYYY-MM-DD. */
const formatDateValue = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Serialize field filters to a JSON string (empty string if none). */
const serializeFieldFilters = (ff: Record<string, string[]>) => (Object.keys(ff).length > 0 ? JSON.stringify(ff) : "");

/** Parse field filters from a JSON string. */
const parseFieldFilters = (raw: string | null): Record<string, string[]> => {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return {};
  }
};

// Custom hook for managing all filter state via URL
// Uses useQueryStates to batch related URL param updates into a single URL change,
// avoiding intermediate states and unnecessary rerenders.
export const useFilters = () => {
  const [filterParams, setFilterParams] = useQueryStates({
    datasets: parseAsArrayOfStrings,
    startDate: parseAsStringOrNull,
    endDate: parseAsStringOrNull,
    ff: parseAsStringOrNull,
  });

  const datasets = filterParams.datasets;
  const startDate = filterParams.startDate;
  const endDate = filterParams.endDate;
  const fieldFiltersParam = filterParams.ff;

  const fieldFilters = parseFieldFilters(fieldFiltersParam);

  const filters: FilterState = { datasets, startDate: startDate || null, endDate: endDate || null, fieldFilters };

  // Enhanced setDatasets — clears field filters (dataset-specific)
  const handleSetDatasets = (newDatasets: string[]) => {
    void setFilterParams({ datasets: newDatasets, ff: "" });
  };

  const setFieldFilters = (newFieldFilters: Record<string, string[]>) =>
    void setFilterParams({ ff: serializeFieldFilters(newFieldFilters) });

  const setFieldFilter = (fieldPath: string, values: string[]) => {
    const updated = { ...fieldFilters };
    if (values.length > 0) {
      updated[fieldPath] = values;
    } else {
      delete updated[fieldPath];
    }
    void setFilterParams({ ff: serializeFieldFilters(updated) });
  };

  const applyFilterState = (newFilters: FilterState) => {
    void setFilterParams({
      datasets: newFilters.datasets,
      startDate: newFilters.startDate ?? "",
      endDate: newFilters.endDate ?? "",
      ff: serializeFieldFilters(newFilters.fieldFilters),
    });
  };

  const handleRemoveFilter = (filterType: keyof FilterState, value?: string) =>
    applyFilterState(removeFilter(filters, filterType, value));

  const handleClearAllFilters = () => applyFilterState(clearAllFilters(filters));

  // Toggle all datasets belonging to a catalog on/off
  const toggleCatalogDatasets = (catalogDatasetIds: string[]) => {
    const current = new Set(filters.datasets);
    const allSelected = catalogDatasetIds.every((id) => current.has(id));

    let newDatasets: string[];
    if (allSelected) {
      // Deselect all datasets from this catalog
      newDatasets = filters.datasets.filter((id) => !catalogDatasetIds.includes(id));
    } else {
      // Select all datasets from this catalog (add missing ones)
      const toAdd = catalogDatasetIds.filter((id) => !current.has(id));
      newDatasets = [...filters.datasets, ...toAdd];
    }
    handleSetDatasets(newDatasets);
  };

  const toggleDataset = (datasetId: string) => {
    const current = filters.datasets;
    handleSetDatasets(current.includes(datasetId) ? current.filter((id) => id !== datasetId) : [...current, datasetId]);
  };

  const setSingleDayFilter = (date: Date) => {
    const formatted = formatDateValue(date);
    void setFilterParams({ startDate: formatted, endDate: formatted });
  };

  const clearDateRange = () => {
    void setFilterParams({ startDate: "", endDate: "" });
  };

  const activeFilterCount = getActiveFilterCount(filters);
  const hasActiveFiltersValue = hasActiveFilters(filters);

  return {
    // Filter state
    filters,

    // Individual filter setters
    setDatasets: handleSetDatasets,
    setStartDate: (value: string | null) => void setFilterParams({ startDate: value ?? "" }),
    setEndDate: (value: string | null) => void setFilterParams({ endDate: value ?? "" }),
    setFieldFilters,
    setFieldFilter,

    // Higher-level actions
    toggleCatalogDatasets,
    toggleDataset,
    setSingleDayFilter,
    clearDateRange,

    // Helper functions
    removeFilter: handleRemoveFilter,
    clearAllFilters: handleClearAllFilters,

    // Computed values
    activeFilterCount,
    hasActiveFilters: hasActiveFiltersValue,
  };
};

/**
 * Hook for managing selected event state via URL.
 *
 * Uses nuqs to sync the selected event ID with the URL, enabling
 * permalink sharing of the explore page with a specific event open.
 *
 * @returns Selected event state and handlers
 */
export const useSelectedEvent = () => {
  // URL state for selected event - uses history: "push" for browser back button support
  const [selectedEventId, setSelectedEventId] = useQueryState(
    "event",
    parseAsInteger.withOptions({ history: "push", shallow: true })
  );

  const openEvent = (eventId: number) => {
    void setSelectedEventId(eventId);
  };

  const closeEvent = () => {
    void setSelectedEventId(null);
  };

  return { selectedEventId, isOpen: selectedEventId !== null, openEvent, closeEvent };
};

/**
 * Map position state stored in URL.
 *
 * Includes center coordinates (lat/lng) and zoom level.
 */
export interface MapPosition {
  latitude: number | null;
  longitude: number | null;
  zoom: number | null;
}

/**
 * Hook for managing map position state via URL.
 *
 * Uses nuqs to sync the map center (lat/lng) and zoom level with the URL,
 * enabling permalink sharing of the explore page with a specific map view.
 * Uses shallow routing and replace history to avoid excessive history entries.
 *
 * @returns Map position state and handlers
 */
export const useMapPosition = () => {
  const [latitude, setLatitude] = useQueryState("lat", parseAsFloat.withOptions({ history: "replace", shallow: true }));

  const [longitude, setLongitude] = useQueryState(
    "lng",
    parseAsFloat.withOptions({ history: "replace", shallow: true })
  );

  const [zoom, setZoom] = useQueryState("zoom", parseAsFloat.withOptions({ history: "replace", shallow: true }));

  const mapPosition: MapPosition = { latitude, longitude, zoom };

  const hasMapPosition = latitude !== null && longitude !== null && zoom !== null;

  const setMapPosition = (position: { latitude: number; longitude: number; zoom: number }) => {
    // Round to 4 decimal places for cleaner URLs (~11m precision)
    void setLatitude(Math.round(position.latitude * 10000) / 10000);
    void setLongitude(Math.round(position.longitude * 10000) / 10000);
    void setZoom(Math.round(position.zoom * 10) / 10);
  };

  const clearMapPosition = () => {
    void setLatitude(null);
    void setLongitude(null);
    void setZoom(null);
  };

  return { mapPosition, hasMapPosition, setMapPosition, clearMapPosition };
};
