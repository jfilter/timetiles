/**
 * Utility functions for header title formatting.
 *
 * @module
 * @category Components
 */
import { formatShortDate } from "@/lib/utils/date";
import type { Catalog, Dataset } from "@/payload-types";

/**
 * Build dynamic title based on active filters.
 */
export const buildDynamicTitle = (
  filters: { catalog?: string | null; datasets: string[]; startDate?: string | null; endDate?: string | null },
  catalogs: Catalog[],
  datasets: Dataset[]
): { title: string; dateRange: string | null } => {
  // Build title based on catalog/dataset selection
  let title = "All Events";

  if (filters.catalog) {
    const catalog = catalogs.find((c) => String(c.id) === filters.catalog);
    title = catalog?.name ?? "Events";
  } else if (filters.datasets.length > 0) {
    if (filters.datasets.length === 1) {
      const dataset = datasets.find((d) => String(d.id) === filters.datasets[0]);
      title = dataset?.name ?? "Events";
    } else if (filters.datasets.length <= 2) {
      const names = filters.datasets
        .map((id) => datasets.find((d) => String(d.id) === id)?.name)
        .filter(Boolean)
        .slice(0, 2);
      title = names.join(", ");
    } else {
      title = `${filters.datasets.length} Datasets`;
    }
  }

  // Build date range string
  let dateRange: string | null = null;
  const hasStart = filters.startDate != null && filters.startDate !== "";
  const hasEnd = filters.endDate != null && filters.endDate !== "";

  if (hasStart && hasEnd) {
    dateRange = `${formatShortDate(filters.startDate!)} – ${formatShortDate(filters.endDate!)}`;
  } else if (hasStart) {
    dateRange = `From ${formatShortDate(filters.startDate!)}`;
  } else if (hasEnd) {
    dateRange = `Until ${formatShortDate(filters.endDate!)}`;
  }

  return { title, dateRange };
};
