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

import { useDataSourcesQuery } from "@/lib/hooks/use-data-sources-query";
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
  /** Number of top groups to show before merging into "Other" */
  maxGroups?: number;
  /** Callback to change maxGroups */
  onMaxGroupsChange?: (n: number) => void;
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

/** Build BeeswarmDataItem[] from a group's items. */
const buildSeriesData = (
  group: { name: string; items: TemporalClusterItem[] },
  mode: "individual" | "clustered",
  colorIdx: number,
  maxClusterCount: { value: number }
): BeeswarmDataItem[] =>
  group.items.map((item, i) => {
    if (item.count > maxClusterCount.value) maxClusterCount.value = item.count;
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

/** Transform API response to BeeswarmSeries[], merging small groups into "Other". */
const transformToSeries = (
  items: TemporalClusterItem[],
  mode: "individual" | "clustered",
  topN: number
): { series: BeeswarmSeries[]; maxClusterCount: number } => {
  if (items.length === 0) return { series: [], maxClusterCount: 1 };

  const groups = groupByField(items);

  // Sort groups by total item count, take top N
  const sorted = [...groups.entries()].sort((a, b) => b[1].items.length - a[1].items.length);
  const topGroups = sorted.slice(0, topN);
  const otherGroups = sorted.slice(topN);

  const series: BeeswarmSeries[] = [];
  const maxRef = { value: 1 };

  for (let i = 0; i < topGroups.length; i++) {
    const [, group] = topGroups[i]!;
    const color = DATASET_COLORS[i % DATASET_COLORS.length] ?? "#0089a7";
    series.push({ name: group.name, color, data: buildSeriesData(group, mode, i, maxRef) });
  }

  // Merge remaining into "Other"
  if (otherGroups.length > 0) {
    const otherItems = otherGroups.flatMap(([, g]) => g.items);
    const otherGroup = { name: `Other (${otherGroups.length})`, items: otherItems };
    const colorIdx = topGroups.length;
    series.push({ name: otherGroup.name, color: "#9ca3af", data: buildSeriesData(otherGroup, mode, colorIdx, maxRef) });
  }

  return { series, maxClusterCount: maxRef.value };
};

export interface GroupByOption {
  value: string;
  label: string;
  description?: string;
}

/** Settings panel for beeswarm expert controls */
const BeeswarmSettings = ({
  threshold,
  setThreshold,
  buckets,
  setBuckets,
  clusterMin,
  setClusterMin,
  clusterMax,
  setClusterMax,
  maxGroups,
  onMaxGroupsChange,
  isGrouped,
  mode,
  itemCount,
  t,
}: {
  threshold: number;
  setThreshold: (v: number) => void;
  buckets: number;
  setBuckets: (v: number) => void;
  clusterMin: number;
  setClusterMin: (v: number) => void;
  clusterMax: number;
  setClusterMax: (v: number) => void;
  maxGroups: number;
  onMaxGroupsChange?: (v: number) => void;
  isGrouped: boolean;
  mode: string;
  itemCount: number;
  t: ReturnType<typeof useTranslations<"Explore">>;
}) => (
  <div className="bg-background/95 border-border absolute top-0 right-0 z-10 flex w-56 flex-col gap-3 rounded-md border p-3 shadow-md backdrop-blur-sm">
    {isGrouped && onMaxGroupsChange && (
      <LabeledSlider
        label={t("beeswarmTopGroups")}
        value={maxGroups}
        onChange={onMaxGroupsChange}
        min={2}
        max={10}
        step={1}
        minLabel={t("beeswarmFewer")}
        maxLabel={t("beeswarmMore")}
      />
    )}
    <LabeledSlider
      label={t("beeswarmDetailThreshold")}
      value={threshold}
      onChange={setThreshold}
      min={100}
      max={2000}
      step={100}
      minLabel={t("beeswarmCluster")}
      maxLabel={t("beeswarmIndividual")}
    />
    <LabeledSlider
      label={t("beeswarmTimeBuckets")}
      value={buckets}
      onChange={setBuckets}
      min={10}
      max={150}
      step={10}
      minLabel={t("beeswarmFewer")}
      maxLabel={t("beeswarmMore")}
    />
    <LabeledSlider
      label={t("beeswarmClusterMin")}
      value={clusterMin}
      onChange={setClusterMin}
      min={4}
      max={30}
      step={2}
    />
    <LabeledSlider
      label={t("beeswarmClusterMax")}
      value={clusterMax}
      onChange={setClusterMax}
      min={20}
      max={80}
      step={5}
    />
    <div className="text-muted-foreground text-center font-mono text-[10px]">
      {mode === "individual" ? t("beeswarmShowingDots") : t("beeswarmClusters", { count: itemCount })}
    </div>
  </div>
);

/** Build a short preview string from an enum field's top values. */
const buildFieldDescription = (field: { cardinality: number; values: Array<{ value: string }> }): string => {
  const preview = field.values
    .slice(0, 3)
    .map((v) => v.value)
    .join(", ");
  const suffix = field.cardinality > 3 ? ", \u2026" : "";
  return `${field.cardinality} values \u00b7 ${preview}${suffix}`;
};

/** Hook to build groupBy dropdown options, hiding options that would produce only 1 group. */
export const useGroupByOptions = (selectedDatasetIds: string[]): GroupByOption[] => {
  const t = useTranslations("Explore");
  const singleDatasetId = selectedDatasetIds.length === 1 ? selectedDatasetIds[0]! : null;
  const enumFieldsQuery = useDatasetEnumFieldsQuery(singleDatasetId);
  const dataSourcesQuery = useDataSourcesQuery();

  return useMemo<GroupByOption[]>(() => {
    const opts: GroupByOption[] = [{ value: "none", label: t("groupByNone"), description: t("groupByNoneDesc") }];

    // Show "Dataset" only when 2+ datasets are selected
    if (selectedDatasetIds.length !== 1) {
      opts.push({ value: "dataset", label: t("groupByDataset"), description: t("groupByDatasetDesc") });
    }

    // Show "Catalog" only when selected datasets span 2+ catalogs
    if (dataSourcesQuery.data) {
      const catalogIds = new Set(
        selectedDatasetIds
          .map((id) => dataSourcesQuery.data.datasets.find((d) => String(d.id) === id)?.catalogId)
          .filter((cid): cid is number => cid != null)
      );
      if (catalogIds.size > 1) {
        opts.push({ value: "catalog", label: t("groupByCatalog"), description: t("groupByCatalogDesc") });
      }
    }

    if (enumFieldsQuery.data) {
      for (const field of enumFieldsQuery.data) {
        opts.push({ value: field.path, label: field.label, description: buildFieldDescription(field) });
      }
    }
    return opts;
  }, [enumFieldsQuery.data, dataSourcesQuery.data, selectedDatasetIds, t]);
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
  maxGroups = 10,
  onMaxGroupsChange,
}: Readonly<EventBeeswarmProps>) => {
  const chartTheme = useChartTheme();
  const t = useTranslations("Explore");
  const { filters } = useFilters();
  const scope = useViewScope();

  const defaults = DEFAULTS[variant];
  const [threshold, setThreshold] = useState<number>(defaults.individualThreshold);
  const [buckets, setBuckets] = useState<number>(defaults.targetBuckets);
  const [clusterMin, setClusterMin] = useState(4);
  const [clusterMax, setClusterMax] = useState(40);
  const groupBy = externalGroupBy ?? "none";

  // Debounce API-triggering params to avoid excessive requests while dragging sliders
  const debouncedThreshold = useDebounce(threshold, 400);
  const debouncedBuckets = useDebounce(buckets, 400);

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

  const { series, maxClusterCount } = useMemo(
    () => transformToSeries(data?.items ?? [], mode, maxGroups),
    [data?.items, mode, maxGroups]
  );

  // Auto rows layout in fullscreen when multiple groups exist
  const hasMultipleGroups = series.length > 1;
  const layout = variant === "fullscreen" && hasMultipleGroups ? "rows" : "merged";

  // Ensure enough height per row so rows aren't compressed; scroll if needed
  const MIN_ROW_HEIGHT = 80;
  const minRowsHeight = layout === "rows" ? series.length * MIN_ROW_HEIGHT + 40 : 0;
  const effectiveHeight = minRowsHeight > 0 ? Math.max(minRowsHeight, typeof height === "number" ? height : 0) : height;
  const needsScroll = layout === "rows" && typeof height === "string" && minRowsHeight > 0;

  return (
    <div
      className={`relative ${needsScroll ? "overflow-y-auto" : ""}`}
      style={needsScroll ? { height } : { height: "100%" }}
    >
      <BeeswarmChart
        series={series}
        onPointClick={onEventClick}
        theme={chartTheme}
        height={effectiveHeight}
        className={className}
        isInitialLoad={isInitialLoad}
        isUpdating={isUpdating}
        isError={isError}
        totalCount={total}
        visibleCount={total}
        layout={layout}
        emptyMessage={t("noEventsToDisplay")}
        maxClusterCount={maxClusterCount}
        clusterMinSize={clusterMin}
        clusterMaxSize={clusterMax}
      />

      {variant === "fullscreen" && total > 0 && !isInitialLoad && (
        <div className="text-muted-foreground absolute right-3 bottom-7 font-mono text-xs">
          {total.toLocaleString()} {t("eventsLabel")}
        </div>
      )}

      {showControls && (
        <BeeswarmSettings
          threshold={threshold}
          setThreshold={setThreshold}
          buckets={buckets}
          setBuckets={setBuckets}
          clusterMin={clusterMin}
          setClusterMin={setClusterMin}
          clusterMax={clusterMax}
          setClusterMax={setClusterMax}
          maxGroups={maxGroups}
          onMaxGroupsChange={onMaxGroupsChange}
          isGrouped={groupBy !== "none"}
          mode={mode}
          itemCount={data?.items.length ?? 0}
          t={t}
        />
      )}
    </div>
  );
};

/** Settings button to be placed in the header bar next to fullscreen */
export const BeeswarmSettingsButton = ({ showControls, onToggle }: { showControls: boolean; onToggle: () => void }) => {
  const t = useTranslations("Explore");
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`text-muted-foreground hover:text-foreground rounded p-1 transition-colors ${showControls ? "bg-muted" : ""}`}
      aria-label={t("beeswarmChartSettings")}
    >
      <Settings2 className="h-4 w-4" />
    </button>
  );
};
