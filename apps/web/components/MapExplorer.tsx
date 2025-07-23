"use client";

import { useEffect, useState, useTransition, useMemo } from "react";
import type { Catalog, Dataset, Event } from "../payload-types";
import { ClusteredMap } from "./ClusteredMap";
import type { ClusterFeature } from "./ClusteredMap";
import { EventsList } from "./EventsList";
import { ActiveFilters } from "./ActiveFilters";
import { ChartSection } from "./ChartSection";
import { FilterDrawer } from "./FilterDrawer";
import { ExploreHeader } from "./ExploreHeader";
import { useUIStore } from "../lib/store";
import { useFilters } from "../lib/filters";
import { useDebounce } from "../lib/hooks/useDebounce";
import type { LngLatBounds } from "maplibre-gl";
import { createLogger } from "../lib/logger";

interface MapExplorerProps {
  catalogs: Catalog[];
  datasets: Dataset[];
}

const logger = createLogger("MapExplorer");

export function MapExplorer({ catalogs, datasets }: MapExplorerProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [clusters, setClusters] = useState<ClusterFeature[]>([]);
  const [mapZoom, setMapZoom] = useState(9);
  const [isPending, startTransition] = useTransition();

  // Get filter state from URL (nuqs)
  const {
    filters,
    activeFilterCount,
    hasActiveFilters,
    removeFilter,
    clearAllFilters,
  } = useFilters();

  // Get UI state from Zustand store
  const isFilterDrawerOpen = useUIStore((state) => state.ui.isFilterDrawerOpen);
  const mapBounds = useUIStore((state) => state.ui.mapBounds);
  const toggleFilterDrawer = useUIStore((state) => state.toggleFilterDrawer);
  const setMapBounds = useUIStore((state) => state.setMapBounds);

  // Helper function to get catalog name by ID
  const getCatalogName = (catalogId: string): string => {
    const catalog = catalogs.find((c) => String(c.id) === catalogId);
    return catalog?.name || "Unknown Catalog";
  };

  // Helper function to get dataset name by ID
  const getDatasetName = (datasetId: string): string => {
    const dataset = datasets.find((d) => String(d.id) === datasetId);
    return dataset?.name || "Unknown Dataset";
  };

  // Get human-readable filter labels
  const getFilterLabels = () => {
    const labels = {
      catalog: filters.catalog ? getCatalogName(filters.catalog) : undefined,
      datasets: filters.datasets.map((id) => ({
        id,
        name: getDatasetName(id),
      })),
      dateRange: (() => {
        if (filters.startDate || filters.endDate) {
          const start = filters.startDate
            ? new Date(filters.startDate).toLocaleDateString()
            : "Start";
          const end = filters.endDate
            ? new Date(filters.endDate).toLocaleDateString()
            : "End";

          if (filters.startDate && filters.endDate) {
            return `${start} - ${end}`;
          } else if (filters.startDate) {
            return `From ${start}`;
          } else if (filters.endDate) {
            return `Until ${end}`;
          }
        }
        return undefined;
      })(),
    };
    return labels;
  };

  // Convert mapBounds to LngLatBounds format for compatibility
  // Memoize bounds to prevent object recreation on every render
  const bounds: LngLatBounds | null = useMemo(() => {
    if (!mapBounds) return null;

    return {
      getNorth: () => mapBounds.north,
      getSouth: () => mapBounds.south,
      getEast: () => mapBounds.east,
      getWest: () => mapBounds.west,
    } as LngLatBounds;
  }, [mapBounds]);

  // Create a stable bounds key for comparison
  const boundsKey = useMemo(() => {
    if (!bounds) return null;
    return `${bounds.getNorth()}-${bounds.getSouth()}-${bounds.getEast()}-${bounds.getWest()}`;
  }, [bounds]);

  // Debounce bounds changes to avoid excessive API calls during map interaction
  // Wait 300ms after user stops panning/zooming before making API call
  const debouncedBoundsKey = useDebounce(boundsKey, 300);

  // Get the actual bounds object when the debounced key changes
  const debouncedBounds = useMemo(() => {
    if (!debouncedBoundsKey || !bounds) return null;
    return bounds;
  }, [debouncedBoundsKey, bounds]);

  const handleBoundsChange = (
    newBounds: LngLatBounds | null,
    zoom?: number,
  ) => {
    if (newBounds) {
      setMapBounds({
        north: newBounds.getNorth(),
        south: newBounds.getSouth(),
        east: newBounds.getEast(),
        west: newBounds.getWest(),
      });
      if (zoom !== undefined) {
        setMapZoom(Math.round(zoom));
      }
    } else {
      setMapBounds(null);
    }
  };

  useEffect(() => {
    // Cancel any previous requests if pending
    const abortController = new AbortController();

    const fetchEvents = async () => {
      // Debug logging to verify deduplication is working
      logger.debug("Fetching events with bounds", {
        bounds: debouncedBounds
          ? {
              north: debouncedBounds.getNorth(),
              south: debouncedBounds.getSouth(),
              east: debouncedBounds.getEast(),
              west: debouncedBounds.getWest(),
            }
          : null,
      });

      const params = new URLSearchParams();

      if (filters.catalog) {
        params.append("catalog", filters.catalog);
      }

      filters.datasets.forEach((datasetId) => {
        params.append("datasets", datasetId);
      });

      if (filters.startDate) {
        params.append("startDate", filters.startDate);
      }

      if (filters.endDate) {
        params.append("endDate", filters.endDate);
      }

      if (debouncedBounds) {
        params.append(
          "bounds",
          JSON.stringify({
            west: debouncedBounds.getWest(),
            south: debouncedBounds.getSouth(),
            east: debouncedBounds.getEast(),
            north: debouncedBounds.getNorth(),
          }),
        );
      } else {
        // Use default NYC area bounds if no bounds are available yet
        params.append(
          "bounds",
          JSON.stringify({
            west: -74.2,
            south: 40.5,
            east: -73.6,
            north: 40.9,
          }),
        );
      }

      // Add zoom parameter for clustering
      params.append("zoom", mapZoom.toString());

      try {
        // Fetch clustered data for map
        const clusterResponse = await fetch(
          `/api/events/map-clusters?${params.toString()}`,
          {
            signal: abortController.signal,
          },
        );

        // Also fetch events list for the sidebar
        const listParams = new URLSearchParams(params);
        listParams.set("limit", "1000"); // Limit list view to 100 items
        const listResponse = await fetch(
          `/api/events/list?${listParams.toString()}`,
          {
            signal: abortController.signal,
          },
        );

        if (
          clusterResponse.ok &&
          listResponse.ok &&
          !abortController.signal.aborted
        ) {
          const clusterData = await clusterResponse.json();
          const listData = await listResponse.json();

          startTransition(() => {
            setClusters(clusterData.features || []);
            setEvents(listData.events || []);
          });
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          logger.error("Failed to fetch events:", error);
        }
      }
    };

    fetchEvents();

    return () => {
      abortController.abort();
    };
  }, [
    filters.catalog,
    filters.datasets,
    filters.startDate,
    filters.endDate,
    debouncedBounds,
    mapZoom,
  ]);

  return (
    <div className="flex h-screen">
      {/* Map - Left Side (Full Height) */}
      <div className="h-full w-1/2 lg:w-2/5">
        <ClusteredMap clusters={clusters} onBoundsChange={handleBoundsChange} />
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
                actions={{
                  removeFilter,
                  clearAllFilters,
                }}
              />

              {/* Chart Section */}
              <div className="mb-6 border-t pt-6">
                <ChartSection
                  events={events}
                  datasets={datasets}
                  catalogs={catalogs}
                  loading={isPending}
                />
              </div>

              {/* Events List */}
              <div className="border-t pt-6">
                <h2 className="mb-4 text-lg font-semibold">
                  Events ({events.length})
                </h2>
                <EventsList events={events} loading={isPending} />
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
}
