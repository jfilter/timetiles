/**
 * Interactive histogram visualization for temporal event distribution.
 *
 * Displays a time-based histogram of event data with configurable granularity
 * (day, week, month, year). Supports interactive tooltips and click-to-filter
 * functionality for exploring event patterns over time.
 *
 * @module
 * @category Components
 */
"use client";

import ReactECharts from "echarts-for-react";
import { useTheme } from "next-themes";
import { useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";

import { useFilters } from "../lib/filters";
import { type SimpleBounds, useHistogramQuery } from "../lib/hooks/use-events-queries";

interface EventHistogramProps {
  isInitialLoad?: boolean;
  isUpdating?: boolean;
  height?: number | string;
  className?: string;
  bounds?: SimpleBounds | null;
}

const CHART_STYLE = { height: "100%", width: "100%" };
const CHART_OPTS = { renderer: "svg" as const };

export const EventHistogram = ({
  isInitialLoad = false,
  isUpdating: externalIsUpdating = false,
  height = 200,
  className,
  bounds: propBounds,
}: Readonly<EventHistogramProps>) => {
  const containerStyle = useMemo(() => ({ height }), [height]);
  const { theme } = useTheme();
  const [, setStartDate] = useQueryState("startDate");
  const [, setEndDate] = useQueryState("endDate");

  // Get filter state - bounds are always provided via props (debounced from parent)
  const { filters } = useFilters();

  // Use the bounds prop directly - no fallback to store
  const bounds = propBounds ?? null;

  // Fetch histogram data using React Query
  const { data: histogramData, isLoading } = useHistogramQuery(filters, bounds);

  // Extract histogram data, with fallback for error states
  const histogram = histogramData?.histogram ?? [];
  const isUpdating = externalIsUpdating || (isLoading && !isInitialLoad);

  // Helper functions for chart configuration
  const getAxisConfig = (isDark: boolean) => ({
    xAxis: {
      type: "time",
      boundaryGap: false,
      axisLabel: {
        color: isDark ? "#9ca3af" : "#6b7280",
        fontSize: 11,
      },
      axisLine: {
        lineStyle: {
          color: isDark ? "#374151" : "#e5e7eb",
        },
      },
      splitLine: {
        show: false,
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: isDark ? "#9ca3af" : "#6b7280",
        fontSize: 11,
      },
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      splitLine: {
        lineStyle: {
          color: isDark ? "#374151" : "#f3f4f6",
          type: "dashed",
        },
      },
    },
  });

  const getTooltipConfig = (isDark: boolean) => ({
    trigger: "axis",
    backgroundColor: isDark ? "#1f2937" : "#ffffff",
    borderColor: isDark ? "#374151" : "#e5e7eb",
    textStyle: {
      color: isDark ? "#f9fafb" : "#111827",
    },
    formatter: (
      params: Array<{
        value: [number, number];
        data: [number, number];
        marker: string;
        seriesName: string;
      }>
    ) => {
      const point = params[0];
      if (!point) return "";
      const date = new Date(point.data[0]);
      const count = point.data[1];
      return `
        <div style="padding: 4px 8px;">
          <div style="font-weight: 600;">${date.toLocaleDateString()}</div>
          <div>Events: ${count}</div>
        </div>
      `;
    },
  });

  const getSeriesConfig = (isDark: boolean) => [
    {
      type: "bar",
      data: histogram.map((item) => [item.date, item.count]),
      itemStyle: {
        color: isDark ? "#60a5fa" : "#3b82f6",
        borderRadius: [2, 2, 0, 0],
      },
      emphasis: {
        itemStyle: {
          color: isDark ? "#93c5fd" : "#1d4ed8",
        },
      },
    },
  ];

  // Create ECharts option for the histogram
  const getChartOption = () => {
    const isDark = theme === "dark";
    const axisConfig = getAxisConfig(isDark);

    return {
      backgroundColor: "transparent",
      textStyle: {
        color: isDark ? "#e5e7eb" : "#374151",
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "3%",
        top: "10%",
        containLabel: true,
      },
      ...axisConfig,
      tooltip: getTooltipConfig(isDark),
      series: getSeriesConfig(isDark),
      animation: true,
      animationDuration: 300,
    };
  };

  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleChartClick = useCallback(
    (params: { data: [number, number] }) => {
      if (params.data != null) {
        const date = new Date(params.data[0]);
        const formattedDate = formatDate(date);
        void setStartDate(formattedDate);
        void setEndDate(formattedDate);
      }
    },
    [setStartDate, setEndDate]
  );

  const chartEvents = useMemo(() => ({ click: handleChartClick }), [handleChartClick]);

  // Only show full loading state on initial load
  if (isInitialLoad) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={containerStyle}>
        <div className="text-muted-foreground text-sm">Loading histogram...</div>
      </div>
    );
  }

  if (histogram.length === 0 && !isUpdating) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={containerStyle}>
        <div className="text-muted-foreground text-sm">No data available</div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={containerStyle}>
      {isUpdating && (
        <div className="absolute right-2 top-2 z-10">
          <div className="bg-background/80 flex items-center gap-2 rounded-md border px-3 py-1 text-xs backdrop-blur-sm">
            <div className="border-primary h-3 w-3 animate-spin rounded-full border-b-2" />
            <span className="text-muted-foreground">Updating...</span>
          </div>
        </div>
      )}
      <div className={`transition-opacity ${isUpdating ? "opacity-90" : "opacity-100"}`} style={containerStyle}>
        <ReactECharts option={getChartOption()} style={CHART_STYLE} onEvents={chartEvents} opts={CHART_OPTS} />
      </div>
    </div>
  );
};
