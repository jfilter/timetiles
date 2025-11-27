/**
 * Chart visualization section with multiple chart types.
 *
 * Container component that allows switching between different chart
 * visualizations including time-based histograms and dataset bar charts.
 * Manages chart type selection with smooth fade transitions.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AggregationBarChart } from "@/components/charts/aggregation-bar-chart";
import { EventHistogram } from "@/components/charts/event-histogram";
import { useFilters } from "@/lib/filters";
import type { SimpleBounds } from "@/lib/hooks/use-events-queries";

import { type ChartMeta, type ChartType, VisualizationPanel } from "./visualization-panel";

interface ChartSectionProps {
  bounds?: SimpleBounds | null;
  /** When true, the chart will fill available height instead of using fixed heights */
  fillHeight?: boolean;
}

/**
 * Get metadata for each chart type including label, heading, and subtitle.
 */
const getChartMeta = (type: ChartType): ChartMeta => {
  switch (type) {
    case "histogram":
      return {
        label: "Temporal Analysis",
        heading: "Event Timeline",
        subtitle: "Distribution of events over time",
      };
    case "dataset-bar":
      return {
        label: "Data Distribution",
        heading: "Events by Dataset",
        subtitle: "Event counts across datasets",
      };
    case "catalog-bar":
      return {
        label: "Data Distribution",
        heading: "Events by Catalog",
        subtitle: "Event counts across catalogs",
      };
  }
};

/**
 * Get appropriate height for each chart type (used when fillHeight is false).
 */
const getChartHeight = (type: ChartType): number => {
  switch (type) {
    case "histogram":
      return 200;
    case "dataset-bar":
    case "catalog-bar":
      return 300;
  }
};

export const ChartSection = ({ bounds, fillHeight = false }: Readonly<ChartSectionProps>) => {
  const [chartType, setChartType] = useState<ChartType>("histogram");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Get filter state to determine which chart types are relevant
  const { filters } = useFilters();

  // Determine which chart types should be available based on filters
  const availableChartTypes = useMemo((): ChartType[] => {
    const types: ChartType[] = ["histogram"]; // Always available

    // Show "By Dataset" when no datasets are selected (show all) or multiple are selected
    // Hide when exactly 1 dataset is selected (would show only 1 bar)
    if (filters.datasets.length !== 1) {
      types.push("dataset-bar");
    }

    // Show "By Catalog" when no catalog is selected (show all catalogs)
    // Hide when a catalog is selected (would show only 1 bar)
    if (!filters.catalog) {
      types.push("catalog-bar");
    }

    return types;
  }, [filters.catalog, filters.datasets.length]);

  // If current chart type becomes unavailable, switch to histogram
  useEffect(() => {
    if (!availableChartTypes.includes(chartType)) {
      setChartType("histogram");
    }
  }, [availableChartTypes, chartType]);

  const handleChartTypeChange = useCallback(
    (newType: ChartType) => {
      if (newType === chartType) return;

      // Start fade out
      setIsTransitioning(true);

      // After fade out, swap chart type
      setTimeout(() => {
        setChartType(newType);
        // Small delay then fade in
        requestAnimationFrame(() => {
          setIsTransitioning(false);
        });
      }, 150); // Match CSS transition duration
    },
    [chartType]
  );

  const chartMeta = useMemo(() => getChartMeta(chartType), [chartType]);
  const chartHeight = useMemo(() => getChartHeight(chartType), [chartType]);
  const containerStyle = useMemo(
    () => (fillHeight ? undefined : { minHeight: chartHeight }),
    [chartHeight, fillHeight]
  );

  return (
    <VisualizationPanel
      chartType={chartType}
      onChartTypeChange={handleChartTypeChange}
      chartMeta={chartMeta}
      availableChartTypes={availableChartTypes}
      fillHeight={fillHeight}
    >
      <div
        className={cn(
          "relative transition-all duration-300 ease-out",
          isTransitioning && "opacity-0",
          fillHeight && "flex-1"
        )}
        style={containerStyle}
      >
        {chartType === "histogram" && <EventHistogram bounds={bounds} height={fillHeight ? "100%" : chartHeight} />}
        {chartType === "dataset-bar" && (
          <AggregationBarChart bounds={bounds} type="dataset" height={fillHeight ? "100%" : chartHeight} />
        )}
        {chartType === "catalog-bar" && (
          <AggregationBarChart bounds={bounds} type="catalog" height={fillHeight ? "100%" : chartHeight} />
        )}
      </div>
    </VisualizationPanel>
  );
};
