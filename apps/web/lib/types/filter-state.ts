/**
 * FilterState type and pure helper functions for filter operations.
 *
 * These are used with nuqs (URL query parameter synchronization) and
 * are intentionally separated from the Zustand UI store.
 *
 * @module
 * @category Types
 */

import { compareCodeUnits } from "@/lib/utils/compare";

export interface FilterState {
  datasets: string[];
  startDate: string | null;
  endDate: string | null;
  fieldFilters: Record<string, string[]>;
  /** Numeric range filters keyed by field path (min/max, either end open). */
  rangeFilters: Record<string, { min: number | null; max: number | null }>;
}

/**
 * Count clearable filters (excludes datasets — those are selection, not filters).
 */
export const getActiveFilterCount = (filters: FilterState): number => {
  let count = 0;
  if ((filters.startDate != null && filters.startDate !== "") || (filters.endDate != null && filters.endDate !== ""))
    count++; // Date range counts as one filter
  if (filters.fieldFilters) {
    count += Object.values(filters.fieldFilters).reduce((sum, vals) => sum + vals.length, 0);
  }
  count += Object.values(filters.rangeFilters ?? {}).filter((r) => r.min != null || r.max != null).length;
  return count;
};

/**
 * Whether any clearable filters are active (excludes datasets).
 */
export const hasActiveFilters = (filters: FilterState): boolean => {
  const hasFieldFilters = filters.fieldFilters && Object.values(filters.fieldFilters).some((vals) => vals.length > 0);
  const hasRangeFilters = Object.values(filters.rangeFilters ?? {}).some((r) => r.min != null || r.max != null);
  return !!(
    (filters.startDate != null && filters.startDate !== "") ||
    (filters.endDate != null && filters.endDate !== "") ||
    hasFieldFilters ||
    hasRangeFilters
  );
};

// Helper function to remove a specific field filter value
const removeFieldFilterValue = (fieldFilters: Record<string, string[]>, value: string): Record<string, string[]> => {
  const result = { ...fieldFilters };

  if (!value.includes(":")) {
    delete result[value];
    return result;
  }

  const [fieldPath, filterValue] = value.split(":");
  if (!fieldPath || !result[fieldPath]) return result;

  result[fieldPath] = result[fieldPath].filter((v) => v !== filterValue);
  if (result[fieldPath].length === 0) {
    delete result[fieldPath];
  }
  return result;
};

export const removeFilter = (filters: FilterState, filterType: keyof FilterState, value?: string): FilterState => {
  const newFilters = {
    ...filters,
    fieldFilters: { ...filters.fieldFilters },
    rangeFilters: { ...filters.rangeFilters },
  };

  switch (filterType) {
    case "datasets":
      newFilters.datasets = value != null && value !== "" ? newFilters.datasets.filter((id) => id !== value) : [];
      newFilters.fieldFilters = {};
      // Range filters are single-dataset and number-format specific; clear them
      // whenever the dataset selection changes, mirroring fieldFilters.
      newFilters.rangeFilters = {};
      break;
    case "startDate":
      newFilters.startDate = null;
      break;
    case "endDate":
      newFilters.endDate = null;
      break;
    case "fieldFilters":
      newFilters.fieldFilters =
        value != null && value !== "" ? removeFieldFilterValue(newFilters.fieldFilters, value) : {};
      break;
    case "rangeFilters":
      if (value != null && value !== "") {
        delete newFilters.rangeFilters[value];
      } else {
        newFilters.rangeFilters = {};
      }
      break;
  }

  return newFilters;
};

/**
 * Clear all filters except dataset selection (datasets are a data scope, not a filter).
 */
export const clearAllFilters = (filters: FilterState): FilterState => ({
  datasets: filters.datasets,
  startDate: null,
  endDate: null,
  fieldFilters: {},
  rangeFilters: {},
});

/**
 * Derive a stable string key from the current filter state.
 *
 * Used to detect filter changes without deep-comparing objects.
 * Automatically includes every {@link FilterState} field so that
 * adding a new field cannot be silently forgotten.
 */
export const serializeFilterKey = (filters: FilterState): string =>
  JSON.stringify(filters, (_, value: unknown) => {
    // Sort object keys so the output is deterministic regardless of insertion
    // order. Use UTF-16 code-unit order, NOT localeCompare, so the key is the
    // same regardless of runtime locale/ICU.
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) => compareCodeUnits(a, b))
      );
    }
    return value;
  });
