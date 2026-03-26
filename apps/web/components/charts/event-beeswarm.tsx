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
import { LabeledSlider } from "@timetiles/ui/components/labeled-slider";
import { Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { TemporalClusterOptions } from "@/lib/hooks/use-events-queries";
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
  /** Display variant — compact hides chrome, fullscreen shows event count + controls */
  variant?: "compact" | "fullscreen";
}

/** Default cluster options per variant */
const DEFAULTS = {
  compact: { individualThreshold: 500, targetBuckets: 40 },
  fullscreen: { individualThreshold: 1000, targetBuckets: 80 },
} as const;

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

export const EventBeeswarm = ({
  bounds,
  height = 300,
  className,
  onEventClick,
  variant = "compact",
}: Readonly<EventBeeswarmProps>) => {
  const chartTheme = useChartTheme();
  const t = useTranslations("Explore");
  const { filters } = useFilters();
  const scope = useViewScope();

  const defaults = DEFAULTS[variant];
  const [threshold, setThreshold] = useState<number>(defaults.individualThreshold);
  const [buckets, setBuckets] = useState<number>(defaults.targetBuckets);
  const [showControls, setShowControls] = useState(false);

  const clusterOptions: TemporalClusterOptions = { individualThreshold: threshold, targetBuckets: buckets };

  const { data, isInitialLoad, isUpdating, isError } = useTemporalClustersQuery(
    filters,
    bounds ?? null,
    true,
    scope,
    clusterOptions
  );

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

      {/* Top-right: event count + settings toggle */}
      {total > 0 && !isInitialLoad && (
        <div className="absolute top-1 right-2 flex items-center gap-2">
          {variant === "fullscreen" && (
            <span className="text-muted-foreground font-mono text-xs">
              {total.toLocaleString()} {t("eventsLabel")}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowControls((v) => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Chart settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Expert controls panel */}
      {showControls && (
        <div className="bg-background/95 border-border absolute top-7 right-2 z-10 flex flex-col gap-3 rounded-md border p-3 shadow-md backdrop-blur-sm">
          <LabeledSlider
            label="Detail threshold"
            value={threshold}
            onChange={setThreshold}
            min={100}
            max={2000}
            step={100}
            minLabel="Cluster"
            maxLabel="Individual"
            formatValue={(v) => `${v}`}
          />
          <LabeledSlider
            label="Time buckets"
            value={buckets}
            onChange={setBuckets}
            min={10}
            max={150}
            step={10}
            minLabel="Fewer"
            maxLabel="More"
            formatValue={(v) => `${v}`}
          />
          <div className="text-muted-foreground text-center font-mono text-[10px]">
            {mode === "individual" ? "Showing dots" : `${data?.items.length ?? 0} clusters`}
          </div>
        </div>
      )}
    </div>
  );
};
