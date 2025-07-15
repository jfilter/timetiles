"use client";

import { useTheme } from "next-themes";
import { BarChart, type BarChartDataItem } from "@workspace/ui/components/charts";
import { defaultLightTheme, defaultDarkTheme } from "@workspace/ui/components/charts";
import type { Event, Dataset, Catalog } from "../payload-types";
import { useEventsByDataset, useEventsByCatalog } from "../hooks/useEventStats";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";

interface DatasetBarChartProps {
  events: Event[];
  datasets: Dataset[];
  catalogs: Catalog[];
  groupBy?: "dataset" | "catalog";
  loading?: boolean;
  height?: number | string;
  className?: string;
}

export function DatasetBarChart({ 
  events, 
  datasets,
  catalogs,
  groupBy = "dataset",
  loading = false,
  height = 300,
  className 
}: DatasetBarChartProps) {
  const { theme } = useTheme();
  const [, setSelectedDatasets] = useQueryState(
    "datasets",
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const [, setSelectedCatalog] = useQueryState("catalog");

  const datasetData = useEventsByDataset(events, datasets);
  const catalogData = useEventsByCatalog(events, catalogs);

  const chartData = groupBy === "dataset" ? datasetData : catalogData;

  const handleBarClick = (item: BarChartDataItem) => {
    if (groupBy === "dataset") {
      // Toggle dataset selection
      setSelectedDatasets((current) => {
        const datasetId = item.metadata?.datasetId;
        if (!datasetId) return current;
        
        if (current.includes(datasetId)) {
          return current.filter(id => id !== datasetId);
        } else {
          return [...current, datasetId];
        }
      });
    } else {
      // Set catalog filter
      const catalogId = item.metadata?.catalogId;
      if (catalogId) {
        setSelectedCatalog(catalogId);
      }
    }
  };

  // Generate colors based on theme
  const getBarColor = (index: number) => {
    const lightColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];
    const darkColors = ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#2dd4bf"];
    const colors = theme === "dark" ? darkColors : lightColors;
    return colors[index % colors.length];
  };

  const dataWithColors = chartData.map((item, index) => ({
    ...item,
    color: getBarColor(index)
  }));

  return (
    <BarChart
      data={dataWithColors}
      orientation={chartData.length > 8 ? "horizontal" : "vertical"}
      height={height}
      className={className}
      loading={loading}
      theme={theme === "dark" ? defaultDarkTheme : defaultLightTheme}
      onBarClick={handleBarClick}
      xLabel={groupBy === "dataset" ? "" : ""}
      yLabel="Number of Events"
      showValues={true}
      valueFormatter={(value) => value.toLocaleString()}
      maxLabelLength={30}
      sortBy="value"
      sortOrder="desc"
    />
  );
}