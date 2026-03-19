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
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { AggregationBarChart } from "@/components/charts/aggregation-bar-chart";
import { EventHistogram } from "@/components/charts/event-histogram";
import { useFilters } from "@/lib/hooks/use-filters";
import type { SimpleBounds } from "@/lib/utils/event-params";

import { type ChartMeta, type ChartType, VisualizationPanel } from "./visualization-panel";

interface ChartSectionProps {
  bounds?: SimpleBounds | null;
  /** When true, the chart will fill available height instead of using fixed heights */
  fillHeight?: boolean;
}

/**
 * Hook to get metadata for each chart type including label, heading, and subtitle.
 */
const useChartMeta = () => {
  const t = useTranslations("Explore");

  return (type: ChartType): ChartMeta => {
    switch (type) {
      case "histogram":
        return { label: t("temporalAnalysis"), heading: t("eventTimeline"), subtitle: t("eventDistribution") };
      case "dataset-bar":
        return { label: t("dataDistribution"), heading: t("eventsByDataset"), subtitle: t("datasetCounts") };
      case "catalog-bar":
        return { label: t("dataDistribution"), heading: t("eventsByCatalog"), subtitle: t("catalogCounts") };
    }
  };
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
  const getChartMeta = useChartMeta();
  const [chartType, setChartType] = useState<ChartType>("histogram");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Get filter state to determine which chart types are relevant
  const { filters } = useFilters();

  // Determine which chart types should be available based on filters
  const availableChartTypes = useMemo<ChartType[]>(() => {
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
  }, [filters.datasets.length, filters.catalog]);

  // If current chart type becomes unavailable, switch to histogram
  useEffect(() => {
    if (!availableChartTypes.includes(chartType)) {
      setChartType("histogram");
    }
  }, [availableChartTypes, chartType]);

  const transitionTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleChartTypeChange = (newType: ChartType) => {
    if (newType === chartType) return;

    // Clear any pending transition from a previous rapid click
    clearTimeout(transitionTimer.current);

    // Start fade out
    setIsTransitioning(true);

    // After fade out, swap chart type
    transitionTimer.current = setTimeout(() => {
      setChartType(newType);
      // Small delay then fade in
      requestAnimationFrame(() => {
        setIsTransitioning(false);
      });
    }, 150); // Match CSS transition duration
  };

  useEffect(() => () => clearTimeout(transitionTimer.current), []);

  const chartMeta = getChartMeta(chartType);
  const chartHeight = getChartHeight(chartType);
  const containerStyle = fillHeight ? undefined : { minHeight: chartHeight };

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
