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
import { useCallback, useMemo, useState } from "react";

import { ClusteredMap } from "@/components/maps/clustered-map";
import { useFilters } from "@/lib/filters";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useClusterStatsQuery, useMapClustersQuery } from "@/lib/hooks/use-events-queries";
import { useUIStore } from "@/lib/store";
import type { Catalog, Dataset } from "@/payload-types";

import { ActiveFilters } from "./active-filters";
import { ChartSection } from "./chart-section";
import { EventsListPaginated } from "./events-list-paginated";
import { FilterDrawer } from "./filter-drawer";
import { MobileTabs } from "./mobile-tabs";

interface ListExplorerProps {
  catalogs: Catalog[];
  datasets: Dataset[];
}

type MobileTab = "map" | "chart" | "list";

export const ListExplorer = ({ catalogs, datasets }: Readonly<ListExplorerProps>) => {
  const [mapZoom, setMapZoom] = useState(9);
  const [mobileActiveTab, setMobileActiveTab] = useState<MobileTab>("list");

  // Get filter state from URL (nuqs)
  const { filters, activeFilterCount, hasActiveFilters, removeFilter, clearAllFilters } = useFilters();
  const filterActions = useMemo(() => ({ removeFilter, clearAllFilters }), [removeFilter, clearAllFilters]);

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

  const clusters = clustersData?.features ?? [];

  // Helper functions for filter labels
  const getCatalogName = (catalogId: string): string => {
    const catalog = catalogs.find((c) => String(c.id) === catalogId);
    return catalog?.name ?? "Unknown Catalog";
  };

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

  const getFilterLabels = () => ({
    catalog: filters.catalog != null && filters.catalog !== "" ? getCatalogName(filters.catalog) : undefined,
    datasets: filters.datasets.map((id) => ({ id, name: getDatasetName(id) })),
    dateRange: formatDateRange(),
  });

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

  // Content for mobile tabs
  const mobileMapContent = (
    <div className="h-full">
      <ClusteredMap clusters={clusters} clusterStats={clusterStats} onBoundsChange={handleBoundsChange} />
    </div>
  );

  const mobileChartContent = (
    <div className="p-4">
      <ChartSection bounds={debouncedSimpleBounds} />
    </div>
  );

  const mobileListContent = (
    <div className="p-4">
      <ActiveFilters
        labels={getFilterLabels()}
        hasActiveFilters={hasActiveFilters}
        activeFilterCount={activeFilterCount}
        actions={filterActions}
      />
      <EventsListPaginated filters={filters} bounds={debouncedSimpleBounds} />
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col overflow-x-hidden">
      {/* Desktop Layout - everything scrolls together */}
      <div className="hidden flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] md:block">
        <div className="flex min-h-full">
          {/* Main content */}
          <div className="min-w-0 flex-1">
            {/* Top Section - 2 Column Layout (Map | Chart) */}
            <div className="grid h-[50vh] min-h-[300px] grid-cols-2 gap-0 border-b">
              {/* Map Column */}
              <div className="relative overflow-hidden">
                <ClusteredMap clusters={clusters} clusterStats={clusterStats} onBoundsChange={handleBoundsChange} />
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
              <ActiveFilters
                labels={getFilterLabels()}
                hasActiveFilters={hasActiveFilters}
                activeFilterCount={activeFilterCount}
                actions={filterActions}
              />
              <EventsListPaginated filters={filters} bounds={debouncedSimpleBounds} />
            </div>
          </div>

          {/* Filter Panel - slides in, scrolls with page, ends with content */}
          <div
            className={cn(
              "shrink-0 self-start border-l transition-all duration-500 ease-in-out",
              isFilterDrawerOpen ? "w-80" : "w-0 overflow-hidden"
            )}
          >
            <FilterDrawer catalogs={catalogs} datasets={datasets} />
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
