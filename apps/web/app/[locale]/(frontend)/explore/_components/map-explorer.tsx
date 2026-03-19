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

import { useCallback, useEffect, useRef } from "react";

import type { MapPosition } from "@/lib/hooks/use-filters";
import { useMapPosition } from "@/lib/hooks/use-filters";
import { useLoadingPhase } from "@/lib/hooks/use-loading-phase";

import { ChartSection } from "./chart-section";
import { EventsList } from "./events-list";
import type { ExplorerChromeElements } from "./explorer-shell";
import { ExplorerShell } from "./explorer-shell";
import { buildEventsDescription, getFilterLabels, getInitialViewState } from "./map-explorer-helpers";
import { MapPanel } from "./map-panel";

export const MapExplorer = () => {
  // Get map position from URL (nuqs)
  const { mapPosition, hasMapPosition, setMapPosition } = useMapPosition();

  const handleMapPositionChange = useCallback(
    (center: { lng: number; lat: number }, zoom: number) => {
      setMapPosition({ latitude: center.lat, longitude: center.lng, zoom });
    },
    [setMapPosition]
  );

  return (
    <ExplorerShell explorerOptions={{ onMapPositionChange: handleMapPositionChange }}>
      {(chrome) => <MapExplorerContent chrome={chrome} hasMapPosition={hasMapPosition} mapPosition={mapPosition} />}
    </ExplorerShell>
  );
};

// ---------------------------------------------------------------------------
// Inner component — receives explorer state from ExplorerShell and can use hooks
// ---------------------------------------------------------------------------

interface MapExplorerContentProps {
  chrome: ExplorerChromeElements;
  hasMapPosition: boolean;
  mapPosition: MapPosition;
}

const MapExplorerContent = ({ chrome, hasMapPosition, mapPosition }: MapExplorerContentProps) => {
  const { explorer, filterPanel, mobileFilters } = chrome;
  const { map, filters: filterState, selection, data, ui } = explorer;
  const { filters } = filterState;
  const { openEvent } = selection;
  const {
    catalogs,
    datasets,
    clusters,
    clustersLoading,
    clusterStats,
    boundsData,
    isLoadingInitialBounds,
    events,
    eventsLoading,
    totalEventsData,
  } = data;
  const { setFilterDrawerOpen } = ui;
  const {
    ref: mapRef,
    simpleBounds,
    debouncedSimpleBounds,
    showZoomToData,
    handleZoomToData,
    handleBoundsChange,
  } = map;

  const gridRef = useRef<HTMLDivElement>(null);

  // Close filter drawer on mobile on first mount for better UX
  useEffect(() => {
    if (globalThis.matchMedia("(max-width: 768px)").matches) {
      setFilterDrawerOpen(false);
    }
  }, [setFilterDrawerOpen]);

  // Convert URL map position to initial view state for ClusteredMap
  const initialViewState = getInitialViewState(hasMapPosition, mapPosition);

  // Loading states — shared hook tracks "has loaded at least once"
  const { isInitialLoad, isUpdating } = useLoadingPhase(eventsLoading || clustersLoading);

  // ResizeObserver to trigger map resize during grid transitions
  useEffect(() => {
    const mapContainer = gridRef.current?.querySelector('[class*="h-full"]');
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
  const filterLabels = getFilterLabels(filters, catalogs, datasets);

  return (
    <>
      {/* Desktop: Flex layout - both map and list shrink proportionally when filters open */}
      <div ref={gridRef} className="hidden flex-1 overflow-hidden md:flex">
        {/* Map Panel - takes half of available space */}
        <MapPanel
          mapRef={mapRef}
          clusters={clusters}
          clusterStats={clusterStats}
          onBoundsChange={handleBoundsChange}
          initialBounds={boundsData?.bounds}
          initialViewState={initialViewState}
          isLoadingBounds={isLoadingInitialBounds}
          showZoomToData={showZoomToData}
          onZoomToData={handleZoomToData}
          className="relative h-full min-w-0 flex-1 transition-all duration-500 ease-in-out"
        />

        {/* Content Panel - takes half of available space */}
        <div className="min-w-0 flex-1 overflow-y-auto border-l transition-all duration-500 ease-in-out [scrollbar-gutter:stable]">
          <div className="p-6">
            {/* Chart Section - height matches list explorer (50vh - p-6 padding) */}
            <div className="mb-6 h-[calc(50vh-3rem)] min-h-[252px]">
              <ChartSection bounds={debouncedSimpleBounds} fillHeight />
            </div>

            {/* Events List */}
            <div className="border-t pt-6">
              <p className="text-muted-foreground mb-4 text-sm">
                {buildEventsDescription(events.length, totalEventsData?.total, filterLabels, simpleBounds != null)}
              </p>
              <EventsList
                events={events}
                isInitialLoad={isInitialLoad}
                isUpdating={isUpdating}
                onEventClick={openEvent}
              />
            </div>
          </div>
        </div>

        {/* Filter Panel - fixed width with slide animation */}
        {filterPanel("bg-background h-full overflow-hidden")}
      </div>

      {/* Mobile: Stacked layout with overlay filter drawer */}
      <div className="flex flex-1 flex-col overflow-hidden md:hidden">
        {/* Map takes top half */}
        <MapPanel
          clusters={clusters}
          clusterStats={clusterStats}
          onBoundsChange={handleBoundsChange}
          initialBounds={boundsData?.bounds}
          initialViewState={initialViewState}
          isLoadingBounds={isLoadingInitialBounds}
          showZoomToData={showZoomToData}
          onZoomToData={handleZoomToData}
          className="relative h-1/2 min-h-0"
        />

        {/* Content takes bottom half */}
        <div className="h-1/2 min-h-0 overflow-y-auto border-t">
          <div className="p-4">
            <div className="mb-4">
              <ChartSection bounds={debouncedSimpleBounds} />
            </div>

            <div className="border-t pt-4">
              <p className="text-muted-foreground mb-4 text-sm">
                {buildEventsDescription(events.length, totalEventsData?.total, filterLabels, simpleBounds != null)}
              </p>
              <EventsList
                events={events}
                isInitialLoad={isInitialLoad}
                isUpdating={isUpdating}
                onEventClick={openEvent}
              />
            </div>
          </div>
        </div>

        {/* Mobile: Bottom sheet filter drawer */}
        {mobileFilters}
      </div>
    </>
  );
};
