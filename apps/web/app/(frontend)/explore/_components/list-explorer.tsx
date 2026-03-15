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

import { useState } from "react";

import { ChartSection } from "./chart-section";
import { EventDetailModal } from "./event-detail-modal";
import { EventsListPaginated } from "./events-list-paginated";
import { FilterDrawer } from "./filter-drawer";
import { FilterPanel } from "./filter-panel";
import { formatDateRange, getDatasetName } from "./map-explorer-helpers";
import { MapPanel } from "./map-panel";
import { MobileFilterSheet } from "./mobile-filter-sheet";
import { MobileTabs } from "./mobile-tabs";
import { useExplorerState } from "./use-explorer-state";

type MobileTab = "map" | "chart" | "list";

export const ListExplorer = () => {
  const [mobileActiveTab, setMobileActiveTab] = useState<MobileTab>("list");

  // Shared explorer state
  const explorer = useExplorerState();
  const { map, filters: filterState, selection, data, ui } = explorer;
  const { filters, activeFilterCount } = filterState;
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
    <MapPanel
      mapRef={mapRef}
      clusters={clusters}
      clusterStats={clusterStats}
      onBoundsChange={handleBoundsChange}
      initialBounds={boundsData?.bounds}
      isLoadingBounds={isLoadingInitialBounds}
      showZoomToData={showZoomToData}
      onZoomToData={handleZoomToData}
    />
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
              <MapPanel
                mapRef={mapRef}
                clusters={clusters}
                clusterStats={clusterStats}
                onBoundsChange={handleBoundsChange}
                initialBounds={boundsData?.bounds}
                isLoadingBounds={isLoadingInitialBounds}
                showZoomToData={showZoomToData}
                onZoomToData={handleZoomToData}
                className="relative overflow-hidden"
              />

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
          <FilterPanel isOpen={isFilterDrawerOpen} className="self-start">
            <FilterDrawer />
          </FilterPanel>
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
