/**
 * Simple bar chart for event aggregations.
 *
 * Displays a minimal bar chart visualization without interactivity.
 * Supports different aggregation types (catalog, dataset) via props.
 *
 * @module
 * @category Components
 */
"use client";

import { BarChart, useChartTheme } from "@workspace/ui/charts";
import { memo, useMemo } from "react";

import { useFilters } from "@/lib/filters";
import { useChartQuery } from "@/lib/hooks/use-chart-query";
import { useEventsAggregationQuery } from "@/lib/hooks/use-events-queries";

import type { BaseChartProps } from "./shared/chart-types";

type AggregationType = "catalog" | "dataset";

interface SimpleBarChartProps extends BaseChartProps {
  /** Type of aggregation to display */
  type: AggregationType;
}

/**
 * Simple bar chart component for catalog or dataset aggregations.
 *
 * Displays aggregated data without click-to-filter functionality.
 * Uses the unified aggregation API endpoint.
 */
const SimpleBarChartComponent = ({ height = 300, className, bounds, type }: Readonly<SimpleBarChartProps>) => {
  const chartTheme = useChartTheme();
  const { filters } = useFilters();

  // Fetch aggregation data using unified endpoint
  const aggregationQuery = useEventsAggregationQuery(filters, bounds ?? null, type);
  const { data, isInitialLoad, isUpdating } = useChartQuery(aggregationQuery);

  // Transform API data to chart format (no click handlers)
  const chartData = useMemo(() => {
    if (!data?.items) return [];

    return data.items.map((item) => ({
      label: item.name,
      value: item.count,
    }));
  }, [data]);

  return (
    <BarChart
      data={chartData}
      height={height}
      className={className}
      isInitialLoad={isInitialLoad}
      isUpdating={isUpdating}
      theme={chartTheme}
      // No onBarClick - simple, non-interactive chart
    />
  );
};

export const SimpleBarChart = memo(SimpleBarChartComponent);
