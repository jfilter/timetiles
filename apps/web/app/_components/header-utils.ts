/**
 * Utility functions for header title formatting.
 *
 * @module
 * @category Components
 */
import type { Catalog, Dataset } from "@/payload-types";

/**
 * Build dynamic title based on active filters.
 */
export const buildDynamicTitle = (
  filters: { datasets: string[] },
  _catalogs: Catalog[],
  datasets: Dataset[],
  t: (key: "allEvents" | "eventsLabel" | "countDatasets", values?: Record<string, string | number>) => string
): { title: string } => {
  let title = t("allEvents");

  if (filters.datasets.length > 0) {
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

  return { title };
};
