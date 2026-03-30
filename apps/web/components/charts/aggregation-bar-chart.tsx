/**
 * Generic bar chart for event aggregations.
 *
 * Displays event distribution across catalogs or datasets as an interactive
 * bar chart. Supports click-to-filter functionality and theme-aware styling.
 * Uses server-side aggregation for better performance.
 *
 * @module
 * @category Components
 */
"use client";

import { BarChart, type BarChartDataItem, useChartTheme } from "@timetiles/ui/charts";

import { useDataSourcesQuery } from "@/lib/hooks/use-data-sources-query";
import { useEventsAggregationQuery } from "@/lib/hooks/use-events-queries";
import { useFilters } from "@/lib/hooks/use-filters";
import { useViewScope } from "@/lib/hooks/use-view-scope";

import type { BaseChartProps } from "./types";

type AggregationType = "catalog" | "dataset";

interface AggregationBarChartProps extends BaseChartProps {
  /** Type of aggregation to display */
  type: AggregationType;
}

/**
 * Generic bar chart component for catalog or dataset aggregations.
 *
 * Fetches aggregated data from the unified aggregation API and renders it
 * using the BarChart component. Handles click-to-filter based on aggregation type.
 */
const AggregationBarChartComponent = ({
  height = 300,
  className,
  bounds,
  type,
}: Readonly<AggregationBarChartProps>) => {
  const chartTheme = useChartTheme();
  const { filters, toggleCatalogDatasets, toggleDataset } = useFilters();
  const scope = useViewScope();
  const { data: dataSources } = useDataSourcesQuery();

  // Fetch aggregation data using unified endpoint (viewport-filtered)
  const { data, isInitialLoad, isUpdating, isError } = useEventsAggregationQuery(
    filters,
    bounds ?? null,
    type,
    true,
    scope
  );

  // Transform API data to chart format
  const chartData: BarChartDataItem[] = data?.items
    ? data.items.map((item) => ({ label: item.name, value: item.count }))
    : [];

  // Click handler based on aggregation type
  // Routes through useFilters() to ensure dependent filters are cleared
  const handleBarClick = (_item: BarChartDataItem, index: number) => {
    const items = data?.items;
    if (!items?.[index]) return;

    const itemId = String(items[index].id);

    if (type === "catalog") {
      // Select all datasets belonging to this catalog
      const catalogDatasetIds = (dataSources?.datasets ?? [])
        .filter((d) => d.catalogId != null && String(d.catalogId) === itemId)
        .map((d) => String(d.id));
      toggleCatalogDatasets(catalogDatasetIds);
    } else {
      toggleDataset(itemId);
    }
  };

  return (
    <BarChart
      data={chartData}
      height={height}
      className={className}
      isInitialLoad={isInitialLoad}
      isUpdating={isUpdating}
      isError={isError}
      theme={chartTheme}
      onBarClick={handleBarClick}
    />
  );
};

export const AggregationBarChart = AggregationBarChartComponent;
