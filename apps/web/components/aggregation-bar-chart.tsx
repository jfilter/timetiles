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
import { memo, useCallback, useMemo } from "react";

import { useFilters } from "@/lib/filters";
import { useChartQuery } from "@/lib/hooks/use-chart-query";
import { useEventsAggregationQuery } from "@/lib/hooks/use-events-queries";

import type { BaseChartProps } from "./shared/chart-types";

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

  // URL state management based on type
  const [, setSelectedCatalog] = useQueryState("catalog");
  const [, setSelectedDatasets] = useQueryState("datasets", parseAsArrayOf(parseAsString).withDefault([]));

  // Transform API data to chart format
  const chartData: BarChartDataItem[] = useMemo(() => {
    if (!data?.items) return [];

    return data.items.map((item) => ({
      label: item.name,
      value: item.count,
      metadata: { [`${type}Id`]: String(item.id) },
    }));
  }, [data, type]);

  // Click handler based on aggregation type
  const handleBarClick = useCallback(
    (item: BarChartDataItem) => {
      if (type === "catalog") {
        const metadata = item.metadata as { catalogId: string } | undefined;
        const catalogId = metadata?.catalogId;
        if (catalogId != null) {
          void setSelectedCatalog(catalogId);
        }
      } else {
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
