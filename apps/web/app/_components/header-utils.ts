/**
 * Utility functions for header title formatting.
 *
 * @module
 * @category Components
 */
import { formatMonthYear } from "@/lib/utils/date";
import type { Catalog, Dataset } from "@/payload-types";

/**
 * Build dynamic title based on active filters.
 */
export const buildDynamicTitle = (
  filters: { catalog?: string | null; datasets: string[]; startDate?: string | null; endDate?: string | null },
  catalogs: Catalog[],
  datasets: Dataset[],
  t: (
    key: "allEvents" | "eventsLabel" | "countDatasets" | "dateRangeFrom" | "dateRangeUntil",
    values?: Record<string, string | number>
  ) => string
): { title: string; dateRange: string | null } => {
  // Build title based on catalog/dataset selection
  let title = t("allEvents");

  if (filters.catalog) {
    const catalog = catalogs.find((c) => String(c.id) === filters.catalog);
    title = catalog?.name ?? t("eventsLabel");
  } else if (filters.datasets.length > 0) {
    if (filters.datasets.length === 1) {
      const dataset = datasets.find((d) => String(d.id) === filters.datasets[0]);
      title = dataset?.name ?? t("eventsLabel");
    } else if (filters.datasets.length <= 2) {
      const names = filters.datasets
        .map((id) => datasets.find((d) => String(d.id) === id)?.name)
        .filter(Boolean)
        .slice(0, 2);
      title = names.join(", ");
    } else {
      title = t("countDatasets", { count: filters.datasets.length });
    }
  }

  // Build date range string
  let dateRange: string | null = null;
  const hasStart = filters.startDate != null && filters.startDate !== "";
  const hasEnd = filters.endDate != null && filters.endDate !== "";

  if (hasStart && hasEnd) {
    dateRange = `${formatMonthYear(filters.startDate!)} – ${formatMonthYear(filters.endDate!)}`;
  } else if (hasStart) {
    dateRange = t("dateRangeFrom", { date: formatMonthYear(filters.startDate!) });
  } else if (hasEnd) {
    dateRange = t("dateRangeUntil", { date: formatMonthYear(filters.endDate!) });
  }

  return { title, dateRange };
};
