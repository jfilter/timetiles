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
import { useFilters } from "@/lib/filters";
import { useDebounce } from "@/lib/hooks/use-debounce";
import {
  useClusterStatsQuery,
  useEventsListQuery,
  useEventsTotalQuery,
  useMapClustersQuery,
} from "@/lib/hooks/use-events-queries";
import { useUIStore } from "@/lib/store";
import type { Catalog, Dataset } from "@/payload-types";

import { ActiveFilters } from "./active-filters";
import { ChartSection } from "./chart-section";
import { EventsList } from "./events-list";
import { FilterDrawer } from "./filter-drawer";

interface MapExplorerProps {
  catalogs: Catalog[];
  datasets: Dataset[];
}

export const MapExplorer = ({ catalogs, datasets }: Readonly<MapExplorerProps>) => {
  const [mapZoom, setMapZoom] = useState(9);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Refs for map resize handling
  const mapRef = useRef<ClusteredMapHandle>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Get filter state from URL (nuqs)
  const { filters, activeFilterCount, hasActiveFilters, removeFilter, clearAllFilters } = useFilters();

  const filterActions = useMemo(() => ({ removeFilter, clearAllFilters }), [removeFilter, clearAllFilters]);

  // Get UI state from Zustand store
  const isFilterDrawerOpen = useUIStore((state) => state.ui.isFilterDrawerOpen);
  const mapBounds = useUIStore((state) => state.ui.mapBounds);
  const toggleFilterDrawer = useUIStore((state) => state.toggleFilterDrawer);
  const setMapBounds = useUIStore((state) => state.setMapBounds);
  const setMapStats = useUIStore((state) => state.setMapStats);

  // Convert mapBounds to simple object format for React Query compatibility
  // React Query needs serializable objects for proper cache key comparison
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

  // Extract data from queries
  const events = eventsData?.events ?? [];
  const clusters = clustersData?.features ?? [];
  const isLoading = eventsLoading || clustersLoading;

  // Track when we've loaded data at least once
  const isInitialLoad = isLoading && !hasLoadedOnce;
  const isUpdating = isLoading && hasLoadedOnce;

  // Mark as loaded once we have data
  if (!isLoading && !hasLoadedOnce && (events.length > 0 || clusters.length > 0)) {
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

  // Helper function to get catalog name by ID
  const getCatalogName = (catalogId: string): string => {
    const catalog = catalogs.find((c) => String(c.id) === catalogId);
    return catalog?.name ?? "Unknown Catalog";
  };

  // Helper function to get dataset name by ID
  const getDatasetName = (datasetId: string): string => {
    const dataset = datasets.find((d) => String(d.id) === datasetId);
    return dataset?.name ?? "Unknown Dataset";
  };

  // Helper function for date range formatting
  const formatDateRange = () => {
    const hasStartDate = filters.startDate != null && filters.startDate !== "";
    const hasEndDate = filters.endDate != null && filters.endDate !== "";

    if (!hasStartDate && !hasEndDate) {
      return undefined;
    }

    const start = hasStartDate ? new Date(filters.startDate!).toLocaleDateString("en-US") : "Start";
    const end = hasEndDate ? new Date(filters.endDate!).toLocaleDateString("en-US") : "End";

    if (hasStartDate && hasEndDate) {
      return `${start} - ${end}`;
    } else if (hasStartDate) {
      return `From ${start}`;
    } else if (hasEndDate) {
      return `Until ${end}`;
    }
    return undefined;
  };

  // Get human-readable filter labels
  const getFilterLabels = () => {
    return {
      catalog: filters.catalog != null && filters.catalog !== "" ? getCatalogName(filters.catalog) : undefined,
      datasets: filters.datasets.map((id) => ({
        id,
        name: getDatasetName(id),
      })),
      dateRange: formatDateRange(),
    };
  };

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
      } else {
        setMapBounds(null);
      }
    },
    [setMapBounds]
  );

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
      {/* Desktop: Flex layout - both map and list shrink proportionally when filters open */}
      <div ref={gridRef} className="hidden flex-1 overflow-hidden md:flex">
        {/* Map Panel - takes half of available space */}
        <div className="h-full min-w-0 flex-1 transition-all duration-500 ease-in-out">
          <ClusteredMap
            ref={mapRef}
            clusters={clusters}
            clusterStats={clusterStats}
            onBoundsChange={handleBoundsChange}
          />
        </div>

        {/* Content Panel - takes half of available space */}
        <div className="min-w-0 flex-1 overflow-y-auto border-l transition-all duration-500 ease-in-out [scrollbar-gutter:stable]">
          <div className="p-6">
            {/* Active Filters */}
            <ActiveFilters
              labels={getFilterLabels()}
              hasActiveFilters={hasActiveFilters}
              activeFilterCount={activeFilterCount}
              actions={filterActions}
            />

            {/* Chart Section - height matches list explorer (50vh - p-6 padding) */}
            <div className="mb-6 h-[calc(50vh-3rem)] min-h-[252px]">
              <ChartSection bounds={debouncedSimpleBounds} fillHeight />
            </div>

            {/* Events List */}
            <div className="border-t pt-6">
              <h2 className="mb-4 text-lg font-semibold">
                Events ({events.length} of {totalEventsData?.total ?? "..."})
              </h2>
              <EventsList events={events} isInitialLoad={isInitialLoad} isUpdating={isUpdating} />
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
          <FilterDrawer catalogs={catalogs} datasets={datasets} />
        </div>
      </div>

      {/* Mobile: Stacked layout with overlay filter drawer */}
      <div className="flex flex-1 flex-col overflow-hidden md:hidden">
        {/* Map takes top half */}
        <div className="h-1/2 min-h-0">
          <ClusteredMap clusters={clusters} clusterStats={clusterStats} onBoundsChange={handleBoundsChange} />
        </div>

        {/* Content takes bottom half */}
        <div className="h-1/2 min-h-0 overflow-y-auto border-t">
          <div className="p-4">
            <ActiveFilters
              labels={getFilterLabels()}
              hasActiveFilters={hasActiveFilters}
              activeFilterCount={activeFilterCount}
              actions={filterActions}
            />

            <div className="mb-4">
              <ChartSection bounds={debouncedSimpleBounds} />
            </div>

            <div className="border-t pt-4">
              <h2 className="mb-4 text-lg font-semibold">
                Events ({events.length} of {totalEventsData?.total ?? "..."})
              </h2>
              <EventsList events={events} isInitialLoad={isInitialLoad} isUpdating={isUpdating} />
            </div>
          </div>
        </div>

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

              {/* Filter content */}
              <div className="flex-1 overflow-y-auto p-4">
                <FilterDrawer catalogs={catalogs} datasets={datasets} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
