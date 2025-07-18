"use client";

import { useEffect, useState, useTransition } from "react";
import type { Catalog, Dataset, Event } from "../payload-types";
import { Map } from "./Map";
import { EventsList } from "./EventsList";
import { ActiveFilters } from "./ActiveFilters";
import { ChartSection } from "./ChartSection";
import { FilterDrawer } from "./FilterDrawer";
import { ExploreHeader } from "./ExploreHeader";
import { useUIStore } from "../lib/store";
import { useFilters } from "../lib/filters";
import type { LngLatBounds } from "maplibre-gl";

interface MapExplorerProps {
  catalogs: Catalog[];
  datasets: Dataset[];
}

export function MapExplorer({ catalogs, datasets }: MapExplorerProps) {
  const [events, setEvents] = useState<Event[]>([]);
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
  const selectedEvent = useUIStore((state) => state.ui.selectedEvent);

  const toggleFilterDrawer = useUIStore((state) => state.toggleFilterDrawer);
  const setMapBounds = useUIStore((state) => state.setMapBounds);
  const setSelectedEvent = useUIStore((state) => state.setSelectedEvent);

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
  const bounds: LngLatBounds | null = mapBounds
    ? ({
        getNorth: () => mapBounds.north,
        getSouth: () => mapBounds.south,
        getEast: () => mapBounds.east,
        getWest: () => mapBounds.west,
      } as LngLatBounds)
    : null;

  const handleBoundsChange = (newBounds: LngLatBounds | null) => {
    if (newBounds) {
      setMapBounds({
        north: newBounds.getNorth(),
        south: newBounds.getSouth(),
        east: newBounds.getEast(),
        west: newBounds.getWest(),
      });
    } else {
      setMapBounds(null);
    }
  };

  useEffect(() => {
    // Cancel any previous requests if pending
    const abortController = new AbortController();

    const fetchEvents = async () => {
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

      if (bounds) {
        params.append(
          "bounds",
          JSON.stringify({
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
          }),
        );
      }

      try {
        const response = await fetch(`/api/events?${params.toString()}`, {
          signal: abortController.signal,
        });
        if (response.ok && !abortController.signal.aborted) {
          const data = await response.json();
          startTransition(() => {
            setEvents(data.docs || []);
          });
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Failed to fetch events:", error);
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
    bounds,
  ]);

  const mapEvents = events
    .filter((event) => event.location?.longitude && event.location?.latitude)
    .map((event) => {
      const eventData =
        typeof event.data === "object" &&
        event.data !== null &&
        !Array.isArray(event.data)
          ? (event.data as Record<string, unknown>)
          : {};

      return {
        id: String(event.id),
        longitude: event.location!.longitude!,
        latitude: event.location!.latitude!,
        title: (eventData.title ||
          eventData.name ||
          `Event ${event.id}`) as string,
      };
    });

  return (
    <div className="flex h-screen">
      {/* Map - Left Side (Full Height) */}
      <div className="h-full w-1/2 lg:w-2/5">
        <Map events={mapEvents} onBoundsChange={handleBoundsChange} />
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
