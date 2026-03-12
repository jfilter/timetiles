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
import { useState } from "react";

import { ClusteredMap } from "@/components/maps/clustered-map";
import { ZoomToDataButton } from "@/components/maps/zoom-to-data-button";

import { ChartSection } from "./chart-section";
import { EventDetailModal } from "./event-detail-modal";
import { EventsListPaginated } from "./events-list-paginated";
import { FilterDrawer } from "./filter-drawer";
import { formatDateRange, getDatasetName } from "./map-explorer-helpers";
import { MobileTabs } from "./mobile-tabs";
import { useExplorerState } from "./use-explorer-state";

type MobileTab = "map" | "chart" | "list";

export const ListExplorer = () => {
  const [mobileActiveTab, setMobileActiveTab] = useState<MobileTab>("list");

  // Shared explorer state
  const explorer = useExplorerState();
  const { map, filters: filterState, selection, data, ui } = explorer;
  const { filters } = filterState;
  const { selectedEventId, openEvent, closeEvent } = selection;
  const { datasets, clusters, clusterStats, boundsData, boundsLoading, isLoadingInitialBounds } = data;
  const { isFilterDrawerOpen, toggleFilterDrawer } = ui;
  const { ref: mapRef, debouncedSimpleBounds, hasUserPanned, handleZoomToData, handleBoundsChange } = map;

  // Show "zoom to data" button when user has panned and we have bounds data
  const showZoomToData = hasUserPanned && boundsData?.bounds != null && !boundsLoading;

  // Helper functions for filter labels using shared helpers
  const getDatasetNames = (): string[] => filters.datasets.map((id) => getDatasetName(datasets, id));
  const dateRangeLabel = formatDateRange(filters.startDate, filters.endDate);

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
        dateRangeLabel={dateRangeLabel}
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
              <EventsListPaginated
                filters={filters}
                bounds={debouncedSimpleBounds}
                datasetNames={getDatasetNames()}
                dateRangeLabel={dateRangeLabel}
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
