/**
 * Hook to get the count of active filters for display in the header.
 *
 * Wraps the useFilters hook to provide just the active filter count,
 * used for showing the filter badge in the explore header.
 *
 * @module
 * @category Hooks
 */
import { useFilters } from "@/lib/filters";

/**
 * Returns the number of active filters.
 *
 * Counts catalog selection, dataset selections, and date range as separate filters.
 *
 * @returns Number of active filters (0 if none)
 *
 * @example
 * ```tsx
 * const filterCount = useActiveFiltersCount();
 * // filterCount = 2 if catalog and startDate are set
 * ```
 */
export const useActiveFiltersCount = (): number => {
  const { activeFilterCount } = useFilters();
  return activeFilterCount;
};
