/**
 * Time-based histogram chart component for visualizing temporal data distribution.
 *
 * This is a pure presentation component that renders a bar chart showing
 * event counts over time. It accepts pre-calculated histogram data from
 * the server and handles theming, loading states, and click interactions.
 *
 * @module
 * @category Components
 */
"use client";

import type { EChartsOption } from "echarts";
import { useCallback, useMemo } from "react";

import { cartographicColors } from "../../lib/chart-themes";
import { BaseChart } from "./base-chart";
import type { ChartTheme, EChartsEventParams } from "./types";

export interface TimeHistogramDataItem {
  date: string | Date | number;
  count: number;
}

export interface TimeHistogramProps {
  /** Histogram data items with date and count */
  data?: TimeHistogramDataItem[];
  /** Callback when a bar is clicked, receives the date */
  onBarClick?: (date: Date) => void;
  /** Chart theme configuration */
  theme?: ChartTheme;
  /** Height of the chart */
  height?: number | string;
  /** Additional CSS classes */
  className?: string;
  /** Show full loading overlay (for initial load) */
  isInitialLoad?: boolean;
  /** Show corner spinner badge (for updates) */
  isUpdating?: boolean;
  /** Custom loading message */
  loadingMessage?: string;
  /** Custom empty message */
  emptyMessage?: string;
}

/**
 * Pure presentation component for rendering time-based histograms.
 *
 * @example
 * ```tsx
 * <TimeHistogram
 *   data={[{ date: '2024-01-01', count: 10 }, { date: '2024-01-02', count: 15 }]}
 *   onBarClick={(date) => console.log('Clicked:', date)}
 *   theme={chartTheme}
 *   isUpdating={isLoading}
 * />
 * ```
 */
const defaultData: TimeHistogramDataItem[] = [];

export const TimeHistogram = ({
  data = defaultData,
  onBarClick,
  theme,
  height = 200,
  className,
  isInitialLoad = false,
  isUpdating = false,
  emptyMessage = "No data available",
}: TimeHistogramProps) => {
  // Determine if dark theme based on theme prop
  const isDark = useMemo(() => {
    if (!theme) return false;
    // Check if the theme has dark colors
    return theme.backgroundColor === "#1f2937" || theme.textColor === "#e5e7eb";
  }, [theme]);

  // Helper functions for chart configuration
  const getAxisConfig = useCallback(
    (isDark: boolean) => ({
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
    }),
    []
  );

  const getTooltipConfig = useCallback(
    (isDark: boolean) => ({
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
    }),
    []
  );

  const getSeriesConfig = useCallback(
    (_isDark: boolean, histogramData: TimeHistogramDataItem[]) => [
      {
        type: "bar",
        data: histogramData.map((item) => [item.date, item.count]),
        itemStyle: {
          color: cartographicColors.blue,
          borderRadius: [2, 2, 0, 0],
        },
        emphasis: {
          itemStyle: {
            color: cartographicColors.navy,
          },
        },
      },
    ],
    []
  );

  // Create ECharts option for the histogram
  const chartOption = useMemo(() => {
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
      series: getSeriesConfig(isDark, data),
      animation: true,
      animationDuration: 300,
    };
  }, [isDark, data, getAxisConfig, getTooltipConfig, getSeriesConfig]);

  const handleChartClick = useCallback(
    (params: EChartsEventParams) => {
      if (
        onBarClick &&
        params.data != null &&
        Array.isArray(params.data) &&
        params.data.length >= 2 &&
        typeof params.data[0] === "number"
      ) {
        const date = new Date(params.data[0]);
        onBarClick(date);
      }
    },
    [onBarClick]
  );

  const chartEvents = useMemo(() => ({ click: handleChartClick }), [handleChartClick]);

  // Handle empty state
  const containerHeight = useMemo(() => (typeof height === "number" ? `${height}px` : height), [height]);
  const emptyStateStyle = useMemo(
    () => ({ height: containerHeight, display: "flex", alignItems: "center", justifyContent: "center" }),
    [containerHeight]
  );
  const emptyTextStyle = useMemo(
    () => ({ color: theme?.textColor ?? "#6b7280", fontSize: "14px" }),
    [theme?.textColor]
  );

  if (data.length === 0 && !isInitialLoad && !isUpdating) {
    return (
      <div className={className} style={emptyStateStyle}>
        <div style={emptyTextStyle}>{emptyMessage}</div>
      </div>
    );
  }

  return (
    <BaseChart
      height={height}
      className={className}
      isInitialLoad={isInitialLoad}
      isUpdating={isUpdating}
      theme={theme}
      config={chartOption as unknown as Partial<EChartsOption>}
      onEvents={chartEvents}
    />
  );
};
