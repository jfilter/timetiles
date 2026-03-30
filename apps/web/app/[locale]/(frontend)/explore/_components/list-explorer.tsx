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

import { useLocale } from "next-intl";
import { useState } from "react";

import { BREAKPOINT_MD } from "@/lib/constants/breakpoints";
import { useMediaQuery } from "@/lib/hooks/use-media-query";

import { ChartSection } from "./chart-section";
import { EventsListPaginated } from "./events-list-paginated";
import { formatDateRange, getDatasetName } from "./explorer-helpers";
import type { ExplorerChromeElements } from "./explorer-shell";
import { ExplorerShell } from "./explorer-shell";
import { MapPanel } from "./map-panel";
import { MobileTabs } from "./mobile-tabs";
import { useExplorerMapPosition } from "./use-explorer-map-position";

type MobileTab = "map" | "chart" | "list";

export const ListExplorer = () => {
  const { initialViewState, explorerOptions } = useExplorerMapPosition();

  return (
    <ExplorerShell className="overflow-x-hidden" explorerOptions={explorerOptions}>
      {(chrome) => <ListExplorerContent chrome={chrome} initialViewState={initialViewState} />}
    </ExplorerShell>
  );
};

// ---------------------------------------------------------------------------
// Inner component — receives explorer state from ExplorerShell and can use hooks
// ---------------------------------------------------------------------------

interface ListExplorerContentProps {
  chrome: ExplorerChromeElements;
  initialViewState: { latitude: number; longitude: number; zoom: number } | null;
}

const ListExplorerContent = ({ chrome, initialViewState }: ListExplorerContentProps) => {
  const locale = useLocale();
  const { explorer, filterPanel, mobileFilters } = chrome;
  const { map, filters: filterState, selection, data } = explorer;
  const { filters } = filterState;
  const { openEvent } = selection;
  const {
    datasets,
    clusters,
    clusterChildren,
    clusterSummary,
    clusterSummaryLoading,
    effectiveBounds: chartBounds,
    boundsData,
    isLoadingInitialBounds,
    hasTemporalData,
  } = data;
  const { ref: mapRef, debouncedSimpleBounds, showZoomToData, handleZoomToData, handleBoundsChange } = map;

  const [mobileActiveTab, setMobileActiveTab] = useState<MobileTab>("list");
  const isDesktop = useMediaQuery(BREAKPOINT_MD);

  // Helper functions for filter labels using shared helpers
  const getDatasetNames = (): string[] => filters.datasets.map((id) => getDatasetName(datasets, id));
  const dateRangeLabel = formatDateRange(filters.startDate, filters.endDate, locale);

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
              clusterChildren={clusterChildren}
              clusterSummary={clusterSummary}
              clusterSummaryLoading={clusterSummaryLoading}
              onBoundsChange={handleBoundsChange}
              onEventClick={openEvent}
              initialBounds={boundsData?.bounds}
              initialViewState={initialViewState}
              isLoadingBounds={isLoadingInitialBounds}
              showZoomToData={showZoomToData}
              onZoomToData={handleZoomToData}
            />
          }
          chartContent={
            <div className="flex h-full flex-col p-4">
              <ChartSection bounds={chartBounds} fillHeight hasTemporalData={hasTemporalData} />
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
              clusterChildren={clusterChildren}
              clusterSummary={clusterSummary}
              clusterSummaryLoading={clusterSummaryLoading}
              onBoundsChange={handleBoundsChange}
              onEventClick={openEvent}
              initialBounds={boundsData?.bounds}
              initialViewState={initialViewState}
              isLoadingBounds={isLoadingInitialBounds}
              showZoomToData={showZoomToData}
              onZoomToData={handleZoomToData}
              className="relative overflow-hidden"
            />
            <div className="overflow-hidden border-l">
              <div className="flex h-full flex-col p-6">
                <ChartSection bounds={chartBounds} fillHeight hasTemporalData={hasTemporalData} />
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
