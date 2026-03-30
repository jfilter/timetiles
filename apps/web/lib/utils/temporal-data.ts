/**
 * Utility to determine whether temporal UI should be shown based on visible datasets.
 *
 * @module
 * @category Utils
 */
import type { DataSourceDataset } from "@/lib/types/data-sources";
import type { FilterState } from "@/lib/types/filter-state";

/**
 * Determine whether any visible dataset has temporal data.
 *
 * Returns `true` (show temporal UI) if:
 * - Data is still loading (datasets is undefined)
 * - No datasets exist yet
 * - At least one visible dataset has `hasTemporalData: true`
 */
export const hasVisibleTemporalData = (
  datasets: DataSourceDataset[] | undefined,
  filters: Pick<FilterState, "datasets">
): boolean => {
  if (!datasets || datasets.length === 0) return true;

  let visible = datasets;

  if (filters.datasets.length > 0) {
    const ids = new Set(filters.datasets.map(Number));
    visible = datasets.filter((d) => ids.has(d.id));
  }

  return visible.length === 0 || visible.some((d) => d.hasTemporalData);
};
