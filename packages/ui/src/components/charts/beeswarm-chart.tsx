/**
 * Beeswarm scatter chart for visualizing individual events on a timeline.
 *
 * Each point represents one event, positioned by timestamp on the X-axis.
 * Points within the same time bucket are vertically spread (jittered) to
 * avoid overlap, creating a beeswarm pattern that reveals density.
 *
 * @module
 * @category Components
 */
"use client";

import type { EChartsOption } from "echarts";

import { defaultDarkTheme, defaultLightTheme } from "../../lib/chart-themes";
import { BaseChart } from "./base-chart";
import { ChartEmptyState } from "./chart-empty-state";
import type { ChartTheme, EChartsEventParams } from "./types";

export interface BeeswarmDataItem {
  /** Timestamp (ms) for X position */
  x: number;
  /** Jitter offset for Y position (computed externally) */
  y: number;
  /** Event ID for click handling */
  id: number;
  /** Tooltip label (event title) */
  label?: string;
  /** Dataset name for legend/tooltip */
  dataset?: string;
  /** Series index (for dataset grouping) */
  seriesIndex?: number;
  /** Cluster count (when this point represents multiple events) */
  count?: number;
}

export interface BeeswarmSeries {
  name: string;
  color: string;
  data: BeeswarmDataItem[];
}

export interface BeeswarmChartProps {
  /** Grouped series data (one per dataset) */
  series: BeeswarmSeries[];
  /** Callback when a point is clicked */
  onPointClick?: (eventId: number) => void;
  theme?: ChartTheme;
  height?: number | string;
  className?: string;
  isInitialLoad?: boolean;
  isUpdating?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Total event count (show "X of Y" when limited) */
  totalCount?: number;
  /** Number of visible points */
  visibleCount?: number;
  emptyMessage?: string;
  /** Max cluster count for sizing proportional circles */
  maxClusterCount?: number;
}

/** Dataset color palette matching the cartographic design system */
const DATASET_COLORS = [
  "#0089a7", // blue (primary)
  "#cd853f", // terracotta
  "#5f9e6e", // forest
  "#4a5568", // navy
  "#b87333", // copper
  "#8b6914", // golden
  "#6b5b73", // mauve
  "#2d6a4f", // dark green
];

export { DATASET_COLORS };

/** Compute tight axis bounds from all series data so the chart fills its container. */
const computeAxisBounds = (allSeries: BeeswarmSeries[]) => {
  let maxY = 1;
  const xValues: number[] = [];
  for (const s of allSeries) {
    for (const item of s.data) {
      const absY = Math.abs(item.y);
      if (absY > maxY) maxY = absY;
      xValues.push(item.x);
    }
  }
  if (xValues.length === 0) return { yPadding: 1, xMin: undefined, xMax: undefined };

  // Use 2nd/98th percentile to avoid outliers stretching the axis
  xValues.sort((a, b) => a - b);
  const p02 = xValues[Math.floor(xValues.length * 0.02)] ?? xValues[0]!;
  const p98 = xValues[Math.ceil(xValues.length * 0.98) - 1] ?? xValues[xValues.length - 1]!;
  const xRange = p98 - p02;
  const xPad = xRange > 0 ? xRange * 0.05 : 86400000;
  return { yPadding: Math.max(maxY * 1.05, 1), xMin: p02 - xPad, xMax: p98 + xPad };
};

export const BeeswarmChart = ({
  series,
  onPointClick,
  theme,
  height = 300,
  className,
  isInitialLoad = false,
  isUpdating = false,
  isError = false,
  onRetry,
  emptyMessage = "No data available",
  maxClusterCount = 1,
}: BeeswarmChartProps) => {
  const isDark = theme?.axisLineColor === defaultDarkTheme.axisLineColor;
  const effectiveTheme = theme ?? (isDark ? defaultDarkTheme : defaultLightTheme);

  const totalPoints = series.reduce((sum, s) => sum + s.data.length, 0);
  const defaultDotSize = totalPoints < 200 ? 6 : 4;

  const { yPadding, xMin, xMax } = computeAxisBounds(series);

  const chartOption: EChartsOption = {
    backgroundColor: "transparent",
    textStyle: { color: effectiveTheme.textColor },
    grid: { left: 50, right: 20, bottom: 25, top: 5 },
    xAxis: {
      type: "time",
      min: xMin,
      max: xMax,
      axisLabel: { color: effectiveTheme.textColor, fontSize: 11 },
      axisLine: { lineStyle: { color: effectiveTheme.axisLineColor } },
      splitLine: { show: false },
    },
    yAxis: { type: "value", show: false, min: -yPadding, max: yPadding },
    tooltip: {
      trigger: "item",
      backgroundColor: effectiveTheme.tooltipBackground,
      borderColor: effectiveTheme.axisLineColor,
      textStyle: { color: effectiveTheme.tooltipForeground },
      formatter: (params: unknown) => {
        const p = params as { data?: unknown };
        if (!p.data || !Array.isArray(p.data) || p.data.length < 4) return "";
        const [, , , item] = p.data as [number, number, number, BeeswarmDataItem];
        const date = new Date(item.x);
        const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
        if (item.count) {
          return `<div style="padding: 4px 8px;"><div style="font-weight: 600;">${item.count.toLocaleString()} events</div><div>${dateStr}</div></div>`;
        }
        return `
          <div style="padding: 4px 8px; max-width: 250px;">
            <div style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.label ?? dateStr}</div>
            <div>${dateStr}</div>
            ${item.dataset ? `<div style="opacity: 0.7;">${item.dataset}</div>` : ""}
          </div>
        `;
      },
    },
    legend: { show: false },
    series: series.map((s) => {
      const hasClusterData = s.data.some((item) => item.count != null && item.count > 0);
      return {
        type: "scatter" as const,
        name: s.name,
        symbolSize: hasClusterData
          ? (value: number[]) => {
              const item = value[3] as unknown as BeeswarmDataItem;
              if (!item?.count) return 4;
              return Math.max(8, Math.min(40, 8 + Math.sqrt(item.count / maxClusterCount) * 32));
            }
          : defaultDotSize,
        itemStyle: { color: s.color, opacity: hasClusterData ? 0.5 : 0.8 },
        emphasis: {
          itemStyle: { color: effectiveTheme.emphasisColor, opacity: 1, borderWidth: 2, borderColor: "#fff" },
        },
        // Data format: [x, y, id, fullItem] — id for click, fullItem for tooltip
        data: s.data.map((item) => [item.x, item.y, item.id, item] as unknown as number[]),
      };
    }),
    animation: true,
    animationDuration: 300,
  };

  const handleClick = (params: EChartsEventParams) => {
    if (!onPointClick || !params.data || !Array.isArray(params.data) || params.data.length < 3) return;
    const eventId = params.data[2] as number;
    if (typeof eventId === "number") onPointClick(eventId);
  };

  const chartEvents = { click: handleClick };

  if (isError && !isInitialLoad) {
    return <ChartEmptyState variant="error" height={height} className={className} onRetry={onRetry} />;
  }

  if (totalPoints === 0 && !isInitialLoad && !isUpdating) {
    return <ChartEmptyState variant="no-match" height={height} className={className} message={emptyMessage} />;
  }

  return (
    <BaseChart
      height={height}
      className={className}
      isInitialLoad={isInitialLoad}
      isUpdating={isUpdating}
      theme={theme}
      config={chartOption}
      onEvents={chartEvents}
      skeletonVariant="histogram"
    />
  );
};
