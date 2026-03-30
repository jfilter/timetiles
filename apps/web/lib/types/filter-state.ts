/**
 * FilterState type and pure helper functions for filter operations.
 *
 * These are used with nuqs (URL query parameter synchronization) and
 * are intentionally separated from the Zustand UI store.
 *
 * @module
 * @category Types
 */

export interface FilterState {
  datasets: string[];
  startDate: string | null;
  endDate: string | null;
  fieldFilters: Record<string, string[]>;
}

export const getActiveFilterCount = (filters: FilterState): number => {
  let count = 0;
  if (filters.datasets.length > 0) count += filters.datasets.length;
  if ((filters.startDate != null && filters.startDate !== "") || (filters.endDate != null && filters.endDate !== ""))
    count++; // Date range counts as one filter
  // Count total selected field filter values
  if (filters.fieldFilters) {
    count += Object.values(filters.fieldFilters).reduce((sum, vals) => sum + vals.length, 0);
  }
  return count;
};

export const hasActiveFilters = (filters: FilterState): boolean => {
  const hasFieldFilters = filters.fieldFilters && Object.values(filters.fieldFilters).some((vals) => vals.length > 0);
  return !!(
    filters.datasets.length > 0 ||
    (filters.startDate != null && filters.startDate !== "") ||
    (filters.endDate != null && filters.endDate !== "") ||
    hasFieldFilters
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
  const newFilters = { ...filters, fieldFilters: { ...filters.fieldFilters } };

  switch (filterType) {
    case "datasets":
      newFilters.datasets = value != null && value !== "" ? newFilters.datasets.filter((id) => id !== value) : [];
      newFilters.fieldFilters = {};
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
  }

  return newFilters;
};

export const clearAllFilters = (): FilterState => ({ datasets: [], startDate: null, endDate: null, fieldFilters: {} });

/**
 * Derive a stable string key from the current filter state.
 *
 * Used to detect filter changes without deep-comparing objects.
 * Automatically includes every {@link FilterState} field so that
 * adding a new field cannot be silently forgotten.
 */
export const serializeFilterKey = (filters: FilterState): string =>
  JSON.stringify(filters, (_, value: unknown) => {
    // Sort object keys so the output is deterministic regardless of insertion order
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      );
    }
    return value;
  });
