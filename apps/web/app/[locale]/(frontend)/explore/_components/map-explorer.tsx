/**
 * Main map exploration interface component.
 *
 * Combines the clustered map, event list, filters, and histogram into
 * a unified exploration interface. Manages state synchronization between
 * map viewport, filters, and data queries.
 *
 * @module
 * @category Components
 */
"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { useUIStore } from "@/lib/store";

import { ChartSection } from "./chart-section";
import { EventsList } from "./events-list";
import { buildEventsDescription, getFilterLabels, type TranslateFn } from "./explorer-helpers";
import type { ExplorerChromeElements } from "./explorer-shell";
import { ExplorerShell } from "./explorer-shell";
import { MapPanel } from "./map-panel";
import { useExplorerMapPosition } from "./use-explorer-map-position";

export const MapExplorer = () => {
  const { initialViewState, explorerOptions } = useExplorerMapPosition();

  return (
    <ExplorerShell explorerOptions={explorerOptions}>
      {(chrome) => <MapExplorerContent chrome={chrome} initialViewState={initialViewState} />}
    </ExplorerShell>
  );
};

// ---------------------------------------------------------------------------
// Inner component — receives explorer state from ExplorerShell and can use hooks
// ---------------------------------------------------------------------------

interface MapExplorerContentProps {
  chrome: ExplorerChromeElements;
  initialViewState: { latitude: number; longitude: number; zoom: number } | null;
}

const MapExplorerContent = ({ chrome, initialViewState }: MapExplorerContentProps) => {
  const locale = useLocale();
  const t = useTranslations("Explore");
  const { explorer, filterPanel } = chrome;
  const { map, filters: filterState, selection, data, scope } = explorer;
  const { filters } = filterState;
  const { openEvent } = selection;
  const {
    catalogs,
    datasets,
    clusters,
    clusterChildren,
    clusterSummary,
    clusterSummaryLoading,
    clustersFetching,
    clustersDataUpdatedAt,
    effectiveBounds: chartBounds,
    boundsData,
    isLoadingInitialBounds,
    events,
    eventsData,
    eventsFetching,
    eventsDataUpdatedAt,
    totalEventsData,
    hasTemporalData,
  } = data;
  const { ref: mapRef, simpleBounds, showZoomToData, handleZoomToData, handleBoundsChange } = map;

  const clusterFilterCells = useUIStore((s) => s.ui.clusterFilterCells);
  const setClusterFilterCells = useUIStore((s) => s.setClusterFilterCells);
  const gridRef = useRef<HTMLDivElement>(null);

  // Loading phase derived from React Query's native fields:
  //   - isInitialLoad: any query has no successful fetch yet (dataUpdatedAt === 0)
  //   - isUpdating: at least one query is fetching while stale data is on screen
  const isInitialLoad = eventsDataUpdatedAt === 0 || clustersDataUpdatedAt === 0;
  const isUpdating = (eventsFetching || clustersFetching) && !isInitialLoad;

  // ResizeObserver to trigger map resize during grid transitions
  useEffect(() => {
    const mapContainer = gridRef.current?.querySelector("[data-map-resize-observer-target]");
    if (!mapContainer) return;

    let rafId: number;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        mapRef.current?.resize();
      });
    });

    observer.observe(mapContainer);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [mapRef]);

  // Get human-readable filter labels (uses helper function)
  const filterLabels = getFilterLabels(filters, catalogs, datasets, locale);

  // Desktop: Flex layout - both map and list shrink proportionally when filters open
  return (
    <div ref={gridRef} className="flex flex-1 overflow-hidden">
      <MapPanel
        mapRef={mapRef}
        clusters={clusters}
        clusterChildren={clusterChildren}
        clusterSummary={clusterSummary}
        clusterSummaryLoading={clusterSummaryLoading}
        onBoundsChange={handleBoundsChange}
        onEventClick={openEvent}
        initialBounds={boundsData?.bounds}
        initialViewState={initialViewState}
        isLoadingBounds={isLoadingInitialBounds}
        showZoomToData={showZoomToData}
        onZoomToData={handleZoomToData}
        className="relative h-full min-w-0 flex-1 transition-[flex,width] duration-500 ease-in-out"
        scope={scope}
      />

      <div className="min-w-0 flex-1 overflow-y-auto border-l transition-[flex,width] duration-500 ease-in-out [scrollbar-gutter:stable]">
        <div className="p-6">
          <p className="text-foreground mb-4 text-base font-medium">
            {buildEventsDescription(
              eventsData?.total ?? events.length,
              totalEventsData?.total,
              filterLabels,
              simpleBounds != null,
              (k, v) => (t as TranslateFn)(k, v)
            )}
          </p>
          <div className="mb-6 max-h-[calc(55vh-3rem)] min-h-0">
            <ChartSection bounds={chartBounds} fillHeight hasTemporalData={hasTemporalData} onEventClick={openEvent} />
          </div>

          <div className="border-t pt-6">
            {clusterFilterCells && (
              <div className="bg-primary/10 text-primary mb-3 flex items-center gap-2 rounded px-3 py-2 text-xs font-medium">
                <span>{t("clusterFilterActiveDescription")}</span>
                <button
                  type="button"
                  onClick={() => setClusterFilterCells(null)}
                  className="hover:text-primary/70 ml-auto text-xs underline transition-colors"
                >
                  {t("clearClusterFilter")}
                </button>
              </div>
            )}
            <EventsList
              events={events}
              isInitialLoad={isInitialLoad}
              isUpdating={isUpdating}
              onEventClick={openEvent}
              hideDatasetBadge={filters.datasets.length === 1}
            />
          </div>
        </div>
      </div>

      {filterPanel("bg-background h-full overflow-hidden")}
    </div>
  );
};
