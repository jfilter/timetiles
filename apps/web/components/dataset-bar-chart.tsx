/**
 * Bar chart visualization for dataset and catalog event counts.
 *
 * Displays event distribution across datasets or catalogs as an interactive
 * bar chart. Supports click-to-filter functionality and theme-aware styling.
 * Automatically updates based on current filter state.
 *
 * @module
 * @category Components
 */
"use client";

import { BarChart, type BarChartDataItem } from "@workspace/ui/components/charts";
import { defaultDarkTheme, defaultLightTheme } from "@workspace/ui/components/charts";
import { useTheme } from "next-themes";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { useCallback } from "react";

import { useEventsByCatalog, useEventsByDataset } from "@/lib/hooks/use-event-stats";

import type { Catalog, Dataset, Event } from "../payload-types";

interface DatasetBarChartProps {
  events: Event[];
  datasets: Dataset[];
  catalogs: Catalog[];
  groupBy?: "dataset" | "catalog";
  isInitialLoad?: boolean;
  isUpdating?: boolean;
  height?: number | string;
  className?: string;
}

export const DatasetBarChart = ({
  events,
  datasets,
  catalogs,
  groupBy = "dataset",
  isInitialLoad = false,
  isUpdating = false,
  height = 300,
  className,
}: Readonly<DatasetBarChartProps>) => {
  const { theme } = useTheme();
  const [, setSelectedDatasets] = useQueryState("datasets", parseAsArrayOf(parseAsString).withDefault([]));
  const [, setSelectedCatalog] = useQueryState("catalog");

  const datasetData = useEventsByDataset(events, datasets);
  const catalogData = useEventsByCatalog(events, catalogs);

  const chartData = groupBy === "dataset" ? datasetData : catalogData;

  const handleBarClick = useCallback(
    (item: BarChartDataItem) => {
      if (groupBy === "dataset") {
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
      } else {
        // Set catalog filter
        const metadata = item.metadata as { catalogId: string } | undefined;
        const catalogId = metadata?.catalogId;
        if (catalogId != null) {
          void setSelectedCatalog(catalogId);
        }
      }
    },
    [groupBy, setSelectedDatasets, setSelectedCatalog]
  );

  const valueFormatter = useCallback((value: number) => value.toLocaleString(), []);

  // Generate colors based on theme
  const getBarColor = (index: number) => {
    const lightColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];
    const darkColors = ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#2dd4bf"];
    const colors = theme === "dark" ? darkColors : lightColors;
    return colors[index % colors.length];
  };

  const dataWithColors = chartData.map((item, index) => ({
    ...item,
    color: getBarColor(index),
  }));

  return (
    <BarChart
      data={dataWithColors}
      orientation={chartData.length > 8 ? "horizontal" : "vertical"}
      height={height}
      className={className}
      isInitialLoad={isInitialLoad}
      isUpdating={isUpdating}
      theme={theme === "dark" ? defaultDarkTheme : defaultLightTheme}
      onBarClick={handleBarClick}
      xLabel=""
      yLabel="Number of Events"
      showValues
      valueFormatter={valueFormatter}
      maxLabelLength={30}
      sortBy="value"
      sortOrder="desc"
    />
  );
};
