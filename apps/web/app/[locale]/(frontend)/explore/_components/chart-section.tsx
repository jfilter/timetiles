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

import { Button } from "@timetiles/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@timetiles/ui/components/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@timetiles/ui/components/select";
import { cn } from "@timetiles/ui/lib/utils";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";

import { AggregationBarChart } from "@/components/charts/aggregation-bar-chart";
import { BeeswarmSettingsButton, EventBeeswarm, useGroupByOptions } from "@/components/charts/event-beeswarm";
import { EventHistogram } from "@/components/charts/event-histogram";
import { TimeRangeSlider } from "@/components/filters/time-range-slider";
import { useFilters } from "@/lib/hooks/use-filters";
import { formatMonthYear, parseISODate } from "@/lib/utils/date";
import type { SimpleBounds } from "@/lib/utils/event-params";

import { type ChartMeta, type ChartType, VisualizationPanel } from "./visualization-panel";

interface ChartSectionProps {
  bounds?: SimpleBounds | null;
  /** When true, the chart will fill available height instead of using fixed heights */
  fillHeight?: boolean;
  /** Whether visible datasets have temporal data. When false, histogram is excluded. */
  hasTemporalData?: boolean;
  /** Callback to open an event detail (for beeswarm point clicks) */
  onEventClick?: (eventId: number) => void;
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
      case "beeswarm":
        return { label: t("eventAnalysis"), heading: t("eventScatter"), subtitle: t("individualEvents") };
    }
  };
};

/**
 * Get appropriate height for each chart type (used when fillHeight is false).
 */
const getChartHeight = (type: ChartType): number => {
  switch (type) {
    case "histogram":
    case "beeswarm":
      return 200;
    case "dataset-bar":
    case "catalog-bar":
      return 300;
  }
};

/** Labels for chart type selector dropdown. */
const useChartTypeLabels = (): Record<ChartType, string> => {
  const t = useTranslations("Explore");
  return {
    histogram: t("timeline"),
    beeswarm: t("beeswarm"),
    ["dataset-bar"]: t("byDataset"),
    ["catalog-bar"]: t("byCatalog"),
  };
};

