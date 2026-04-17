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

import type { EChartsOption } from "echarts";
import { useCallback, useMemo } from "react";

import { defaultDarkTheme, defaultLightTheme } from "../../../lib/chart-themes";
import { BaseChart } from "../base-chart";
import { ChartEmptyState } from "../chart-empty-state";
import type { EChartsEventParams } from "../types";
import { buildChartOption } from "./build-chart-option";
import { computeLayoutConfig, computeXBounds } from "./layout-computation";
import { computeDotSize } from "./sizing";
import type { BeeswarmChartProps } from "./types";

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

  const totalPoints = useMemo(() => series.reduce((sum, s) => sum + s.data.length, 0), [series]);
  const dotSize = dotSizeOverride ?? computeDotSize(totalPoints);
  const isRowLayout = layout === "rows" && series.length > 1;

  // Compute beeswarm layout — merged or per-row.
  // `series` is an object dep, but it drives both d3-force input nodes and
  // the row/axis config (names, counts), so it must be in the dep array.
  // `effectiveTheme` is only read by `computeRowLayoutConfig`; guarded below.
  const { yPositions, yAxisConfig } = useMemo(
    () =>
      computeLayoutConfig(
        isRowLayout,
        series,
        dotSize,
        maxClusterCount,
        effectiveTheme,
        clusterMinSize,
        clusterMaxSize
      ),
    [isRowLayout, series, dotSize, maxClusterCount, effectiveTheme, clusterMinSize, clusterMaxSize]
  );

  const { xMin, xMax } = useMemo(() => computeXBounds(series), [series]);
  const showLegend = !isRowLayout && series.length > 1;

  // Rebuild series data with layout Y positions.
  // Depends on `series` (object) because we iterate all items + `yPositions`
  // which already changes whenever series changes.
  const layoutSeries = useMemo(() => {
    let flatIdx = 0;
    return series.map((s) => {
      const data: Array<unknown[]> = [];
      for (const item of s.data) {
        data.push([item.x, yPositions[flatIdx] ?? 0, item.id, item]);
        flatIdx++;
      }
      return { ...s, layoutData: data };
    });
  }, [series, yPositions]);

  const chartOption = useMemo<EChartsOption>(
    () =>
      buildChartOption({
        effectiveTheme,
        isRowLayout,
        showLegend,
        xMin,
        xMax,
        yAxisConfig,
        layoutSeries,
        dotSize,
        maxClusterCount,
        clusterMinSize,
        clusterMaxSize,
      }),
    [
      effectiveTheme,
      isRowLayout,
      showLegend,
      xMin,
      xMax,
      yAxisConfig,
      layoutSeries,
      dotSize,
      maxClusterCount,
      clusterMinSize,
      clusterMaxSize,
    ]
  );

  const handleClick = useCallback(
    (params: EChartsEventParams) => {
      if (!onPointClick || !params.data || !Array.isArray(params.data) || params.data.length < 3) return;
      const eventId = params.data[2] as number;
      // Only fire for individual events (positive IDs), not clusters
      if (typeof eventId === "number" && eventId > 0) onPointClick(eventId);
    },
    [onPointClick]
  );

  const chartEvents = useMemo(() => ({ click: handleClick }), [handleClick]);

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
