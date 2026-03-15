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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useEventsListQuery, useEventsTotalQuery } from "@/lib/hooks/use-events-queries";
import { useMapPosition } from "@/lib/hooks/use-filters";
import type { EventListItem } from "@/lib/schemas/events";
import { useUIStore } from "@/lib/store";

import { ChartSection } from "./chart-section";
import { EventDetailModal } from "./event-detail-modal";
import { EventsList } from "./events-list";
import { FilterDrawer } from "./filter-drawer";
import { FilterPanel } from "./filter-panel";
import {
  buildEventsDescription,
  getFilterLabels,
  getInitialViewState,
  getLoadingStates,
  isDataBoundsOutsideViewport,
  shouldShowZoomToData,
} from "./map-explorer-helpers";
import { MapPanel } from "./map-panel";
import { MobileFilterSheet } from "./mobile-filter-sheet";
import { useExplorerState } from "./use-explorer-state";

/** Stable empty array to avoid creating a new reference when eventsData is null. */
const EMPTY_EVENTS: EventListItem[] = [];

export const MapExplorer = () => {
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Ref for resize handling
  const gridRef = useRef<HTMLDivElement>(null);

  // Get map position from URL (nuqs)
  const { mapPosition, hasMapPosition, setMapPosition } = useMapPosition();

  const handleMapPositionChange = useCallback(
    (center: { lng: number; lat: number }, zoom: number) => {
      setMapPosition({ latitude: center.lat, longitude: center.lng, zoom });
    },
    [setMapPosition]
  );

  // Shared explorer state
  const explorer = useExplorerState({ onMapPositionChange: handleMapPositionChange });
  const { map, filters: filterState, selection, data, ui, scope } = explorer;
  const { filters, activeFilterCount } = filterState;
  const { selectedEventId, openEvent, closeEvent } = selection;
  const {
    catalogs,
    datasets,
    clusters,
    clustersLoading,
    clusterStats,
    boundsData,
    boundsLoading,
    isLoadingInitialBounds,
  } = data;
  const { isFilterDrawerOpen, toggleFilterDrawer, setFilterDrawerOpen } = ui;
  const {
    ref: mapRef,
    simpleBounds,
    debouncedSimpleBounds,
    hasUserPanned,
    handleZoomToData,
    handleBoundsChange,
    bounds: mapBounds,
  } = map;

  // Close filter drawer on mobile on first mount for better UX
  useEffect(() => {
    if (globalThis.matchMedia("(max-width: 768px)").matches) {
      setFilterDrawerOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Convert URL map position to initial view state for ClusteredMap
  const initialViewState = useMemo(
    () => getInitialViewState(hasMapPosition, mapPosition),
    [hasMapPosition, mapPosition]
  );

  // React Query hooks for data fetching - use simple bounds directly for better cache key comparison
  const { data: eventsData, isLoading: eventsLoading } = useEventsListQuery(
    filters,
    debouncedSimpleBounds,
    1000,
    true,
    scope
  );

  // Fetch total count without bounds filter for global statistics
  const { data: totalEventsData } = useEventsTotalQuery(filters, true, scope);

  // Extract data from queries
  const events = eventsData?.events ?? EMPTY_EVENTS;
  const isLoading = eventsLoading || clustersLoading;

  // Track loading states
  const { isInitialLoad, isUpdating, shouldMarkLoaded } = getLoadingStates(isLoading, hasLoadedOnce);

  // Mark as loaded once we have data
  useEffect(() => {
    if (shouldMarkLoaded) setHasLoadedOnce(true);
  }, [shouldMarkLoaded]);

  // Update map stats in Zustand store when data changes
  // Use totalEventsData.total for absolute count (not viewport-bounded)
  const setMapStats = useUIStore((state) => state.setMapStats);
  useEffect(() => {
    if (eventsData != null && totalEventsData != null) {
      setMapStats({ visibleEvents: events.length, totalEvents: totalEventsData.total });
    }
  }, [events.length, eventsData, totalEventsData, setMapStats]);

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

  // Show "zoom to data" button when:
  // 1. User has panned away from data, OR
  // 2. Data bounds exist and map viewport doesn't fully contain them (e.g., after filter change)
  const dataBoundsOutsideViewport = useMemo(
    () => isDataBoundsOutsideViewport(boundsData?.bounds, mapBounds),
    [boundsData, mapBounds]
  );

  const showZoomToData = shouldShowZoomToData(
    hasUserPanned,
    dataBoundsOutsideViewport,
    boundsData?.bounds != null,
    boundsLoading
  );

  // Get human-readable filter labels (uses helper function)
  const filterLabels = useMemo(() => getFilterLabels(filters, catalogs, datasets), [filters, catalogs, datasets]);

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
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
        <FilterPanel isOpen={isFilterDrawerOpen} className="bg-background h-full overflow-hidden">
          <FilterDrawer />
        </FilterPanel>
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
        <MobileFilterSheet
          isOpen={isFilterDrawerOpen}
          onClose={toggleFilterDrawer}
          onOpen={toggleFilterDrawer}
          activeFilterCount={activeFilterCount}
        >
          <FilterDrawer />
        </MobileFilterSheet>
      </div>

      {/* Event Detail Modal */}
      <EventDetailModal eventId={selectedEventId} onClose={closeEvent} />
    </div>
  );
};
