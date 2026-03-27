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

import { cleanGroupName } from "@/components/charts/event-beeswarm";
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

  // Transform temporal-clusters response to stacked histogram series (top 4 + "Other")
  const groupedData = useMemo<TimeHistogramSeries[] | undefined>(() => {
    if (!isGrouped || !clustersQuery.data?.items) return undefined;

    // Aggregate total counts per group to determine top groups
    const groupTotals = new Map<string, { name: string; total: number; items: Map<string, number> }>();
    for (const item of clustersQuery.data.items) {
      if (!groupTotals.has(item.groupId)) {
        groupTotals.set(item.groupId, { name: cleanGroupName(item.groupName), total: 0, items: new Map() });
      }
      const g = groupTotals.get(item.groupId)!;
      g.total += item.count;
      const existing = g.items.get(item.bucketStart) ?? 0;
      g.items.set(item.bucketStart, existing + item.count);
    }

    // Sort by total count, take top 4
    const MAX_GROUPS = 4;
    const sorted = [...groupTotals.entries()].sort((a, b) => b[1].total - a[1].total);
    const topGroups = sorted.slice(0, MAX_GROUPS);
    const otherGroups = sorted.slice(MAX_GROUPS);

    const series: TimeHistogramSeries[] = topGroups.map(([, group], idx) => ({
      name: group.name,
      color: DATASET_COLORS[idx % DATASET_COLORS.length] ?? "#0089a7",
      data: Array.from(group.items.entries()).map(([date, count]) => ({ date, count })),
    }));

    // Merge remaining groups into "Other"
    if (otherGroups.length > 0) {
      const otherBuckets = new Map<string, number>();
      for (const [, group] of otherGroups) {
        for (const [date, count] of group.items) {
          otherBuckets.set(date, (otherBuckets.get(date) ?? 0) + count);
        }
      }
      series.push({
        name: `Other (${otherGroups.length})`,
        color: "#9ca3af", // neutral gray
        data: Array.from(otherBuckets.entries()).map(([date, count]) => ({ date, count })),
      });
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
