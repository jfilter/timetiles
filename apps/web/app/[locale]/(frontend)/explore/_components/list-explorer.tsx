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

import { useCallback, useState } from "react";

import { BREAKPOINT_MD } from "@/lib/constants/breakpoints";
import type { MapPosition } from "@/lib/hooks/use-filters";
import { useMapPosition } from "@/lib/hooks/use-filters";
import { useMediaQuery } from "@/lib/hooks/use-media-query";

import { ChartSection } from "./chart-section";
import { EventsListPaginated } from "./events-list-paginated";
import type { ExplorerChromeElements } from "./explorer-shell";
import { ExplorerShell } from "./explorer-shell";
import { formatDateRange, getDatasetName, getInitialViewState } from "./map-explorer-helpers";
import { MapPanel } from "./map-panel";
import { MobileTabs } from "./mobile-tabs";

type MobileTab = "map" | "chart" | "list";

export const ListExplorer = () => {
  const { mapPosition, hasMapPosition, setMapPosition } = useMapPosition();

  const handleMapPositionChange = useCallback(
    (center: { lng: number; lat: number }, zoom: number) => {
      setMapPosition({ latitude: center.lat, longitude: center.lng, zoom });
    },
    [setMapPosition]
  );

  return (
    <ExplorerShell className="overflow-x-hidden" explorerOptions={{ onMapPositionChange: handleMapPositionChange }}>
      {(chrome) => <ListExplorerContent chrome={chrome} hasMapPosition={hasMapPosition} mapPosition={mapPosition} />}
    </ExplorerShell>
  );
};

// ---------------------------------------------------------------------------
// Inner component — receives explorer state from ExplorerShell and can use hooks
// ---------------------------------------------------------------------------

interface ListExplorerContentProps {
  chrome: ExplorerChromeElements;
  hasMapPosition: boolean;
  mapPosition: MapPosition;
}

const ListExplorerContent = ({ chrome, hasMapPosition, mapPosition }: ListExplorerContentProps) => {
  const { explorer, filterPanel, mobileFilters } = chrome;
  const { map, filters: filterState, selection, data } = explorer;
  const { filters } = filterState;
  const { openEvent } = selection;
  const { datasets, clusters, clusterStats, boundsData, isLoadingInitialBounds } = data;
  const { ref: mapRef, debouncedSimpleBounds, showZoomToData, handleZoomToData, handleBoundsChange } = map;

  const [mobileActiveTab, setMobileActiveTab] = useState<MobileTab>("list");
  const isDesktop = useMediaQuery(BREAKPOINT_MD);
  const initialViewState = getInitialViewState(hasMapPosition, mapPosition);

  // Helper functions for filter labels using shared helpers
  const getDatasetNames = (): string[] => filters.datasets.map((id) => getDatasetName(datasets, id));
  const dateRangeLabel = formatDateRange(filters.startDate, filters.endDate);

  if (isDesktop === false) {
    // Mobile Layout — only the active tab is mounted
    return (
      <div className="flex flex-1 flex-col">
        <MobileTabs
          activeTab={mobileActiveTab}
          onTabChange={setMobileActiveTab}
          mapContent={
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
            />
          }
          chartContent={
            <div className="flex h-full flex-col p-4">
              <ChartSection bounds={debouncedSimpleBounds} fillHeight />
            </div>
          }
          listContent={
            <div className="p-4">
              <EventsListPaginated
                filters={filters}
                bounds={debouncedSimpleBounds}
                datasetNames={getDatasetNames()}
                dateRangeLabel={dateRangeLabel}
                onEventClick={openEvent}
              />
            </div>
          }
        />
        {mobileFilters}
      </div>
    );
  }

  // Desktop Layout — all panels visible, everything scrolls together
  return (
    <div className="flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
      <div className="flex min-h-full">
        <div className="min-w-0 flex-1">
          {/* Top Section - 2 Column Layout (Map | Chart) */}
          <div className="grid h-[50vh] min-h-[300px] grid-cols-2 gap-0 border-b">
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
              className="relative overflow-hidden"
            />
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

        {filterPanel("self-start")}
      </div>
    </div>
  );
};
