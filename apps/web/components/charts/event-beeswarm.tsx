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

import { useDatasetEnumFieldsQuery } from "@/lib/hooks/use-dataset-enum-fields";
import { useDebounce } from "@/lib/hooks/use-debounce";
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
  /** Group by field (controlled by parent via URL param) */
  groupBy?: string;
  /** Callback to change groupBy */
  setGroupBy?: (value: string) => void;
}

/** Default cluster options per variant */
const DEFAULTS = {
  compact: { individualThreshold: 500, targetBuckets: 40 },
  fullscreen: { individualThreshold: 1000, targetBuckets: 80 },
} as const;

/**
 * Expand a group name into individual group names.
 * JSON arrays like '["Cruise missile", "Loitering munition"]' become
 * two separate entries. Scalar strings return as single-element array.
 * '[]' or '(empty)' → ['(no value)'].
 */
export const expandGroupNames = (name: string): string[] => {
  if (!name || name === "(empty)" || name === "[]") return ["(no value)"];
  if (name.startsWith("[")) {
    try {
      const arr = JSON.parse(name) as unknown[];
      if (Array.isArray(arr)) {
        const strings = arr.filter((v): v is string => typeof v === "string" && v.length > 0);
        return strings.length > 0 ? strings : ["(no value)"];
      }
    } catch {
      // not JSON, use as-is
    }
  }
  return [name];
};

/** Group items by groupId, expanding multi-value fields (JSON arrays) into separate groups. */
const groupByField = (items: TemporalClusterItem[]): Map<string, { name: string; items: TemporalClusterItem[] }> => {
  const groups = new Map<string, { name: string; items: TemporalClusterItem[] }>();
  for (const item of items) {
    const names = expandGroupNames(item.groupName);
    for (const name of names) {
      if (!groups.has(name)) {
        groups.set(name, { name, items: [] });
      }
      groups.get(name)!.items.push(item);
    }
  }
  return groups;
};

/** Transform API response to BeeswarmSeries[] for the presentational chart. */
const transformToSeries = (
  items: TemporalClusterItem[],
  mode: "individual" | "clustered"
): { series: BeeswarmSeries[]; maxClusterCount: number } => {
  if (items.length === 0) return { series: [], maxClusterCount: 1 };

  const groups = groupByField(items);
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

export interface GroupByOption {
  value: string;
  label: string;
}

/** Settings panel for beeswarm expert controls */
const BeeswarmSettings = ({
  threshold,
  setThreshold,
  buckets,
  setBuckets,
  dotSize,
  setDotSize,
  clusterMin,
  setClusterMin,
  clusterMax,
  setClusterMax,
  groupBy,
  setGroupBy,
  groupByOptions,
  mode,
  itemCount,
}: {
  threshold: number;
  setThreshold: (v: number) => void;
  buckets: number;
  setBuckets: (v: number) => void;
  dotSize: number;
  setDotSize: (v: number) => void;
  clusterMin: number;
  setClusterMin: (v: number) => void;
  clusterMax: number;
  setClusterMax: (v: number) => void;
  groupBy: string;
  setGroupBy: (v: string) => void;
  groupByOptions: GroupByOption[];
  mode: string;
  itemCount: number;
}) => (
  <div className="bg-background/95 border-border absolute top-0 right-0 z-10 flex w-56 flex-col gap-3 rounded-md border p-3 shadow-md backdrop-blur-sm">
    {/* Group by selector */}
    <div>
      <div className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wide uppercase">Group by</div>
      <select
        value={groupBy}
        onChange={(e) => setGroupBy(e.target.value)}
        className="border-input bg-background text-foreground w-full rounded border px-2 py-1 text-xs"
      >
        {groupByOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
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
    <LabeledSlider label="Cluster min" value={clusterMin} onChange={setClusterMin} min={4} max={30} step={2} />
    <LabeledSlider label="Cluster max" value={clusterMax} onChange={setClusterMax} min={20} max={80} step={5} />
    <div className="text-muted-foreground text-center font-mono text-[10px]">
      {mode === "individual" ? "Showing dots" : `${itemCount} clusters`}
    </div>
  </div>
);

/** Hook to build groupBy dropdown options from enum fields. */
export const useGroupByOptions = (singleDatasetId: string | null): GroupByOption[] => {
  const enumFieldsQuery = useDatasetEnumFieldsQuery(singleDatasetId);
  return useMemo<GroupByOption[]>(() => {
    const opts: GroupByOption[] = [
      { value: "none", label: "No grouping" },
      { value: "dataset", label: "Dataset" },
      { value: "catalog", label: "Catalog" },
    ];
    if (enumFieldsQuery.data) {
      for (const field of enumFieldsQuery.data) {
        opts.push({ value: field.path, label: field.label });
      }
    }
    return opts;
  }, [enumFieldsQuery.data]);
};

// oxlint-disable-next-line complexity
export const EventBeeswarm = ({
  bounds,
  height = 300,
  className,
  onEventClick,
  variant = "compact",
  showControls = false,
  groupBy: externalGroupBy,
  setGroupBy: externalSetGroupBy,
}: Readonly<EventBeeswarmProps>) => {
  const chartTheme = useChartTheme();
  const t = useTranslations("Explore");
  const { filters } = useFilters();
  const scope = useViewScope();

  const defaults = DEFAULTS[variant];
  const [threshold, setThreshold] = useState<number>(defaults.individualThreshold);
  const [buckets, setBuckets] = useState<number>(defaults.targetBuckets);
  const [dotSize, setDotSize] = useState(8);
  const [clusterMin, setClusterMin] = useState(10);
  const [clusterMax, setClusterMax] = useState(40);
  const [internalGroupBy, setInternalGroupBy] = useState("dataset");
  // Use external groupBy from parent (URL param) or fallback to internal state
  const groupBy = externalGroupBy ?? internalGroupBy;
  const setGroupBy = externalSetGroupBy ?? setInternalGroupBy;

  // Debounce API-triggering params to avoid excessive requests while dragging sliders
  const debouncedThreshold = useDebounce(threshold, 400);
  const debouncedBuckets = useDebounce(buckets, 400);

  // Build groupBy options from enum fields (when single dataset selected)
  const singleDatasetId = filters.datasets.length === 1 ? String(filters.datasets[0]) : null;
  const groupByOptions = useGroupByOptions(singleDatasetId);

  const clusterOptions: TemporalClusterOptions = {
    individualThreshold: debouncedThreshold,
    targetBuckets: debouncedBuckets,
    groupBy: groupBy === "none" ? undefined : groupBy,
  };

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

  // Auto rows layout in fullscreen when multiple groups exist
  const hasMultipleGroups = series.length > 1;
  const layout = variant === "fullscreen" && hasMultipleGroups ? "rows" : "merged";

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
        layout={layout}
        emptyMessage={t("noEventsToDisplay")}
        maxClusterCount={maxClusterCount}
        dotSizeOverride={dotSize}
        clusterMinSize={clusterMin}
        clusterMaxSize={clusterMax}
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
          clusterMin={clusterMin}
          setClusterMin={setClusterMin}
          clusterMax={clusterMax}
          setClusterMax={setClusterMax}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          groupByOptions={groupByOptions}
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
