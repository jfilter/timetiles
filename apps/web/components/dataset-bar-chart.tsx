/**
 * Bar chart visualization for dataset event counts.
 *
 * Displays event distribution across datasets as an interactive
 * bar chart. Supports click-to-filter functionality and theme-aware styling.
 * Uses server-side aggregation for better performance.
 *
 * @module
 * @category Components
 */
"use client";

import { BarChart, type BarChartDataItem, useChartTheme } from "@workspace/ui/charts";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { memo, useCallback, useMemo } from "react";

import { useFilters } from "@/lib/filters";
import { useChartQuery } from "@/lib/hooks/use-chart-query";
import { type SimpleBounds, useEventsByDatasetQuery } from "@/lib/hooks/use-events-queries";

interface DatasetBarChartProps {
  height?: number | string;
  className?: string;
  bounds?: SimpleBounds | null;
}

/**
 * Dataset bar chart component with data fetching.
 *
 * Fetches aggregated dataset data from the API and renders it using the BarChart
 * component.
 */
const DatasetBarChartComponent = ({ height = 300, className, bounds: propBounds }: Readonly<DatasetBarChartProps>) => {
  // Get chart theme
  const chartTheme = useChartTheme();

  // Get filter state
  const { filters } = useFilters();

  // Use the bounds prop directly
  const bounds = propBounds ?? null;

  // Fetch aggregated dataset data using React Query
  const datasetQuery = useEventsByDatasetQuery(filters, bounds);

  // Add chart-specific loading states
  const { data: datasetData, isInitialLoad, isUpdating } = useChartQuery(datasetQuery);

  // URL state for dataset filters
  const [, setSelectedDatasets] = useQueryState("datasets", parseAsArrayOf(parseAsString).withDefault([]));

  // Transform API data to chart format
  const chartData: BarChartDataItem[] = useMemo(() => {
    if (!datasetData) return [];

    return datasetData.datasets.map((item) => ({
      label: item.datasetName,
      value: item.count,
      metadata: { datasetId: String(item.datasetId) },
    }));
  }, [datasetData]);

  const handleBarClick = useCallback(
    (item: BarChartDataItem) => {
      // Toggle dataset selection
      void setSelectedDatasets((current) => {
        const metadata = item.metadata as { datasetId: string } | undefined;
        const datasetId = metadata?.datasetId;
        if (datasetId == undefined || datasetId == null) return current;

        if (current.includes(datasetId)) {
          return current.filter((id) => id !== datasetId);
        } else {
          return [...current, datasetId];
        }
      });
    },
    [setSelectedDatasets]
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
export const DatasetBarChart = memo(DatasetBarChartComponent);
