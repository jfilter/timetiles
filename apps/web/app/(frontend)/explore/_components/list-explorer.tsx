/**
 * Main list-based exploration interface component.
 *
 * Provides an alternative to the map-focused explore view, with a 2-column
 * top section (map, chart) and a centered paginated event list below.
 * Filters use the same sliding drawer as the normal explore page.
 * Mobile uses tab navigation between Map, Chart, and List views.
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
import { useFilters, useSelectedEvent } from "@/lib/filters";
import { useDataSourcesQuery } from "@/lib/hooks/use-data-sources-query";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useBoundsQuery, useClusterStatsQuery, useMapClustersQuery } from "@/lib/hooks/use-events-queries";
import { useUIStore } from "@/lib/store";

// TODO: ActiveFilters removed for now - may add back later for filter chip UI
// import { ActiveFilters } from "./active-filters";
import { ChartSection } from "./chart-section";
import { EventDetailModal } from "./event-detail-modal";
import { EventsListPaginated } from "./events-list-paginated";
import { FilterDrawer } from "./filter-drawer";
import { MobileTabs } from "./mobile-tabs";

type MobileTab = "map" | "chart" | "list";

export const ListExplorer = () => {
  const [mapZoom, setMapZoom] = useState(9);
  const [mobileActiveTab, setMobileActiveTab] = useState<MobileTab>("list");
  const [hasUserPanned, setHasUserPanned] = useState(false);
  const [isInitialBoundsApplied, setIsInitialBoundsApplied] = useState(false);

  // Ref for map component
  const mapRef = useRef<ClusteredMapHandle>(null);

  // Get filter state from URL (nuqs)
  const { filters } = useFilters();

  // Fetch lightweight catalog/dataset data for filter labels
  const { data: dataSources } = useDataSourcesQuery();
  const datasets = dataSources?.datasets ?? [];

  // Ref to track previous filters for detecting filter changes
  const prevFiltersRef = useRef(filters);

  // Get selected event state from URL (nuqs)
  const { selectedEventId, openEvent, closeEvent } = useSelectedEvent();

  // Get UI state from Zustand store
  const mapBounds = useUIStore((state) => state.ui.mapBounds);
  const setMapBounds = useUIStore((state) => state.setMapBounds);
  const isFilterDrawerOpen = useUIStore((state) => state.ui.isFilterDrawerOpen);
  const toggleFilterDrawer = useUIStore((state) => state.toggleFilterDrawer);

  // Convert mapBounds to simple object format for React Query compatibility
  const simpleBounds = useMemo(() => {
    if (!mapBounds) return null;
    return {
      north: mapBounds.north,
      south: mapBounds.south,
      east: mapBounds.east,
      west: mapBounds.west,
    };
  }, [mapBounds]);

  // Debounce bounds changes to avoid excessive API calls during map panning
  const debouncedSimpleBounds = useDebounce(simpleBounds, 300);

  // React Query hooks for map data
  const { data: clustersData } = useMapClustersQuery(filters, debouncedSimpleBounds, mapZoom);
  const { data: clusterStats } = useClusterStatsQuery(filters);

  // Fetch bounds for initial map positioning and "zoom to data" functionality
  const { data: boundsData, isLoading: boundsLoading } = useBoundsQuery(filters);

  const clusters = clustersData?.features ?? [];

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

  // Show "zoom to data" button when user has panned and we have bounds data
  const showZoomToData = hasUserPanned && boundsData?.bounds != null && !boundsLoading;

  // Handler to zoom to data bounds
  const handleZoomToData = useCallback(() => {
    if (boundsData?.bounds && mapRef.current) {
      mapRef.current.fitBounds(boundsData.bounds, { padding: 50, animate: true });
      setHasUserPanned(false);
    }
  }, [boundsData]);

  // Helper functions for filter labels
  const getDatasetName = (datasetId: string): string => {
    const dataset = datasets.find((d) => String(d.id) === datasetId);
    return dataset?.name ?? "Unknown Dataset";
  };

  const formatDateRange = () => {
    const hasStartDate = filters.startDate != null && filters.startDate !== "";
    const hasEndDate = filters.endDate != null && filters.endDate !== "";

    if (!hasStartDate && !hasEndDate) return undefined;

    const start = hasStartDate ? new Date(filters.startDate!).toLocaleDateString("en-US") : "Start";
    const end = hasEndDate ? new Date(filters.endDate!).toLocaleDateString("en-US") : "End";

    if (hasStartDate && hasEndDate) return `${start} - ${end}`;
    if (hasStartDate) return `From ${start}`;
    if (hasEndDate) return `Until ${end}`;
    return undefined;
  };

  const getDatasetNames = (): string[] => filters.datasets.map((id) => getDatasetName(id));

  const handleBoundsChange = useCallback(
    (newBounds: LngLatBounds | null, zoom?: number) => {
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
    [setMapBounds, isInitialBoundsApplied]
  );

  // Content for mobile tabs
  const mobileMapContent = (
    <div className="relative h-full">
      <ClusteredMap
        ref={mapRef}
        clusters={clusters}
        clusterStats={clusterStats}
        onBoundsChange={handleBoundsChange}
        initialBounds={boundsData?.bounds}
        isLoadingBounds={isLoadingInitialBounds}
      />
      {/* Zoom to data button - positioned above theme control */}
      <div className="absolute bottom-12 left-2 z-10">
        <ZoomToDataButton visible={showZoomToData} onClick={handleZoomToData} />
      </div>
    </div>
  );

  const mobileChartContent = (
    <div className="flex h-full flex-col p-4">
      <ChartSection bounds={debouncedSimpleBounds} fillHeight />
    </div>
  );

  const mobileListContent = (
    <div className="p-4">
      <EventsListPaginated
        filters={filters}
        bounds={debouncedSimpleBounds}
        datasetNames={getDatasetNames()}
        dateRangeLabel={formatDateRange()}
        onEventClick={openEvent}
      />
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col overflow-x-hidden">
      {/* Desktop Layout - everything scrolls together */}
      <div className="hidden flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] md:block">
        <div className="flex min-h-full">
          {/* Main content */}
          <div className="min-w-0 flex-1">
            {/* Top Section - 2 Column Layout (Map | Chart) */}
            <div className="grid h-[50vh] min-h-[300px] grid-cols-2 gap-0 border-b">
              {/* Map Column */}
              <div className="relative overflow-hidden">
                <ClusteredMap
                  ref={mapRef}
                  clusters={clusters}
                  clusterStats={clusterStats}
                  onBoundsChange={handleBoundsChange}
                  initialBounds={boundsData?.bounds}
                  isLoadingBounds={isLoadingInitialBounds}
                />
                {/* Zoom to data button - positioned above theme control */}
                <div className="absolute bottom-12 left-2 z-10">
                  <ZoomToDataButton visible={showZoomToData} onClick={handleZoomToData} />
                </div>
              </div>

              {/* Chart Column */}
              <div className="overflow-hidden border-l">
                <div className="flex h-full flex-col p-6">
                  <ChartSection bounds={debouncedSimpleBounds} fillHeight />
                </div>
              </div>
            </div>

            {/* Main Content - Centered List */}
            <div className="mx-auto max-w-2xl px-4 py-6">
              {/* TODO: ActiveFilters component removed for now - may add back later for filter chip UI */}
              <EventsListPaginated
                filters={filters}
                bounds={debouncedSimpleBounds}
                datasetNames={getDatasetNames()}
                dateRangeLabel={formatDateRange()}
                onEventClick={openEvent}
              />
            </div>
          </div>

          {/* Filter Panel - slides in, scrolls with page, ends with content */}
          <div
            className={cn(
              "shrink-0 self-start border-l transition-all duration-500 ease-in-out",
              isFilterDrawerOpen ? "w-80" : "w-0 overflow-hidden"
            )}
          >
            <FilterDrawer />
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="flex flex-1 flex-col md:hidden">
        {/* Tab Navigation */}
        <MobileTabs
          activeTab={mobileActiveTab}
          onTabChange={setMobileActiveTab}
          mapContent={mobileMapContent}
          chartContent={mobileChartContent}
          listContent={mobileListContent}
        />

        {/* Mobile: Full-screen overlay filter sheet */}
        {isFilterDrawerOpen && (
          <div className="bg-background fixed inset-0 z-50">
            <div className="flex h-full flex-col">
              {/* Header with close button */}
              <div className="flex items-center justify-between border-b p-4">
                <h2 className="text-lg font-semibold">Filters</h2>
                <button
                  onClick={toggleFilterDrawer}
                  className="hover:bg-muted rounded-sm p-2"
                  aria-label="Close filters"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Filter content - FilterDrawer handles its own scroll */}
              <div className="min-h-0 flex-1">
                <FilterDrawer />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Event Detail Modal */}
      <EventDetailModal eventId={selectedEventId} onClose={closeEvent} />
    </div>
  );
};
