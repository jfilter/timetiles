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

import { cn } from "@timetiles/ui/lib/utils";
import type { LngLatBounds } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ClusteredMap, type ClusteredMapHandle } from "@/components/maps/clustered-map";
import { ZoomToDataButton } from "@/components/maps/zoom-to-data-button";
import { useFilters, useMapPosition, useSelectedEvent } from "@/lib/filters";
import { useDataSourcesQuery } from "@/lib/hooks/use-data-sources-query";
import { useDebounce } from "@/lib/hooks/use-debounce";
import {
  useBoundsQuery,
  useClusterStatsQuery,
  useEventsListQuery,
  useEventsTotalQuery,
  useMapClustersQuery,
} from "@/lib/hooks/use-events-queries";
import { useUIStore } from "@/lib/store";

// TODO: ActiveFilters removed for now - may add back later for filter chip UI
// import { ActiveFilters } from "./active-filters";
import { ChartSection } from "./chart-section";
import { EventDetailModal } from "./event-detail-modal";
import { EventsList } from "./events-list";
import { FilterDrawer } from "./filter-drawer";
import {
  buildEventsDescription,
  getFilterLabels,
  getInitialViewState,
  getLoadingStates,
  isDataBoundsOutsideViewport,
  shouldShowZoomToData,
  simplifyBounds,
} from "./map-explorer-helpers";
import { MobileFilterSheet } from "./mobile-filter-sheet";

