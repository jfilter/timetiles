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

import { BarChart, type BarChartDataItem, useChartTheme } from "@workspace/ui/charts";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";

import type { BaseChartProps } from "./types";
import { useFilters } from "@/lib/filters";
import { useChartQuery } from "@/lib/hooks/use-chart-query";
import { useEventsAggregationQuery } from "@/lib/hooks/use-events-queries";

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
  const { filters } = useFilters();

  // Fetch aggregation data using unified endpoint
  const aggregationQuery = useEventsAggregationQuery(filters, bounds ?? null, type);
  const { data, isInitialLoad, isUpdating } = useChartQuery(aggregationQuery);

  // Store latest data in ref for stable click handler
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // URL state management based on type
  const [, setSelectedCatalog] = useQueryState("catalog");
  const [, setSelectedDatasets] = useQueryState("datasets", parseAsArrayOf(parseAsString).withDefault([]));

  // Transform API data to chart format (without metadata for stable references)
  const chartData: BarChartDataItem[] = useMemo(() => {
    if (!data?.items) return [];

    return data.items.map((item) => ({
      label: item.name,
      value: item.count,
    }));
  }, [data]);

  // Click handler based on aggregation type (stable - uses ref for data access)
  const handleBarClick = useCallback(
    (_item: BarChartDataItem, index: number) => {
      // Access latest data from ref without coupling callback to data
      const items = dataRef.current?.items;
      if (!items?.[index]) return;

      const itemId = String(items[index].id);

      if (type === "catalog") {
        void setSelectedCatalog(itemId);
      } else {
        void setSelectedDatasets((current) => {
          if (current.includes(itemId)) {
            return current.filter((id) => id !== itemId);
          } else {
            return [...current, itemId];
          }
        });
      }
    },
    [type, setSelectedCatalog, setSelectedDatasets]
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

export const AggregationBarChart = memo(AggregationBarChartComponent);
