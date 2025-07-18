import { useQueryState, parseAsString, parseAsArrayOf } from "nuqs";
import { useMemo } from "react";
import {
  FilterState,
  getActiveFilterCount,
  hasActiveFilters,
  removeFilter,
  clearAllFilters,
} from "./store";

// Custom parsers for nuqs
const parseAsStringOrNull = parseAsString.withDefault("");
const parseAsArrayOfStrings = parseAsArrayOf(parseAsString).withDefault([]);

// Custom hook for managing all filter state via URL
export const useFilters = () => {
  // URL state management with nuqs
  const [catalog, setCatalog] = useQueryState("catalog", parseAsStringOrNull);
  const [datasets, setDatasets] = useQueryState(
    "datasets",
    parseAsArrayOfStrings,
  );
  const [startDate, setStartDate] = useQueryState(
    "startDate",
    parseAsStringOrNull,
  );
  const [endDate, setEndDate] = useQueryState("endDate", parseAsStringOrNull);

  // Create filter state object
  const filters: FilterState = useMemo(
    () => ({
      catalog: catalog || null,
      datasets,
      startDate: startDate || null,
      endDate: endDate || null,
    }),
    [catalog, datasets, startDate, endDate],
  );

  // Enhanced setCatalog that also clears datasets when catalog changes
  const handleSetCatalog = (newCatalog: string | null) => {
    const catalogValue = newCatalog === "all" ? null : newCatalog;
    setCatalog(catalogValue || "");
    // Clear datasets when catalog changes
    if (catalogValue !== catalog) {
      setDatasets([]);
    }
  };

  // Helper function to remove a specific filter
  const handleRemoveFilter = (
    filterType: keyof FilterState,
    value?: string,
  ) => {
    const newFilters = removeFilter(filters, filterType, value);

    // Update URL state
    setCatalog(newFilters.catalog || "");
    setDatasets(newFilters.datasets);
    setStartDate(newFilters.startDate || "");
    setEndDate(newFilters.endDate || "");
  };

  // Helper function to clear all filters
  const handleClearAllFilters = () => {
    const newFilters = clearAllFilters();

    // Update URL state
    setCatalog(newFilters.catalog || "");
    setDatasets(newFilters.datasets);
    setStartDate(newFilters.startDate || "");
    setEndDate(newFilters.endDate || "");
  };

  // Computed values
  const activeFilterCount = useMemo(
    () => getActiveFilterCount(filters),
    [filters],
  );
  const hasActiveFiltersValue = useMemo(
    () => hasActiveFilters(filters),
    [filters],
  );

  return {
    // Filter state
    filters,

    // Individual filter setters
    setCatalog: handleSetCatalog,
    setDatasets,
    setStartDate: (value: string | null) => setStartDate(value || ""),
    setEndDate: (value: string | null) => setEndDate(value || ""),

    // Helper functions
    removeFilter: handleRemoveFilter,
    clearAllFilters: handleClearAllFilters,

    // Computed values
    activeFilterCount,
    hasActiveFilters: hasActiveFiltersValue,
  };
};
