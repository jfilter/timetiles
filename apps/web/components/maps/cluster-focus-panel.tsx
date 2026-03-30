/**
 * Mini dashboard panel shown when a cluster is focused on the map.
 *
 * Displays: dataset/catalog breakdown, temporal range, category facets,
 * and a preview list of events within the cluster.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui/components/button";
import { Calendar, Database, Filter, Layers, Loader2, Tag, X, ZoomIn } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ClusterSummaryResponse } from "@/lib/schemas/events";

interface ClusterFocusPanelProps {
  count: number;
  summary: ClusterSummaryResponse | undefined;
  isLoading: boolean;
  onZoomIn: () => void;
  onFilterToCluster: () => void;
  onClose: () => void;
}

export const ClusterFocusPanel = ({
  count,
  summary,
  isLoading,
  onZoomIn,
  onFilterToCluster,
  onClose,
}: ClusterFocusPanelProps) => {
  const t = useTranslations("Explore");

  return (
    <div className="bg-background/95 border-border flex w-64 max-w-[calc(100%-2rem)] flex-col rounded-lg border shadow-lg backdrop-blur-sm">
      {/* Header */}
      <div className="border-border border-b px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-foreground text-sm font-medium">
            {summary?.locationCount != null && summary.locationCount > 1
              ? t("clusterFocusCountWithLocations", { count, locations: summary.locationCount })
              : t("clusterFocusCount", { count })}
          </span>
          <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </div>
        <div className="mt-1.5 flex flex-col gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full justify-start gap-1.5 text-xs"
            onClick={onFilterToCluster}
          >
            <Filter className="size-3" />
            {t("clusterFilterEvents")}
          </Button>
          <Button variant="outline" size="sm" className="h-7 w-full justify-start gap-1.5 text-xs" onClick={onZoomIn}>
            <ZoomIn className="size-3" />
            {t("clusterZoomIn")}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="max-h-80 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
          </div>
        )}

        {!isLoading && summary && (
          <div className="flex flex-col divide-y">
            {/* Temporal range */}
            {summary.temporalRange && (
              <SectionRow icon={Calendar} label={t("clusterTemporalRange")}>
                <span className="text-foreground text-xs">
                  {formatDateRange(summary.temporalRange.earliest, summary.temporalRange.latest)}
                </span>
              </SectionRow>
            )}

            {/* Datasets */}
            {summary.datasets.length > 0 && (
              <SectionRow icon={Database} label={t("clusterDatasets")}>
                <div className="flex flex-col gap-1">
                  {summary.datasets.map((ds) => (
                    <div key={ds.id} className="flex items-center justify-between gap-2">
                      <span className="text-foreground truncate text-xs">{ds.name}</span>
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">{ds.count}</span>
                    </div>
                  ))}
                </div>
              </SectionRow>
            )}

            {/* Catalogs (only if more than 1) */}
            {summary.catalogs.length > 1 && (
              <SectionRow icon={Layers} label={t("clusterCatalogs")}>
                <div className="flex flex-col gap-1">
                  {summary.catalogs.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between gap-2">
                      <span className="text-foreground truncate text-xs">{cat.name}</span>
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">{cat.count}</span>
                    </div>
                  ))}
                </div>
              </SectionRow>
            )}

            {/* Categories */}
            {summary.categories.length > 0 && (
              <SectionRow icon={Tag} label={t("clusterCategories")}>
                <div className="flex flex-col gap-1.5">
                  {summary.categories.map((cat) => (
                    <div key={cat.field}>
                      <span className="text-muted-foreground text-[10px] tracking-wide uppercase">{cat.field}</span>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {cat.values.map((v) => (
                          <span key={v.value} className="bg-muted text-foreground rounded px-1.5 py-0.5 text-[10px]">
                            {v.value}
                            <span className="text-muted-foreground ml-1">{v.count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionRow>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/** Reusable section row with icon and label. */
const SectionRow = ({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="px-3 py-2">
    <div className="text-muted-foreground mb-1 flex items-center gap-1.5">
      <Icon className="size-3" />
      <span className="text-[10px] font-medium tracking-wide uppercase">{label}</span>
    </div>
    {children}
  </div>
);

/** Format ISO date string to short locale format. */
const formatShortDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
};

/** Format a date range compactly. */
const formatDateRange = (earliest: string, latest: string): string => {
  const from = formatShortDate(earliest);
  const to = formatShortDate(latest);
  return from === to ? from : `${from} – ${to}`;
};
