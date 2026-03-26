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
  /** Display variant — compact hides chrome, fullscreen shows event count */
  variant?: "compact" | "fullscreen";
  /** Whether the expert settings panel is visible (controlled by parent) */
  showControls?: boolean;
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

/** Settings panel for beeswarm expert controls */
const BeeswarmSettings = ({
  threshold,
  setThreshold,
  buckets,
  setBuckets,
  dotSize,
  setDotSize,
  clusterSize,
  setClusterSize,
  mode,
  itemCount,
}: {
  threshold: number;
  setThreshold: (v: number) => void;
  buckets: number;
  setBuckets: (v: number) => void;
  dotSize: number;
  setDotSize: (v: number) => void;
  clusterSize: number;
  setClusterSize: (v: number) => void;
  mode: string;
  itemCount: number;
}) => (
  <div className="bg-background/95 border-border absolute top-0 right-0 z-10 flex w-56 flex-col gap-3 rounded-md border p-3 shadow-md backdrop-blur-sm">
    <LabeledSlider
      label="Detail threshold"
      value={threshold}
      onChange={setThreshold}
      min={100}
      max={2000}
      step={100}
      minLabel="Cluster"
      maxLabel="Individual"
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
    />
    <LabeledSlider label="Dot size" value={dotSize} onChange={setDotSize} min={2} max={20} step={1} />
    <LabeledSlider label="Max cluster size" value={clusterSize} onChange={setClusterSize} min={10} max={80} step={5} />
    <div className="text-muted-foreground text-center font-mono text-[10px]">
      {mode === "individual" ? "Showing dots" : `${itemCount} clusters`}
    </div>
  </div>
);

export const EventBeeswarm = ({
  bounds,
  height = 300,
  className,
  onEventClick,
  variant = "compact",
  showControls = false,
}: Readonly<EventBeeswarmProps>) => {
  const chartTheme = useChartTheme();
  const t = useTranslations("Explore");
  const { filters } = useFilters();
  const scope = useViewScope();

  const defaults = DEFAULTS[variant];
  const [threshold, setThreshold] = useState<number>(defaults.individualThreshold);
  const [buckets, setBuckets] = useState<number>(defaults.targetBuckets);
  const [dotSize, setDotSize] = useState(8);
  const [clusterSize, setClusterSize] = useState(40);

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
        dotSizeOverride={dotSize}
        clusterMaxSize={clusterSize}
      />

      {variant === "fullscreen" && total > 0 && !isInitialLoad && (
        <div className="text-muted-foreground absolute right-3 bottom-1 font-mono text-xs">
          {total.toLocaleString()} {t("eventsLabel")}
        </div>
      )}

      {showControls && (
        <BeeswarmSettings
          threshold={threshold}
          setThreshold={setThreshold}
          buckets={buckets}
          setBuckets={setBuckets}
          dotSize={dotSize}
          setDotSize={setDotSize}
          clusterSize={clusterSize}
          setClusterSize={setClusterSize}
          mode={mode}
          itemCount={data?.items.length ?? 0}
        />
      )}
    </div>
  );
};

/** Settings button to be placed in the header bar next to fullscreen */
export const BeeswarmSettingsButton = ({ showControls, onToggle }: { showControls: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`text-muted-foreground hover:text-foreground rounded p-1 transition-colors ${showControls ? "bg-muted" : ""}`}
    aria-label="Chart settings"
  >
    <Settings2 className="h-4 w-4" />
  </button>
);
