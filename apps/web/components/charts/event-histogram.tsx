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
import { LabeledSlider } from "@timetiles/ui/components/labeled-slider";
import { getResolution, isValidCell } from "h3-js";
import { useMemo } from "react";

import { expandGroupNames } from "@/components/charts/event-beeswarm";
import { EMPTY_ARRAY } from "@/lib/constants/empty";
import { useHistogramQuery, useTemporalClustersQuery } from "@/lib/hooks/use-events-queries";
import { useFilters } from "@/lib/hooks/use-filters";
import { useViewScope } from "@/lib/hooks/use-view-scope";
import { useUIStore } from "@/lib/store";

import type { BaseChartProps } from "./types";

/** Aggregate temporal-cluster items into stacked histogram series. */
const buildGroupedSeries = (
  items: Array<{ groupName: string | null; count: number; bucketStart: string }>,
  maxGroups: number
): TimeHistogramSeries[] | undefined => {
  const groupTotals = new Map<string, { name: string; total: number; items: Map<string, number> }>();
  for (const item of items) {
    const names = expandGroupNames(item.groupName ?? "");
    for (const name of names) {
      if (!groupTotals.has(name)) {
        groupTotals.set(name, { name, total: 0, items: new Map() });
      }
      const g = groupTotals.get(name)!;
      g.total += item.count;
      const existing = g.items.get(item.bucketStart) ?? 0;
      g.items.set(item.bucketStart, existing + item.count);
    }
  }

  const allBucketDates = new Set<string>();
  for (const item of items) allBucketDates.add(item.bucketStart);
  const sortedDates = [...allBucketDates].sort((a, b) => a.localeCompare(b));

  const sorted = [...groupTotals.entries()].sort((a, b) => b[1].total - a[1].total);
  const topGroups = sorted.slice(0, maxGroups);
  const otherGroups = sorted.slice(maxGroups);

  const zeroFill = (buckets: Map<string, number>) =>
    sortedDates.map((date) => ({ date, count: buckets.get(date) ?? 0 }));

  const series: TimeHistogramSeries[] = topGroups.map(([, group], idx) => ({
    name: group.name,
    color: DATASET_COLORS[idx % DATASET_COLORS.length] ?? DATASET_COLORS[0],
    data: zeroFill(group.items),
  }));

  if (otherGroups.length > 0) {
    const otherBuckets = new Map<string, number>();
    for (const [, group] of otherGroups) {
      for (const [date, count] of group.items) {
        otherBuckets.set(date, (otherBuckets.get(date) ?? 0) + count);
      }
    }
    series.push({ name: `Other (${otherGroups.length})`, color: "#9ca3af", data: zeroFill(otherBuckets) });
  }

  return series.length > 0 ? series : undefined;
};

/** Build cluster filter from H3 cells, returns undefined if cells are invalid. */
const parseClusterFilter = (cells: string[] | null | undefined) => {
  if (!cells || cells.length === 0) return undefined;
  try {
    if (!isValidCell(cells[0]!)) return undefined;
    return { cells, h3Resolution: getResolution(cells[0]!) };
  } catch {
    return undefined;
  }
};

interface EventHistogramProps extends BaseChartProps {
  /** Group by field — when set and not "dataset", uses stacked bars */
  groupBy?: string;
  /** Number of top groups to show before merging into "Other" */
  maxGroups?: number;
  /** Callback to change maxGroups */
  onMaxGroupsChange?: (n: number) => void;
  /** Whether the settings panel is visible */
  showControls?: boolean;
}

export const EventHistogram = ({
  height = 200,
  className,
  bounds,
  showDataZoom,
  groupBy = "none",
  maxGroups = 8,
  onMaxGroupsChange,
  showControls = false,
}: Readonly<EventHistogramProps>) => {
  const chartTheme = useChartTheme();
  const { filters, setSingleDayFilter } = useFilters();
  const scope = useViewScope();
  const clusterFilterCells = useUIStore((s) => s.ui.clusterFilterCells);

  const clusterFilter = useMemo(() => parseClusterFilter(clusterFilterCells), [clusterFilterCells]);

  const isGrouped = groupBy !== "none";
  const boundsOrNull = bounds ?? null;

  // Standard histogram (ungrouped)
  const histogramQuery = useHistogramQuery(filters, boundsOrNull, !isGrouped, scope, clusterFilter);

  // Grouped: reuse temporal-clusters API with individualThreshold=0 (force clustered)
  const clustersQuery = useTemporalClustersQuery(
    filters,
    boundsOrNull,
    isGrouped,
    scope,
    isGrouped ? { individualThreshold: 0, targetBuckets: 40, groupBy } : undefined
  );

  const histogram = histogramQuery.data?.histogram ?? EMPTY_ARRAY;

  const groupedData = useMemo<TimeHistogramSeries[] | undefined>(
    () =>
      isGrouped && clustersQuery.data?.items ? buildGroupedSeries(clustersQuery.data.items, maxGroups) : undefined,
    [isGrouped, clustersQuery.data?.items, maxGroups]
  );

  // Pick loading/error state from the active query (grouped vs ungrouped)
  const activeQuery = isGrouped ? clustersQuery : histogramQuery;
  const bucketSizeSeconds = activeQuery.data?.metadata?.bucketSizeSeconds ?? null;

  return (
    <div className="relative h-full">
      <TimeHistogram
        data={isGrouped ? undefined : histogram}
        groupedData={groupedData}
        onBarClick={setSingleDayFilter}
        theme={chartTheme}
        height={height}
        className={className}
        isInitialLoad={activeQuery.isInitialLoad}
        isUpdating={activeQuery.isUpdating}
        isError={activeQuery.isError}
        bucketSizeSeconds={bucketSizeSeconds}
        showDataZoom={showDataZoom}
      />
      {showControls && isGrouped && onMaxGroupsChange && (
        <div className="bg-background/95 border-border absolute top-0 right-0 z-10 flex w-56 flex-col gap-3 rounded-md border p-3 shadow-md backdrop-blur-sm">
          <LabeledSlider
            label="Top groups"
            value={maxGroups}
            onChange={onMaxGroupsChange}
            min={2}
            max={10}
            step={1}
            minLabel="Fewer"
            maxLabel="More"
          />
        </div>
      )}
    </div>
  );
};
