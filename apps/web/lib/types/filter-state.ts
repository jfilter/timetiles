/**
 * FilterState type and pure helper functions for filter operations.
 *
 * These are used with nuqs (URL query parameter synchronization) and
 * are intentionally separated from the Zustand UI store.
 *
 * @module
 * @category Types
 */

import { stableStringify } from "@/lib/utils/compare";

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
export const serializeFilterKey = (filters: FilterState): string => stableStringify(filters);
