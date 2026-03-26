/**
 * Beeswarm visualization showing all events on a timeline.
 *
 * Uses histogram data (covers all events) to create a hybrid visualization:
 * - Small buckets (≤ threshold): individual dots stacked vertically
 * - Large buckets: a single circle sized proportionally to the count
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
import { useHistogramQuery } from "@/lib/hooks/use-events-queries";
import { useFilters } from "@/lib/hooks/use-filters";
import { useViewScope } from "@/lib/hooks/use-view-scope";
import type { SimpleBounds } from "@/lib/utils/event-params";

interface EventBeeswarmProps {
  bounds?: SimpleBounds | null;
  height?: number | string;
  className?: string;
  onEventClick?: (eventId: number) => void;
}

/** Max events per bucket to show as individual dots */
const INDIVIDUAL_THRESHOLD = 10;
/** Target Y range for jitter distribution */
const Y_RANGE = 100;

/**
 * Transform histogram buckets into beeswarm data points.
 * Small buckets → individual dots, large buckets → sized circles.
 */
const computeBeeswarmFromHistogram = (
  histogram: Array<{ date: string; dateEnd?: string; count: number }>
): { dots: BeeswarmDataItem[]; clusters: BeeswarmDataItem[]; total: number } => {
  const dots: BeeswarmDataItem[] = [];
  const clusters: BeeswarmDataItem[] = [];
  let total = 0;
  let maxCount = 1;

  for (const bucket of histogram) {
    if (bucket.count > maxCount) maxCount = bucket.count;
    total += bucket.count;
  }

  let dotId = -1; // negative IDs for non-clickable dots

  for (const bucket of histogram) {
    if (bucket.count === 0) continue;

    const bucketStart = new Date(bucket.date).getTime();
    const bucketEnd = bucket.dateEnd ? new Date(bucket.dateEnd).getTime() : bucketStart;
    const bucketMid = (bucketStart + bucketEnd) / 2;

    if (bucket.count <= INDIVIDUAL_THRESHOLD) {
      // Individual dots — spread vertically within the bucket
      const step = bucket.count > 1 ? (Y_RANGE * 2) / Math.max(bucket.count, 1) : 0;
      for (let i = 0; i < bucket.count; i++) {
        dots.push({ x: bucketMid, y: (i - (bucket.count - 1) / 2) * step, id: dotId--, label: undefined });
      }
    } else {
      // Cluster circle — size proportional to sqrt(count)
      clusters.push({
        x: bucketMid,
        y: 0,
        id: dotId--,
        count: bucket.count,
        label: `${bucket.count.toLocaleString()} events`,
      });
    }
  }

  return { dots, clusters, total };
};

export const EventBeeswarm = ({ bounds, height = 300, className, onEventClick }: Readonly<EventBeeswarmProps>) => {
  const chartTheme = useChartTheme();
  const t = useTranslations("Explore");
  const { filters } = useFilters();
  const scope = useViewScope();

  const {
    data: histogramData,
    isInitialLoad,
    isUpdating,
    isError,
  } = useHistogramQuery(filters, bounds ?? null, true, scope);

  const histogram = histogramData?.histogram ?? EMPTY_ARRAY;

  const { series, total, maxCount } = useMemo(() => {
    const { dots, clusters, total: totalCount } = computeBeeswarmFromHistogram(histogram);

    // Find max cluster count for sizing
    let maxC = 1;
    for (const c of clusters) {
      if (c.count && c.count > maxC) maxC = c.count;
    }

    const result: BeeswarmSeries[] = [];

    if (dots.length > 0) {
      result.push({ name: "Events", color: DATASET_COLORS[0] ?? "#0089a7", data: dots });
    }

    if (clusters.length > 0) {
      result.push({ name: "Clusters", color: DATASET_COLORS[0] ?? "#0089a7", data: clusters });
    }

    return { series: result, total: totalCount, maxCount: maxC };
  }, [histogram]);

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
        maxClusterCount={maxCount}
      />
      {total > 0 && !isInitialLoad && (
        <div className="text-muted-foreground absolute top-1 right-3 font-mono text-xs">
          {total.toLocaleString()} {t("eventsLabel")}
        </div>
      )}
    </div>
  );
};
