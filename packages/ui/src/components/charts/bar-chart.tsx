/**
 * Horizontal bar chart for dataset/category distribution.
 *
 * Renders sorted horizontal bars with compact number formatting,
 * dynamic height scaling, and smooth ECharts animations.
 *
 * @module
 * @category Components
 */
"use client";

import type { EChartsOption } from "echarts";

import { defaultLightTheme } from "../../lib/chart-themes";
import { BaseChart } from "./base-chart";
import { ChartEmptyState } from "./chart-empty-state";
import type { BarChartDataItem, ChartTheme } from "./types";

// Helper to check if click params are valid
const isValidClickParams = (params: unknown): params is { dataIndex?: number; componentType?: string } =>
  typeof params === "object" && params !== null && "dataIndex" in params;

/** Format large numbers compactly: 511872 → "511.9k", 47000 → "47.0k", 731 → "731" */
const formatCompact = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
};

/** Minimum height per bar row in pixels */
const BAR_ROW_HEIGHT = 28;
/** Minimum total chart height */
const MIN_CHART_HEIGHT = 120;
/** Maximum total chart height */
const MAX_CHART_HEIGHT = 600;

export interface BarChartProps {
  /** Chart data */
  data: BarChartDataItem[];
  /** Chart height — auto-calculated from data count if not provided */
  height?: number | string;
  /** Additional CSS classes */
  className?: string;
  /** Chart theme */
  theme?: ChartTheme;
  /** Show loading overlay */
  isInitialLoad?: boolean;
  /** Show updating indicator */
  isUpdating?: boolean;
  /** Whether the data fetch encountered an error */
  isError?: boolean;
  /** Callback to retry the failed fetch */
  onRetry?: () => void;
  /** Click handler for bar clicks */
  onBarClick?: (item: BarChartDataItem, index: number) => void;
}

/**
 * Horizontal bar chart with auto-sizing and compact formatting.
 *
 * Key features:
 * - Sorted by value (largest first)
 * - Dynamic height based on data count
 * - Compact number labels (1.5k, 2.3M)
 * - Smooth value-update animations
 */
export const BarChart = ({
  data,
  height,
  className,
  theme,
  isInitialLoad,
  isUpdating,
  isError = false,
  onRetry,
  onBarClick,
}: BarChartProps) => {
  // Sort descending by value
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const labels = sorted.map((item) => item.label);
  const values = sorted.map((item) => item.value);

  // Auto-calculate height from data count
  const autoHeight = Math.min(MAX_CHART_HEIGHT, Math.max(MIN_CHART_HEIGHT, sorted.length * BAR_ROW_HEIGHT + 40));
  const effectiveHeight = height ?? autoHeight;

  // Truncate long y-axis labels
  const maxLabelLength = sorted.length > 10 ? 16 : 22;
  const truncatedLabels = labels.map((l) => (l.length > maxLabelLength ? l.slice(0, maxLabelLength - 1) + "…" : l));

  const chartOption: EChartsOption = {
    animation: true,
    animationDuration: 300,
    animationDurationUpdate: 300,
    animationEasing: "cubicOut",
    animationEasingUpdate: "cubicOut",

    grid: { left: 8, right: 48, bottom: 4, top: 4, containLabel: true },

    xAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => formatCompact(value), fontSize: 10, hideOverlap: true },
      splitNumber: 3,
      splitLine: { lineStyle: { opacity: 0.3 } },
    },
    yAxis: {
      type: "category",
      data: truncatedLabels,
      inverse: true,
      axisLabel: { fontSize: 11, width: 120, overflow: "truncate" },
    },

    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const p = params[0] as { dataIndex?: number; value?: number };
        const idx = p.dataIndex ?? 0;
        const name = labels[idx] ?? "";
        const val = p.value ?? 0;
        return `<strong>${name}</strong><br/>${val.toLocaleString()}`;
      },
    },

    series: [
      {
        type: "bar",
        data: values.map((value, index) => ({
          value,
          name: labels[index],
          itemStyle: {
            color: Array.isArray(theme?.itemColor)
              ? theme.itemColor[0]
              : (theme?.itemColor ?? (defaultLightTheme.itemColor as string)),
          },
        })),
        universalTransition: true,
        animationDuration: 300,
        animationDurationUpdate: 300,
        barMaxWidth: 20,
        label: {
          show: true,
          position: "right",
          fontSize: 10,
          formatter: (params: unknown) => {
            if (typeof params === "object" && params !== null && "value" in params) {
              const value = (params as { value?: unknown }).value;
              if (typeof value === "number") return formatCompact(value);
            }
            return "";
          },
        },
      },
    ],
  };

  // Map click indices back through sort order
  const onEventsHandler = onBarClick
    ? {
        click: (params: unknown) => {
          if (!isValidClickParams(params)) return;
          const dataIndex = params.dataIndex;
          if (typeof dataIndex !== "number" || dataIndex < 0 || dataIndex >= sorted.length) return;
          const item = sorted[dataIndex];
          if (item) {
            // Find original index in unsorted data
            const originalIndex = data.findIndex((d) => d.label === item.label);
            onBarClick(item, originalIndex >= 0 ? originalIndex : dataIndex);
          }
        },
      }
    : undefined;

  if (isError && !isInitialLoad) {
    return <ChartEmptyState variant="error" height={effectiveHeight} className={className} onRetry={onRetry} />;
  }

  if (data.length === 0 && !isInitialLoad && !isUpdating) {
    return <ChartEmptyState variant="no-match" height={effectiveHeight} className={className} />;
  }

  return (
    <BaseChart
      height={effectiveHeight}
      className={className}
      theme={theme}
      isInitialLoad={isInitialLoad}
      isUpdating={isUpdating}
      config={chartOption}
      onEvents={onEventsHandler}
      skeletonVariant="bar"
    />
  );
};
