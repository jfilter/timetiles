/**
 * Beeswarm layout computation — d3-force simulation and axis configuration.
 *
 * @module
 */

import { forceCollide, forceSimulation, forceX, forceY } from "d3-force";

import type { ChartTheme } from "../types";
import { computeClusterSize } from "./sizing";
import type { BeeswarmSeries, BeeswarmYAxisConfig, MergedYAxisConfig, RowYAxisConfig } from "./types";

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

/** Spacing between rows in the value-axis coordinate space. */
export const ROW_SPACING = 100;

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
export const computeBeeswarmLayout = (
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

  const yPositions: number[] = Array.from({ length: nodes.length }, () => 0);
  for (const n of nodes) yPositions[n.idx] = n.y ?? 0;
  return yPositions;
};

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
  const maxHalfHeight = ROW_SPACING * 0.4; // leave 10% gap between rows

  for (let si = 0; si < allSeries.length; si++) {
    const s = allSeries[si]!;
    if (s.data.length === 0) continue;

    const localY = computeBeeswarmLayout([s], dotSize, maxClusterCount, clusterMinSize, clusterMaxSize);

    // Scale down if the row's spread exceeds the allocated band
    let maxAbsY = 0;
    for (const ly of localY) {
      if (Math.abs(ly) > maxAbsY) maxAbsY = Math.abs(ly);
    }
    const scale = maxAbsY > maxHalfHeight ? maxHalfHeight / maxAbsY : 1;

    const rowCenter = si * ROW_SPACING + ROW_SPACING * 0.5;
    for (const ly of localY) yPositions.push(rowCenter + ly * scale);
  }

  return { yPositions, rowCount };
};

/** Compute X-axis bounds — full range for small datasets, percentile clipping for large ones */
export const computeXBounds = (allSeries: BeeswarmSeries[]): { xMin: number | undefined; xMax: number | undefined } => {
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

/** Build Y positions + axis config for merged (single-row) layout. */
export const computeMergedLayoutConfig = (
  allSeries: BeeswarmSeries[],
  dotSize: number,
  maxClusterCount: number,
  clusterMinSize = 10,
  clusterMaxSize = 40
): { yPositions: number[]; yAxisConfig: MergedYAxisConfig } => {
  const yPositions = computeBeeswarmLayout(allSeries, dotSize, maxClusterCount, clusterMinSize, clusterMaxSize);

  let maxAbsY = 1;
  for (const y of yPositions) {
    if (Math.abs(y) > maxAbsY) maxAbsY = Math.abs(y);
  }
  const yPadding = Math.max(maxAbsY * 1.2, 1);

  return { yPositions, yAxisConfig: { type: "value", show: false, min: -yPadding, max: yPadding } };
};

/** Build Y positions + axis config for row (per-series lanes) layout. */
export const computeRowLayoutConfig = (
  allSeries: BeeswarmSeries[],
  dotSize: number,
  maxClusterCount: number,
  effectiveTheme: ChartTheme,
  clusterMinSize = 10,
  clusterMaxSize = 40
): { yPositions: number[]; yAxisConfig: RowYAxisConfig } => {
  const { yPositions, rowCount } = computeRowLayout(
    allSeries,
    dotSize,
    maxClusterCount,
    clusterMinSize,
    clusterMaxSize
  );

  // Value axis: labels at row centers, dashed separators between rows.
  // Row centers are at 50, 150, 250... (offset by half-spacing to align with tick positions).
  // With min=0 and interval=100, ticks land at 0, 100, 200... — separators between rows.
  // With min=-50 and interval=100, ticks land at -50, 50, 150... — aligned with row centers.
  const yMin = -ROW_SPACING * 0.5;
  const yMax = rowCount * ROW_SPACING;

  return {
    yPositions,
    yAxisConfig: {
      type: "value",
      show: true,
      min: yMin,
      max: yMax,
      interval: ROW_SPACING,
      inverse: true, // first series at top
      axisLabel: {
        color: effectiveTheme.textColor,
        fontSize: 11,
        formatter: (value: number) => {
          // Ticks at -50, 50, 150... map to row indices: -50→empty, 50→0, 150→1
          const idx = (value - ROW_SPACING * 0.5) / ROW_SPACING;
          if (idx < 0 || idx >= allSeries.length || idx !== Math.round(idx)) return "";
          return allSeries[idx]?.name ?? "";
        },
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: rowCount > 1,
        interval: 0,
        lineStyle: { color: effectiveTheme.axisLineColor, opacity: 0.15, type: "dashed" },
      },
    },
  };
};

/** Dispatch to merged or row layout based on the `isRowLayout` flag. */
export const computeLayoutConfig = (
  isRowLayout: boolean,
  allSeries: BeeswarmSeries[],
  dotSize: number,
  maxClusterCount: number,
  effectiveTheme: ChartTheme,
  clusterMinSize = 10,
  clusterMaxSize = 40
): { yPositions: number[]; yAxisConfig: BeeswarmYAxisConfig } =>
  isRowLayout
    ? computeRowLayoutConfig(allSeries, dotSize, maxClusterCount, effectiveTheme, clusterMinSize, clusterMaxSize)
    : computeMergedLayoutConfig(allSeries, dotSize, maxClusterCount, clusterMinSize, clusterMaxSize);
