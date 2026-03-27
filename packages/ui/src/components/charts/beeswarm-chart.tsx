/**
 * Beeswarm scatter chart for visualizing individual events on a timeline.
 *
 * Each point represents one event or cluster, positioned by timestamp on the
 * X-axis. The chart automatically computes Y positions using a collision-avoidance
 * algorithm: items are placed as close to y=0 as possible without overlapping,
 * so dense time regions naturally bulge outward (the classic beeswarm shape).
 *
 * @module
 * @category Components
 */
"use client";

import { forceCollide, forceSimulation, forceX, forceY } from "d3-force";
import type { EChartsOption } from "echarts";

import { defaultDarkTheme, defaultLightTheme } from "../../lib/chart-themes";
import { BaseChart } from "./base-chart";
import { ChartEmptyState } from "./chart-empty-state";
import type { ChartTheme, EChartsEventParams } from "./types";

export interface BeeswarmDataItem {
  /** Timestamp (ms) for X position */
  x: number;
  /** Y position — overridden by the internal beeswarm layout */
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
  /**
   * Layout mode:
   * - `"merged"` (default): all series share the same Y space
   * - `"rows"`: each series gets its own horizontal lane with a label
   */
  layout?: "merged" | "rows";
  /** Override the auto-computed dot size (pixels). */
  dotSizeOverride?: number;
  /** Min cluster circle size (pixels). @default 10 */
  clusterMinSize?: number;
  /** Max cluster circle size (pixels). @default 40 */
  clusterMaxSize?: number;
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

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

/** Adaptive dot size based on total point count */
const computeDotSize = (totalPoints: number): number => {
  if (totalPoints < 50) return 14;
  if (totalPoints < 200) return 10;
  if (totalPoints < 500) return 8;
  if (totalPoints < 1000) return 6;
  return 4;
};

/** Logarithmic cluster sizing for better visual differentiation across magnitudes */
const computeClusterSize = (count: number, maxCount: number, minSize = 10, maxSize = 40): number => {
  if (maxCount <= 1 || count <= 1) return minSize;
  const ratio = Math.log(count) / Math.log(maxCount);
  return Math.round(minSize + ratio * (maxSize - minSize));
};

// ---------------------------------------------------------------------------
// Beeswarm layout — d3-force simulation
// ---------------------------------------------------------------------------

interface ForceNode {
  /** Index for writing back the result */
  idx: number;
  /** X position in pixel-space (fixed via fx) */
  fx: number;
  /** Visual radius in pixels */
  r: number;
  /** d3-force managed positions */
  x?: number;
  y?: number;
}

/** Estimated chart content width in pixels (after margins) */
const CHART_PX = 500;

/** Simulation ticks — scales with dataset size for performance. */
const getIterations = (n: number): number => {
  if (n < 100) return 200;
  if (n < 300) return 150;
  if (n < 600) return 100;
  return 60;
};

/**
 * d3-force beeswarm layout.
 *
 * Uses d3-force with:
 * - `forceX(fx)` with strength 1: locks each node to its time position
 * - `forceY(0)`: gravity pulling toward the center line
 * - `forceCollide(r)`: prevents circle overlap with per-node radii
 *
 * Dense time regions naturally bulge outward, creating the connected
 * beeswarm shape.
 */
const computeBeeswarmLayout = (
  allSeries: BeeswarmSeries[],
  dotSize: number,
  maxClusterCount: number,
  clusterMinSize = 10,
  clusterMaxSize = 40
): number[] => {
  const nodes: ForceNode[] = [];
  for (const s of allSeries) {
    for (const item of s.data) {
      const r = item.count
        ? computeClusterSize(item.count, maxClusterCount, clusterMinSize, clusterMaxSize) / 2
        : dotSize / 2;
      // Seed with random Y jitter so the force sim has something to resolve —
      // without this, non-overlapping nodes all stay at y=0 (flat line).
      const jitter = (Math.sin(nodes.length * 9301 + 49297) * 0.5 + 0.5 - 0.5) * r * 4;
      nodes.push({ idx: nodes.length, fx: item.x, r, x: item.x, y: jitter });
    }
  }
  if (nodes.length === 0) return [];

  // Scale X to pixel space so collision radii are meaningful
  let xMin = nodes[0]!.fx;
  let xMax = nodes[0]!.fx;
  for (const n of nodes) {
    if (n.fx < xMin) xMin = n.fx;
    if (n.fx > xMax) xMax = n.fx;
  }
  const xScale = CHART_PX / (xMax - xMin || 1);
  for (const n of nodes) {
    const px = (n.fx - xMin) * xScale;
    n.fx = px;
    n.x = px;
  }

  const sim = forceSimulation(nodes)
    .alphaDecay(0.005)
    .force("x", forceX<ForceNode>((d) => d.fx).strength(1))
    .force("y", forceY<ForceNode>(0).strength(0.3))
    .force("collide", forceCollide<ForceNode>((d) => d.r * 1.15).iterations(4))
    .stop();

  const ticks = getIterations(nodes.length);
  for (let i = 0; i < ticks; i++) sim.tick();

  const yPositions = new Array<number>(nodes.length).fill(0);
  for (const n of nodes) yPositions[n.idx] = n.y ?? 0;
  return yPositions;
};

/** Spacing between rows in the value-axis coordinate space. */
const ROW_SPACING = 100;

/**
 * Row-based beeswarm layout — runs d3-force per series independently,
 * then offsets each series to its own Y band.
 *
 * Uses a value axis (not category) so fractional Y positions work correctly.
 */
const computeRowLayout = (
  allSeries: BeeswarmSeries[],
  dotSize: number,
  maxClusterCount: number,
  clusterMinSize = 10,
  clusterMaxSize = 40
): { yPositions: number[]; rowCount: number } => {
  const rowCount = allSeries.length;
  if (rowCount === 0) return { yPositions: [], rowCount: 0 };

  const yPositions: number[] = [];

  for (let si = 0; si < allSeries.length; si++) {
    const s = allSeries[si]!;
    if (s.data.length === 0) continue;

    const localY = computeBeeswarmLayout([s], dotSize, maxClusterCount, clusterMinSize, clusterMaxSize);
    const rowCenter = si * ROW_SPACING;
    for (const ly of localY) yPositions.push(rowCenter + ly);
  }

  return { yPositions, rowCount };
};

// ---------------------------------------------------------------------------
// X-axis bounds
// ---------------------------------------------------------------------------

/** Compute X-axis bounds — full range for small datasets, percentile clipping for large ones */
const computeXBounds = (allSeries: BeeswarmSeries[]) => {
  const xValues: number[] = [];
  for (const s of allSeries) {
    for (const item of s.data) xValues.push(item.x);
  }
  if (xValues.length === 0) return { xMin: undefined, xMax: undefined };

  xValues.sort((a, b) => a - b);
  const usePercentile = xValues.length >= 200;
  const lo = usePercentile ? (xValues[Math.floor(xValues.length * 0.02)] ?? xValues[0]!) : xValues[0]!;
  const hi = usePercentile
    ? (xValues[Math.ceil(xValues.length * 0.98) - 1] ?? xValues[xValues.length - 1]!)
    : xValues[xValues.length - 1]!;
  const range = hi - lo;
  const pad = range > 0 ? range * 0.05 : 86400000;
  return { xMin: lo - pad, xMax: hi + pad };
};

// ---------------------------------------------------------------------------
// Layout config builders
// ---------------------------------------------------------------------------

/** Build Y positions + axis config for merged (single-row) layout. */
const computeMergedLayoutConfig = (
  allSeries: BeeswarmSeries[],
  dotSize: number,
  maxClusterCount: number,
  clusterMinSize = 10,
  clusterMaxSize = 40
) => {
  const yPositions = computeBeeswarmLayout(allSeries, dotSize, maxClusterCount, clusterMinSize, clusterMaxSize);

  let maxAbsY = 1;
  for (const y of yPositions) {
    if (Math.abs(y) > maxAbsY) maxAbsY = Math.abs(y);
  }
  const yPadding = Math.max(maxAbsY * 1.2, 1);

  return { yPositions, yAxisConfig: { type: "value" as const, show: false, min: -yPadding, max: yPadding } };
};

/** Build Y positions + axis config for row (per-series lanes) layout. */
const computeRowLayoutConfig = (
  allSeries: BeeswarmSeries[],
  dotSize: number,
  maxClusterCount: number,
  effectiveTheme: ChartTheme,
  clusterMinSize = 10,
  clusterMaxSize = 40
) => {
  const { yPositions, rowCount } = computeRowLayout(
    allSeries,
    dotSize,
    maxClusterCount,
    clusterMinSize,
    clusterMaxSize
  );

  // Value axis with custom labels at row centers and dashed separators between rows
  const yMin = -ROW_SPACING * 0.5;
  const yMax = (rowCount - 1) * ROW_SPACING + ROW_SPACING * 0.5;

  return {
    yPositions,
    yAxisConfig: {
      type: "value" as const,
      show: true,
      min: yMin,
      max: yMax,
      interval: ROW_SPACING, // force ticks at exactly row centers
      inverse: true, // first series at top
      axisLabel: {
        color: effectiveTheme.textColor,
        fontSize: 11,
        formatter: (value: number) => {
          const idx = Math.round(value / ROW_SPACING);
          return allSeries[idx]?.name ?? "";
        },
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: rowCount > 1,
        interval: 0,
        lineStyle: { color: effectiveTheme.axisLineColor, opacity: 0.15, type: "dashed" as const },
      },
    },
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  layout = "merged",
  dotSizeOverride,
  clusterMinSize = 10,
  clusterMaxSize = 40,
}: BeeswarmChartProps) => {
  const isDark = theme?.axisLineColor === defaultDarkTheme.axisLineColor;
  const effectiveTheme = theme ?? (isDark ? defaultDarkTheme : defaultLightTheme);

  const totalPoints = series.reduce((sum, s) => sum + s.data.length, 0);
  const dotSize = dotSizeOverride ?? computeDotSize(totalPoints);
  const isRowLayout = layout === "rows" && series.length > 1;

  // Compute beeswarm layout — merged or per-row
  const { yPositions, yAxisConfig } = isRowLayout
    ? computeRowLayoutConfig(series, dotSize, maxClusterCount, effectiveTheme, clusterMinSize, clusterMaxSize)
    : computeMergedLayoutConfig(series, dotSize, maxClusterCount, clusterMinSize, clusterMaxSize);

  const { xMin, xMax } = computeXBounds(series);
  const showLegend = !isRowLayout && series.length > 1;

  // Rebuild series data with layout Y positions
  let flatIdx = 0;
  const layoutSeries = series.map((s) => {
    const data: Array<unknown[]> = [];
    for (const item of s.data) {
      data.push([item.x, yPositions[flatIdx] ?? 0, item.id, item]);
      flatIdx++;
    }
    return { ...s, layoutData: data };
  });

  const chartOption: EChartsOption = {
    backgroundColor: "transparent",
    textStyle: { color: effectiveTheme.textColor },
    grid: { left: 10, right: 10, bottom: 25, top: showLegend ? 30 : 10, containLabel: false },
    xAxis: {
      type: "time",
      min: xMin,
      max: xMax,
      axisLabel: { color: effectiveTheme.textColor, fontSize: 11 },
      axisLine: { lineStyle: { color: effectiveTheme.axisLineColor } },
      splitLine: { show: false },
    },
    yAxis: yAxisConfig,
    tooltip: {
      trigger: "item",
      backgroundColor: effectiveTheme.tooltipBackground,
      borderColor: effectiveTheme.axisLineColor,
      textStyle: { color: effectiveTheme.tooltipForeground },
      formatter: (params: unknown) => {
        const p = params as { data?: unknown; seriesName?: string };
        if (!p.data || !Array.isArray(p.data) || p.data.length < 4) return "";
        const [, , , item] = p.data as [number, number, number, BeeswarmDataItem];
        const date = new Date(item.x);
        const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
        if (item.count) {
          const datasetLine = p.seriesName ? `<div style="opacity: 0.7;">${p.seriesName}</div>` : "";
          return `<div style="padding: 4px 8px;"><div style="font-weight: 600;">${item.count.toLocaleString()} events</div><div>${dateStr}</div>${datasetLine}</div>`;
        }
        return `
          <div style="padding: 4px 8px; max-width: 250px;">
            <div style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.label ?? dateStr}</div>
            <div>${dateStr}</div>
            ${(item.dataset ?? p.seriesName) ? `<div style="opacity: 0.7;">${item.dataset ?? p.seriesName}</div>` : ""}
          </div>
        `;
      },
    },
    legend: showLegend
      ? { show: true, top: 0, textStyle: { color: effectiveTheme.textColor, fontSize: 11 } }
      : { show: false },
    series: layoutSeries.map((s) => {
      const hasClusterData = s.data.some((item) => item.count != null && item.count > 0);
      return {
        type: "scatter" as const,
        name: s.name,
        symbolSize: hasClusterData
          ? (value: number[]) => {
              const item = value[3] as unknown as BeeswarmDataItem;
              if (!item?.count) return dotSize;
              return computeClusterSize(item.count, maxClusterCount, clusterMinSize, clusterMaxSize);
            }
          : dotSize,
        itemStyle: { color: s.color, opacity: hasClusterData ? 0.5 : 0.8 },
        emphasis: {
          itemStyle: { color: effectiveTheme.emphasisColor, opacity: 1, borderWidth: 2, borderColor: "#fff" },
        },
        data: s.layoutData as unknown as number[][],
      };
    }),
    animation: true,
    animationDuration: 300,
  };

  const handleClick = (params: EChartsEventParams) => {
    if (!onPointClick || !params.data || !Array.isArray(params.data) || params.data.length < 3) return;
    const eventId = params.data[2] as number;
    // Only fire for individual events (positive IDs), not clusters
    if (typeof eventId === "number" && eventId > 0) onPointClick(eventId);
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
      skeletonVariant="scatter"
    />
  );
};
