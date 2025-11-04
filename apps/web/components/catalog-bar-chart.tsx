/**
 * Bar chart visualization for catalog event counts.
 *
 * Displays event distribution across catalogs as an interactive
 * bar chart. Supports click-to-filter functionality and theme-aware styling.
 * Uses server-side aggregation for better performance.
 *
 * @module
 * @category Components
 */
"use client";

import { BarChart, type BarChartDataItem, useChartTheme } from "@workspace/ui/charts";
import { useQueryState } from "nuqs";
import { memo, useCallback, useMemo } from "react";

import { useFilters } from "@/lib/filters";
import { useChartQuery } from "@/lib/hooks/use-chart-query";
import { type SimpleBounds, useEventsByCatalogQuery } from "@/lib/hooks/use-events-queries";

interface CatalogBarChartProps {
  height?: number | string;
  className?: string;
  bounds?: SimpleBounds | null;
}

/**
 * Catalog bar chart component with data fetching.
 *
 * Fetches aggregated catalog data from the API and renders it using the BarChart
 * component.
 */
const CatalogBarChartComponent = ({ height = 300, className, bounds: propBounds }: Readonly<CatalogBarChartProps>) => {
  // Get chart theme
  const chartTheme = useChartTheme();

  // Get filter state
  const { filters } = useFilters();

  // Use the bounds prop directly
  const bounds = propBounds ?? null;

  // Fetch aggregated catalog data using React Query
  const catalogQuery = useEventsByCatalogQuery(filters, bounds);

  // Add chart-specific loading states
  const { data: catalogData, isInitialLoad, isUpdating } = useChartQuery(catalogQuery);

  // URL state for catalog filter
  const [, setSelectedCatalog] = useQueryState("catalog");

  // Transform API data to chart format
  const chartData: BarChartDataItem[] = useMemo(() => {
    if (!catalogData) return [];

    return catalogData.catalogs.map((item) => ({
      label: item.catalogName,
      value: item.count,
      metadata: { catalogId: String(item.catalogId) },
    }));
  }, [catalogData]);

  const handleBarClick = useCallback(
    (item: BarChartDataItem) => {
      // Set catalog filter
      const metadata = item.metadata as { catalogId: string } | undefined;
      const catalogId = metadata?.catalogId;
      if (catalogId != null) {
        void setSelectedCatalog(catalogId);
      }
    },
    [setSelectedCatalog]
  );

  return (
    <BarChart
      data={chartData}
      height={height}
      className={className}
      isInitialLoad={isInitialLoad}
      isUpdating={isUpdating}
      theme={chartTheme}
      onBarClick={handleBarClick}
    />
  );
};

// Wrap in memo to prevent re-renders when props haven't changed
export const CatalogBarChart = memo(CatalogBarChartComponent);
