/**
 * Provides a centralized custom hook for managing filter state across the application.
 *
 * This module uses the `nuqs` library to synchronize filter state (such as selected catalogs,
 * datasets, and date ranges) with the URL query parameters. This ensures that the filter
 * state is bookmarkable and shareable.
 *
 * The `useFilters` hook encapsulates the logic for reading, updating, and clearing filters,
 * providing a clean and reusable interface for any component that needs to interact with
 * the global filter state.
 *
 * @module
 */
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";

import type { FilterState } from "./store";
import { clearAllFilters, getActiveFilterCount, hasActiveFilters, removeFilter } from "./store";

// Re-export FilterState for external use
export type { FilterState };

// Custom parsers for nuqs
const parseAsStringOrNull = parseAsString.withDefault("");
const parseAsArrayOfStrings = parseAsArrayOf(parseAsString).withDefault([]);

// Custom hook for managing all filter state via URL
export const useFilters = () => {
  // URL state management with nuqs
  const [catalog, setCatalog] = useQueryState("catalog", parseAsStringOrNull);
  const [datasets, setDatasets] = useQueryState("datasets", parseAsArrayOfStrings);
  const [startDate, setStartDate] = useQueryState("startDate", parseAsStringOrNull);
  const [endDate, setEndDate] = useQueryState("endDate", parseAsStringOrNull);

  // Create filter state object
  const filters: FilterState = useMemo(
    () => ({
      catalog: catalog || null,
      datasets,
      startDate: startDate || null,
      endDate: endDate || null,
    }),
    [catalog, datasets, startDate, endDate]
  );

  // Enhanced setCatalog that also clears datasets when catalog changes
  const handleSetCatalog = (newCatalog: string | null) => {
    const catalogValue = newCatalog === "all" ? null : newCatalog;
    void setCatalog(catalogValue ?? "");
    // Clear datasets when catalog changes
    if (catalogValue !== catalog) {
      void setDatasets([]);
    }
  };

  // Helper function to remove a specific filter
  const handleRemoveFilter = (filterType: keyof FilterState, value?: string) => {
    const newFilters = removeFilter(filters, filterType, value);

    // Update URL state
    void setCatalog(newFilters.catalog ?? "");
    void setDatasets(newFilters.datasets);
    void setStartDate(newFilters.startDate ?? "");
    void setEndDate(newFilters.endDate ?? "");
  };

  // Helper function to clear all filters
  const handleClearAllFilters = () => {
    const newFilters = clearAllFilters();

    // Update URL state
    void setCatalog(newFilters.catalog ?? "");
    void setDatasets(newFilters.datasets);
    void setStartDate(newFilters.startDate ?? "");
    void setEndDate(newFilters.endDate ?? "");
  };

  // Computed values
  const activeFilterCount = useMemo(() => getActiveFilterCount(filters), [filters]);
  const hasActiveFiltersValue = useMemo(() => hasActiveFilters(filters), [filters]);

  return {
    // Filter state
    filters,

    // Individual filter setters
    setCatalog: handleSetCatalog,
    setDatasets,
    setStartDate: (value: string | null) => void setStartDate(value ?? ""),
    setEndDate: (value: string | null) => void setEndDate(value ?? ""),

    // Helper functions
    removeFilter: handleRemoveFilter,
    clearAllFilters: handleClearAllFilters,

    // Computed values
    activeFilterCount,
    hasActiveFilters: hasActiveFiltersValue,
  };
};
