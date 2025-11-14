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

import type { LngLatBounds } from "maplibre-gl";
import { useCallback, useMemo, useState } from "react";

import { ClusteredMap } from "@/components/maps/clustered-map";
import { useFilters } from "@/lib/filters";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useClusterStatsQuery, useEventsListQuery, useMapClustersQuery } from "@/lib/hooks/use-events-queries";
import { useUIStore } from "@/lib/store";
import type { Catalog, Dataset } from "@/payload-types";

import { ActiveFilters } from "./active-filters";
import { ChartSection } from "./chart-section";
import { EventsList } from "./events-list";
import { ExploreHeader } from "./explore-header";
import { FilterDrawer } from "./filter-drawer";

interface MapExplorerProps {
  catalogs: Catalog[];
  datasets: Dataset[];
}

export const MapExplorer = ({ catalogs, datasets }: Readonly<MapExplorerProps>) => {
  const [mapZoom, setMapZoom] = useState(9);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Get filter state from URL (nuqs)
  const { filters, activeFilterCount, hasActiveFilters, removeFilter, clearAllFilters } = useFilters();

  const filterActions = useMemo(() => ({ removeFilter, clearAllFilters }), [removeFilter, clearAllFilters]);

  // Get UI state from Zustand store
  const isFilterDrawerOpen = useUIStore((state) => state.ui.isFilterDrawerOpen);
  const mapBounds = useUIStore((state) => state.ui.mapBounds);
  const toggleFilterDrawer = useUIStore((state) => state.toggleFilterDrawer);
  const setMapBounds = useUIStore((state) => state.setMapBounds);

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

    const start = hasStartDate ? new Date(filters.startDate!).toLocaleDateString() : "Start";
    const end = hasEndDate ? new Date(filters.endDate!).toLocaleDateString() : "End";

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
    <div className="flex h-screen">
      {/* Map - Left Side (Full Height) */}
      <div className="h-full w-1/2 lg:w-2/5">
        <ClusteredMap clusters={clusters} clusterStats={clusterStats} onBoundsChange={handleBoundsChange} />
      </div>

      {/* Right Side Container */}
      <div className="flex flex-1 flex-col">
        {/* Header - Above Content and Filter */}
        <ExploreHeader
          filterCount={activeFilterCount}
          isFilterOpen={isFilterDrawerOpen}
          onFilterToggle={toggleFilterDrawer}
        />

        {/* Content and Filter Container */}
        <div className="flex flex-1 overflow-hidden">
          {/* Content Area */}
          <div className="flex-1 overflow-y-auto border-l">
            <div className="p-6">
              {/* Active Filters - Above Chart */}
              <ActiveFilters
                labels={getFilterLabels()}
                hasActiveFilters={hasActiveFilters}
                activeFilterCount={activeFilterCount}
                actions={filterActions}
              />

              {/* Chart Section */}
              <div className="mb-6 border-t pt-6">
                <ChartSection bounds={debouncedSimpleBounds} />
              </div>

              {/* Events List */}
              <div className="border-t pt-6">
                <h2 className="mb-4 text-lg font-semibold">Events ({events.length})</h2>
                <EventsList events={events} isInitialLoad={isInitialLoad} isUpdating={isUpdating} />
              </div>
            </div>
          </div>

          {/* Filter Drawer - Right Side */}
          <FilterDrawer
            catalogs={catalogs}
            datasets={datasets}
            isOpen={isFilterDrawerOpen}
            onToggle={toggleFilterDrawer}
          />
        </div>
      </div>
    </div>
  );
};
