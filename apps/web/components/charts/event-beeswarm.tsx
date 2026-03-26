/**
 * Beeswarm visualization showing events on a timeline.
 *
 * Uses the temporal-clusters API which adaptively returns:
 * - Individual events (with per-dataset grouping) for small result sets
 * - Per-dataset-per-bucket clusters for large result sets
 *
 * @module
 * @category Components
 */
"use client";

import type { BeeswarmDataItem, BeeswarmSeries } from "@timetiles/ui/charts";
import { BeeswarmChart, DATASET_COLORS, useChartTheme } from "@timetiles/ui/charts";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { useTemporalClustersQuery } from "@/lib/hooks/use-events-queries";
import { useFilters } from "@/lib/hooks/use-filters";
import { useViewScope } from "@/lib/hooks/use-view-scope";
import type { TemporalClusterItem } from "@/lib/schemas/events";
import type { SimpleBounds } from "@/lib/utils/event-params";

interface EventBeeswarmProps {
  bounds?: SimpleBounds | null;
  height?: number | string;
  className?: string;
  onEventClick?: (eventId: number) => void;
}

/** Group items by datasetId and build one BeeswarmSeries per dataset. */
const groupByDataset = (items: TemporalClusterItem[]): Map<number, { name: string; items: TemporalClusterItem[] }> => {
  const groups = new Map<number, { name: string; items: TemporalClusterItem[] }>();
  for (const item of items) {
    if (!groups.has(item.datasetId)) {
      groups.set(item.datasetId, { name: item.datasetName, items: [] });
    }
    groups.get(item.datasetId)!.items.push(item);
  }
  return groups;
};

/** Transform API response to BeeswarmSeries[] for the presentational chart. */
const transformToSeries = (
  items: TemporalClusterItem[],
  mode: "individual" | "clustered"
): { series: BeeswarmSeries[]; maxClusterCount: number } => {
  if (items.length === 0) return { series: [], maxClusterCount: 1 };

  const groups = groupByDataset(items);
  const series: BeeswarmSeries[] = [];
  let maxClusterCount = 1;
  let colorIdx = 0;

  for (const [, group] of groups) {
    const color = DATASET_COLORS[colorIdx % DATASET_COLORS.length] ?? "#0089a7";

    // Y=0 for all items — the BeeswarmChart handles layout via collision avoidance
    const data: BeeswarmDataItem[] = group.items.map((item, i) => {
      if (item.count > maxClusterCount) maxClusterCount = item.count;
      const start = new Date(item.bucketStart).getTime();
      const end = new Date(item.bucketEnd).getTime();

      return mode === "individual"
        ? {
            x: item.eventTimestamp ? new Date(item.eventTimestamp).getTime() : start,
            y: 0,
            id: item.eventId!,
            label: item.eventTitle ?? undefined,
            dataset: group.name,
          }
        : {
            x: (start + end) / 2,
            y: 0,
            id: -(colorIdx * 10000 + i + 1),
            count: item.count,
            dataset: group.name,
            label: `${item.count.toLocaleString()} events`,
          };
    });

    series.push({ name: group.name, color, data });
    colorIdx++;
  }

  return { series, maxClusterCount };
};

export const EventBeeswarm = ({ bounds, height = 300, className, onEventClick }: Readonly<EventBeeswarmProps>) => {
  const chartTheme = useChartTheme();
  const t = useTranslations("Explore");
  const { filters } = useFilters();
  const scope = useViewScope();

  const { data, isInitialLoad, isUpdating, isError } = useTemporalClustersQuery(filters, bounds ?? null, true, scope);

  const total = data?.metadata.total ?? 0;
  const mode = data?.metadata.mode ?? "individual";

  const { series, maxClusterCount } = useMemo(() => transformToSeries(data?.items ?? [], mode), [data?.items, mode]);

  return (
    <div className="relative h-full">
      <BeeswarmChart
        series={series}
        onPointClick={onEventClick}
        theme={chartTheme}
        height={height}
        className={className}
        isInitialLoad={isInitialLoad}
        isUpdating={isUpdating}
        isError={isError}
        totalCount={total}
        visibleCount={total}
        emptyMessage={t("noEventsToDisplay")}
        maxClusterCount={maxClusterCount}
      />
      {total > 0 && !isInitialLoad && (
        <div className="text-muted-foreground absolute top-1 right-3 font-mono text-xs">
          {total.toLocaleString()} {t("eventsLabel")}
        </div>
      )}
    </div>
  );
};