export const MapExplorer = () => {
  const [mapZoom, setMapZoom] = useState(9);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [hasUserPanned, setHasUserPanned] = useState(false);
  const [isInitialBoundsApplied, setIsInitialBoundsApplied] = useState(false);

  // Refs for map resize handling
  const mapRef = useRef<ClusteredMapHandle>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Get filter state from URL (nuqs)
  const { filters, activeFilterCount } = useFilters();

  // Fetch lightweight catalog/dataset data for filter labels
  const { data: dataSources } = useDataSourcesQuery();
  const catalogs = dataSources?.catalogs ?? [];
  const datasets = dataSources?.datasets ?? [];

  // Ref to track previous filters for detecting filter changes
  const prevFiltersRef = useRef(filters);

  // Get selected event state from URL (nuqs)
  const { selectedEventId, openEvent, closeEvent } = useSelectedEvent();

  // Get map position from URL (nuqs)
  const { mapPosition, hasMapPosition, setMapPosition } = useMapPosition();

  // Convert URL map position to initial view state for ClusteredMap
  const initialViewState = useMemo(
    () => getInitialViewState(hasMapPosition, mapPosition),
    [hasMapPosition, mapPosition]
  );

  // Get UI state from Zustand store
  const isFilterDrawerOpen = useUIStore((state) => state.ui.isFilterDrawerOpen);
  const mapBounds = useUIStore((state) => state.ui.mapBounds);
  const toggleFilterDrawer = useUIStore((state) => state.toggleFilterDrawer);
  const setFilterDrawerOpen = useUIStore((state) => state.setFilterDrawerOpen);
  const setMapBounds = useUIStore((state) => state.setMapBounds);
  const setMapStats = useUIStore((state) => state.setMapStats);

  // Close filter drawer on mobile on first mount for better UX
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && isFilterDrawerOpen) {
      setFilterDrawerOpen(false);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Convert mapBounds to simple object format for React Query compatibility
  const simpleBounds = useMemo(() => simplifyBounds(mapBounds), [mapBounds]);

  // Debounce bounds changes to avoid excessive API calls during map panning
  const debouncedSimpleBounds = useDebounce(simpleBounds, 300);

  // React Query hooks for data fetching - use simple bounds directly for better cache key comparison
  const { data: eventsData, isLoading: eventsLoading } = useEventsListQuery(filters, debouncedSimpleBounds, 1000);

  const { data: clustersData, isLoading: clustersLoading } = useMapClustersQuery(
    filters,
    debouncedSimpleBounds,
    mapZoom
  );

  // Fetch total count without bounds filter for global statistics
  const { data: totalEventsData } = useEventsTotalQuery(filters);

  // Fetch global cluster statistics (independent of viewport)
  const { data: clusterStats } = useClusterStatsQuery(filters);

  // Fetch bounds for initial map positioning and "zoom to data" functionality
  const { data: boundsData, isLoading: boundsLoading } = useBoundsQuery(filters);

  // Extract data from queries
  const events = eventsData?.events ?? [];
  const clusters = clustersData?.features ?? [];
  const isLoading = eventsLoading || clustersLoading;

  // Track loading states
  const { isInitialLoad, isUpdating, shouldMarkLoaded } = getLoadingStates(
    isLoading,
    hasLoadedOnce,
    events.length,
    clusters.length
  );

  // Mark as loaded once we have data
  if (shouldMarkLoaded) {
    setHasLoadedOnce(true);
  }

  // Update map stats in Zustand store when data changes
  // Use totalEventsData.total for absolute count (not viewport-bounded)
  useEffect(() => {
    if (eventsData != null && totalEventsData != null) {
      setMapStats({
        visibleEvents: events.length,
        totalEvents: totalEventsData.total,
      });
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
  }, []);

  // Reset user panning state when filters change
  useEffect(() => {
    const filtersChanged = JSON.stringify(prevFiltersRef.current) !== JSON.stringify(filters);
    if (filtersChanged) {
      prevFiltersRef.current = filters;
      setHasUserPanned(false);
    }
  }, [filters]);

  // Determine if we should show loading overlay (initial load only, not filter changes)
  const isLoadingInitialBounds = boundsLoading && !isInitialBoundsApplied;

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

  // Handler to zoom to data bounds
  const handleZoomToData = useCallback(() => {
    if (boundsData?.bounds && mapRef.current) {
      mapRef.current.fitBounds(boundsData.bounds, { padding: 50, animate: true });
      setHasUserPanned(false);
    }
  }, [boundsData]);

  // Get human-readable filter labels (uses helper function)
  const filterLabels = useMemo(() => getFilterLabels(filters, catalogs, datasets), [filters, catalogs, datasets]);

  const handleBoundsChange = useCallback(
    (newBounds: LngLatBounds | null, zoom?: number, center?: { lng: number; lat: number }) => {
      if (newBounds) {
        setMapBounds({
          north: newBounds.getNorth(),
          south: newBounds.getSouth(),
          east: newBounds.getEast(),
          west: newBounds.getWest(),
        });
        if (zoom != undefined) {
          setMapZoom(Math.round(zoom));
        }

        // Update URL with map position (center + zoom)
        if (center && zoom != undefined) {
          setMapPosition({
            latitude: center.lat,
            longitude: center.lng,
            zoom: zoom,
          });
        }

        // Mark that initial bounds have been applied (first bounds change)
        if (!isInitialBoundsApplied) {
          setIsInitialBoundsApplied(true);
        } else {
          // After initial load, any bounds change means user has panned
          setHasUserPanned(true);
        }
      } else {
        setMapBounds(null);
      }
    },
    [setMapBounds, setMapPosition, isInitialBoundsApplied]
  );

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
      {/* Desktop: Flex layout - both map and list shrink proportionally when filters open */}
      <div ref={gridRef} className="hidden flex-1 overflow-hidden md:flex">
        {/* Map Panel - takes half of available space */}
        <div className="relative h-full min-w-0 flex-1 transition-all duration-500 ease-in-out">
          <ClusteredMap
            ref={mapRef}
            clusters={clusters}
            clusterStats={clusterStats}
            onBoundsChange={handleBoundsChange}
            initialBounds={boundsData?.bounds}
            initialViewState={initialViewState}
            isLoadingBounds={isLoadingInitialBounds}
          />
          {/* Zoom to data button - positioned above theme control */}
          <div className="absolute bottom-12 left-2 z-10">
            <ZoomToDataButton visible={showZoomToData} onClick={handleZoomToData} />
          </div>
        </div>

        {/* Content Panel - takes half of available space */}
        <div className="min-w-0 flex-1 overflow-y-auto border-l transition-all duration-500 ease-in-out [scrollbar-gutter:stable]">
          <div className="p-6">
            {/* TODO: ActiveFilters component removed for now - may add back later for filter chip UI */}

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
        <div
          className={cn(
            "bg-background h-full overflow-hidden border-l transition-all duration-500 ease-in-out",
            isFilterDrawerOpen ? "w-80" : "w-0"
          )}
        >
          <FilterDrawer />
        </div>
      </div>

      {/* Mobile: Stacked layout with overlay filter drawer */}
      <div className="flex flex-1 flex-col overflow-hidden md:hidden">
        {/* Map takes top half */}
        <div className="relative h-1/2 min-h-0">
          <ClusteredMap
            clusters={clusters}
            clusterStats={clusterStats}
            onBoundsChange={handleBoundsChange}
            initialBounds={boundsData?.bounds}
            initialViewState={initialViewState}
            isLoadingBounds={isLoadingInitialBounds}
          />
          {/* Zoom to data button - positioned above theme control */}
          <div className="absolute bottom-12 left-2 z-10">
            <ZoomToDataButton visible={showZoomToData} onClick={handleZoomToData} />
          </div>
        </div>

        {/* Content takes bottom half */}
        <div className="h-1/2 min-h-0 overflow-y-auto border-t">
          <div className="p-4">
            {/* TODO: ActiveFilters component removed for now - may add back later for filter chip UI */}

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
