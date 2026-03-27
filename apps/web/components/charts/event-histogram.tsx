/**
 * Interactive histogram visualization for temporal event distribution.
 *
 * Supports two modes:
 * - Single series: uses the histogram API (default, no groupBy)
 * - Stacked series: uses the temporal-clusters API with groupBy,
 *   sharing the same endpoint and cache as the beeswarm chart
 *
 * @module
 * @category Components
 */
"use client";

import type { TimeHistogramSeries } from "@timetiles/ui/charts";
import { DATASET_COLORS, TimeHistogram, useChartTheme } from "@timetiles/ui/charts";
import { useMemo } from "react";

import { EMPTY_ARRAY } from "@/lib/constants/empty";
import { useHistogramQuery, useTemporalClustersQuery } from "@/lib/hooks/use-events-queries";
import { useFilters } from "@/lib/hooks/use-filters";
import { useViewScope } from "@/lib/hooks/use-view-scope";

import type { BaseChartProps } from "./types";

interface EventHistogramProps extends BaseChartProps {
  /** Group by field — when set and not "dataset", uses stacked bars */
  groupBy?: string;
  /** Whether settings panel is visible */
  showControls?: boolean;
}

/**
 * Event histogram component with data fetching.
 *
 * When groupBy is "dataset" (default), uses the standard histogram API.
 * When groupBy is set to something else, uses the temporal-clusters API
 * and renders stacked bars per group.
 */
export const EventHistogram = ({
  height = 200,
  className,
  bounds,
  showDataZoom,
  groupBy = "none",
}: Readonly<EventHistogramProps>) => {
  const chartTheme = useChartTheme();
  const { filters, setSingleDayFilter } = useFilters();
  const scope = useViewScope();

  const isGrouped = groupBy !== "none";

  // Standard histogram (ungrouped)
  const histogramQuery = useHistogramQuery(filters, bounds ?? null, !isGrouped, scope);

  // Grouped: reuse temporal-clusters API with individualThreshold=0 (force clustered)
  const clustersQuery = useTemporalClustersQuery(
    filters,
    bounds ?? null,
    isGrouped,
    scope,
    isGrouped ? { individualThreshold: 0, targetBuckets: 40, groupBy } : undefined
  );

  const histogram = histogramQuery.data?.histogram ?? EMPTY_ARRAY;
  const bucketSizeSeconds = histogramQuery.data?.metadata?.bucketSizeSeconds ?? null;

  // Transform temporal-clusters response to stacked histogram series
  const groupedData = useMemo<TimeHistogramSeries[] | undefined>(() => {
    if (!isGrouped || !clustersQuery.data?.items) return undefined;

    const groups = new Map<string, { name: string; items: Map<string, number> }>();
    for (const item of clustersQuery.data.items) {
      if (!groups.has(item.groupId)) {
        groups.set(item.groupId, { name: item.groupName, items: new Map() });
      }
      const existing = groups.get(item.groupId)!.items.get(item.bucketStart) ?? 0;
      groups.get(item.groupId)!.items.set(item.bucketStart, existing + item.count);
    }

    let colorIdx = 0;
    const series: TimeHistogramSeries[] = [];
    for (const [, group] of groups) {
      const color = DATASET_COLORS[colorIdx % DATASET_COLORS.length] ?? "#0089a7";
      const data = Array.from(group.items.entries()).map(([date, count]) => ({ date, count }));
      series.push({ name: group.name, color, data });
      colorIdx++;
    }
    return series.length > 0 ? series : undefined;
  }, [isGrouped, clustersQuery.data?.items]);

  const isInitialLoad = isGrouped ? clustersQuery.isInitialLoad : histogramQuery.isInitialLoad;
  const isUpdating = isGrouped ? clustersQuery.isUpdating : histogramQuery.isUpdating;
  const isError = isGrouped ? clustersQuery.isError : histogramQuery.isError;

  return (
    <TimeHistogram
      data={isGrouped ? undefined : histogram}
      groupedData={groupedData}
      onBarClick={setSingleDayFilter}
      theme={chartTheme}
      height={height}
      className={className}
      isInitialLoad={isInitialLoad}
      isUpdating={isUpdating}
      isError={isError}
      bucketSizeSeconds={isGrouped ? (clustersQuery.data?.metadata.bucketSizeSeconds ?? null) : bucketSizeSeconds}
      showDataZoom={showDataZoom}
    />
  );
};