// oxlint-disable-next-line complexity
export const ChartSection = ({
  bounds,
  fillHeight = false,
  hasTemporalData = true,
  onEventClick,
}: Readonly<ChartSectionProps>) => {
  const t = useTranslations("Explore");
  const getChartMeta = useChartMeta();
  const chartTypeLabels = useChartTypeLabels();
  const [selectedChartType, setSelectedChartType] = useQueryState(
    "chart",
    parseAsStringEnum<ChartType>(["histogram", "beeswarm", "dataset-bar", "catalog-bar"]).withDefault("histogram")
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChartSettings, setShowChartSettings] = useState(false);
  const [groupBy, setGroupBy] = useQueryState("groupBy", parseAsString.withDefault("none"));

  // Get filter state to determine which chart types are relevant
  const { filters, setStartDate, setEndDate } = useFilters();

  // Determine which chart types should be available based on filters and data capabilities
  const availableChartTypes = useMemo<ChartType[]>(() => {
    const types: ChartType[] = [];

    // Only show histogram/beeswarm if visible datasets have temporal data
    if (hasTemporalData) {
      types.push("histogram");
      types.push("beeswarm");
    }

    // Show "By Dataset" when no datasets are selected (show all) or multiple are selected
    // Hide when exactly 1 dataset is selected (would show only 1 bar)
    if (filters.datasets.length !== 1) {
      types.push("dataset-bar");
    }

    // Show "By Catalog" when selected datasets span multiple catalogs (or none selected = all)
    types.push("catalog-bar");

    return types;
  }, [filters.datasets.length, hasTemporalData]);

  // Derive effective chart type — falls back to first available if selection becomes unavailable
  const chartType = availableChartTypes.includes(selectedChartType)
    ? selectedChartType
    : (availableChartTypes[0] ?? "histogram");

  const transitionTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleChartTypeChange = (newType: ChartType) => {
    if (newType === chartType) return;

    // Clear any pending transition from a previous rapid click
    clearTimeout(transitionTimer.current);

    // Start fade out
    setIsTransitioning(true);

    // After fade out, swap chart type
    transitionTimer.current = setTimeout(() => {
      void setSelectedChartType(newType);
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

  // Shared groupBy options for both histogram and beeswarm
  const singleDatasetId = filters.datasets.length === 1 ? String(filters.datasets[0]) : null;
  const groupByOptions = useGroupByOptions(singleDatasetId);

  const renderChart = (height: number | string, variant: "compact" | "fullscreen" = "compact") => {
    const effectiveGroupBy = variant === "fullscreen" ? groupBy : "none";
    return (
      <div className="relative h-full">
        {chartType === "histogram" && <EventHistogram bounds={bounds} height={height} groupBy={effectiveGroupBy} />}
        {chartType === "beeswarm" && (
          <EventBeeswarm
            bounds={bounds}
            height={height}
            onEventClick={onEventClick}
            variant={variant}
            showControls={showChartSettings}
            groupBy={effectiveGroupBy}
            groupByOptions={groupByOptions}
            onGroupByChange={(v) => void setGroupBy(v)}
          />
        )}
        {chartType === "dataset-bar" && <AggregationBarChart bounds={bounds} type="dataset" height={height} />}
        {chartType === "catalog-bar" && <AggregationBarChart bounds={bounds} type="catalog" height={height} />}
        {/* GroupBy picker for histogram (beeswarm has its own integrated) */}
        {variant === "fullscreen" && showChartSettings && chartType === "histogram" && (
          <div className="bg-background/95 border-border absolute top-0 right-0 z-10 rounded-md border p-3 shadow-md backdrop-blur-sm">
            <div className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wide uppercase">Group by</div>
            <select
              value={groupBy}
              onChange={(e) => void setGroupBy(e.target.value)}
              className="border-input bg-background text-foreground w-full rounded border px-2 py-1 text-xs"
            >
              {groupByOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <VisualizationPanel
        chartType={chartType}
        onChartTypeChange={handleChartTypeChange}
        chartMeta={chartMeta}
        availableChartTypes={availableChartTypes}
        fillHeight={fillHeight}
        onExpandClick={() => setIsFullscreen(true)}
        headerActions={undefined}
      >
        <div
          className={cn(
            "relative transition-all duration-300 ease-out",
            isTransitioning && "opacity-0",
            fillHeight && "h-0 flex-1"
          )}
          style={containerStyle}
        >
          {renderChart(fillHeight ? "100%" : chartHeight)}
        </div>
      </VisualizationPanel>

      <Dialog open={isFullscreen} onOpenChange={(open) => !open && setIsFullscreen(false)}>
        <DialogContent
          className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-none flex-col overflow-hidden"
          showCloseButton={false}
        >
          <DialogHeader className="flex flex-row items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle>{chartMeta.heading}</DialogTitle>
              <DialogDescription>{chartMeta.subtitle}</DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {availableChartTypes.length > 1 && (
                <Select value={chartType} onValueChange={(v) => handleChartTypeChange(v as ChartType)}>
                  <SelectTrigger
                    aria-label={t("timeline")}
                    className="border-primary/20 bg-background w-auto min-w-[140px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableChartTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {chartTypeLabels[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(chartType === "beeswarm" || chartType === "histogram") && (
                <BeeswarmSettingsButton
                  showControls={showChartSettings}
                  onToggle={() => setShowChartSettings((v) => !v)}
                />
              )}
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>
          <div className="h-0 flex-1">{renderChart("100%", "fullscreen")}</div>
          {chartType === "histogram" && (filters.startDate != null || filters.endDate != null) && (
            <div className="flex items-center justify-between px-6 pt-1 pb-0">
              <span className="text-muted-foreground font-mono text-xs">
                {filters.startDate ? formatMonthYear(parseISODate(filters.startDate)) : ""}
              </span>
              <span className="text-muted-foreground font-mono text-xs">
                {filters.endDate ? formatMonthYear(parseISODate(filters.endDate)) : ""}
              </span>
            </div>
          )}
          {chartType === "histogram" && (
            <div className="border-t px-6 pt-4 pb-2">
              <TimeRangeSlider
                filters={filters}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
                bounds={bounds}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
