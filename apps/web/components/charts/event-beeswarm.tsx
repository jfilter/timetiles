/**
 * Beeswarm visualization showing events on a timeline.
 *
 * Shows individual event dots (true beeswarm) from the events API,
 * plus cluster circles for overflow when there are more events than loaded.
 * Uses histogram data to determine cluster sizes for unloaded events.
 *
 * @module
 * @category Components
 */
"use client";

import type { BeeswarmDataItem, BeeswarmSeries } from "@timetiles/ui/charts";
import { BeeswarmChart, DATASET_COLORS, useChartTheme } from "@timetiles/ui/charts";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { EMPTY_ARRAY } from "@/lib/constants/empty";
import { useEventsListQuery, useHistogramQuery } from "@/lib/hooks/use-events-queries";
import { useFilters } from "@/lib/hooks/use-filters";
import { useLoadingPhase } from "@/lib/hooks/use-loading-phase";
import { useViewScope } from "@/lib/hooks/use-view-scope";
import type { SimpleBounds } from "@/lib/utils/event-params";

interface EventBeeswarmProps {
  bounds?: SimpleBounds | null;
  height?: number | string;
  className?: string;
  onEventClick?: (eventId: number) => void;
}

/** Bucket width for jitter grouping (1 day in ms) */
const BUCKET_MS = 86400000;

/**
 * Compute jittered Y positions for individual event dots.
 * Uses a fixed step so dense buckets fan out tall (beeswarm shape)
 * and sparse buckets stay compact. Y-axis auto-scales to fit.
 */
const computeJitteredDots = (
  events: Array<{ id: number; eventTimestamp: string; data: Record<string, unknown> }>
): BeeswarmDataItem[] => {
  const items: BeeswarmDataItem[] = events.map((e) => ({
    x: new Date(e.eventTimestamp).getTime(),
    y: 0,
    id: e.id,
    label: (e.data?.title as string) ?? (e.data?.name as string) ?? undefined,
  }));

  // Group into day-buckets for jitter
  const buckets = new Map<number, BeeswarmDataItem[]>();
  for (const item of items) {
    const key = Math.floor(item.x / BUCKET_MS);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }

  // Find max bucket to compute step: biggest bucket fills Y range ±100
  let maxBucketSize = 1;
  for (const bucket of buckets.values()) {
    if (bucket.length > maxBucketSize) maxBucketSize = bucket.length;
  }
  // Step sized so the largest bucket spans exactly ±100
  // Small buckets will be compact near center — that's the beeswarm shape
  const step = 200 / Math.max(maxBucketSize, 2);

  for (const bucket of buckets.values()) {
    const count = bucket.length;
    for (let i = 0; i < count; i++) {
      bucket[i]!.y = (i - (count - 1) / 2) * step;
    }
  }

  return items;
};

/**
 * Compute cluster circles for histogram buckets where loaded events
 * don't cover all events (overflow indication).
 */
const computeOverflowClusters = (
  histogram: Array<{ date: string; dateEnd?: string; count: number }>,
  loadedEvents: Array<{ eventTimestamp: string }>,
  totalLoaded: number,
  totalCount: number
): BeeswarmDataItem[] => {
  if (totalLoaded >= totalCount) return [];

  // Count loaded events per histogram bucket
  const loadedPerBucket = new Map<string, number>();
  for (const event of loadedEvents) {
    const ts = new Date(event.eventTimestamp).getTime();
    for (const bucket of histogram) {
      const bucketStart = new Date(bucket.date).getTime();
      const bucketEnd = bucket.dateEnd ? new Date(bucket.dateEnd).getTime() : bucketStart + BUCKET_MS;
      if (ts >= bucketStart && ts < bucketEnd) {
        loadedPerBucket.set(bucket.date, (loadedPerBucket.get(bucket.date) ?? 0) + 1);
        break;
      }
    }
  }

  let clusterId = -1;
  const clusters: BeeswarmDataItem[] = [];

  for (const bucket of histogram) {
    const loaded = loadedPerBucket.get(bucket.date) ?? 0;
    const overflow = bucket.count - loaded;
    if (overflow <= 0) continue;

    const bucketStart = new Date(bucket.date).getTime();
    const bucketEnd = bucket.dateEnd ? new Date(bucket.dateEnd).getTime() : bucketStart + BUCKET_MS;

    clusters.push({
      x: (bucketStart + bucketEnd) / 2,
      y: 0,
      id: clusterId--,
      count: overflow,
      label: `+${overflow.toLocaleString()}`,
    });
  }

  return clusters;
};

export const EventBeeswarm = ({ bounds, height = 300, className, onEventClick }: Readonly<EventBeeswarmProps>) => {
  const chartTheme = useChartTheme();
  const t = useTranslations("Explore");
  const { filters } = useFilters();
  const scope = useViewScope();

  const eventsQuery = useEventsListQuery(filters, bounds ?? null, 1000, true, scope);
  const { isInitialLoad, isUpdating } = useLoadingPhase(eventsQuery.isLoading);

  const histogramQuery = useHistogramQuery(filters, bounds ?? null, true, scope);
  const histogram = histogramQuery.data?.histogram ?? EMPTY_ARRAY;

  const totalCount = eventsQuery.data?.total ?? 0;

  const { dotSeries, clusterSeries, maxClusterCount } = useMemo(() => {
    const loadedEvents = eventsQuery.data?.events ?? [];
    const dots = computeJitteredDots(loadedEvents);
    const clusters = computeOverflowClusters(histogram, loadedEvents, loadedEvents.length, totalCount);

    let maxC = 1;
    for (const c of clusters) {
      if (c.count && c.count > maxC) maxC = c.count;
    }

    return {
      dotSeries: { name: "Events", color: DATASET_COLORS[0] ?? "#0089a7", data: dots } as BeeswarmSeries,
      clusterSeries: { name: "Overflow", color: DATASET_COLORS[0] ?? "#0089a7", data: clusters } as BeeswarmSeries,
      maxClusterCount: maxC,
    };
  }, [eventsQuery.data?.events, histogram, totalCount]);

  const series: BeeswarmSeries[] = [];
  if (dotSeries.data.length > 0) series.push(dotSeries);
  if (clusterSeries.data.length > 0) series.push(clusterSeries);

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
        isError={eventsQuery.isError}
        totalCount={totalCount}
        visibleCount={dotSeries.data.length}
        emptyMessage={t("noEventsToDisplay")}
        maxClusterCount={maxClusterCount}
      />
      {totalCount > 0 && !isInitialLoad && (
        <div className="text-muted-foreground absolute top-1 right-3 font-mono text-xs">
          {totalCount.toLocaleString()} {t("eventsLabel")}
        </div>
      )}
    </div>
  );
};
