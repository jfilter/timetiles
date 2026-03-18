/**
 * Explore page header components for mobile and desktop layouts.
 *
 * @module
 * @category Components
 */
"use client";

import { ArrowLeft, Filter } from "lucide-react";
import React, { useEffect, useState } from "react";

import { ViewToggle } from "@/app/[locale]/(frontend)/explore/_components/view-toggle";
import { Link } from "@/i18n/navigation";
import { formatCenterCoordinates, formatEventCount } from "@/lib/geospatial/formatting";
import { useFilters } from "@/lib/hooks/use-filters";
import { useUIStore } from "@/lib/store";
import type { Catalog, Dataset } from "@/payload-types";

import { buildDynamicTitle } from "./header-utils";

export interface ExploreNavigationProps {
  catalogs: Catalog[];
  datasets: Dataset[];
  currentView: "map" | "list";
}

/**
 * Mobile header for explore pages - simplified single-row layout.
 * Shows catalog/dataset title and event count (visible/total).
 */
const ExploreMobileHeader = ({ catalogs, datasets }: Omit<ExploreNavigationProps, "currentView">) => {
  const { filters } = useFilters();
  const toggleFilterDrawer = useUIStore((state) => state.toggleFilterDrawer);
  const mapStats = useUIStore((state) => state.ui.mapStats);

  const { title } = buildDynamicTitle(filters, catalogs, datasets);

  // Format event count as (visible/total)
  const eventCount =
    mapStats == null ? null : `(${mapStats.visibleEvents.toLocaleString()}/${mapStats.totalEvents.toLocaleString()})`;

  return (
    <div className="-mx-6 flex flex-1 items-center justify-between">
      {/* Back button */}
      <Link
        href="/"
        className="hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 ml-6 flex items-center rounded-sm p-2 transition-colors"
        title="Back to home"
      >
        <ArrowLeft className="text-cartographic-navy dark:text-cartographic-charcoal h-5 w-5" />
      </Link>

      {/* Centered title and event count */}
      <div className="flex flex-col items-center">
        <span className="text-cartographic-charcoal dark:text-cartographic-charcoal font-sans text-sm font-semibold">
          {title}
        </span>
        {eventCount && (
          <span className="text-cartographic-navy/60 dark:text-cartographic-charcoal/60 font-mono text-xs">
            {eventCount}
          </span>
        )}
      </div>

      {/* Filter icon */}
      <button
        type="button"
        onClick={toggleFilterDrawer}
        className="hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 mr-6 rounded-sm p-2 transition-colors"
        title="Show filters"
        aria-label="Show filters"
      >
        <Filter className="text-cartographic-navy dark:text-cartographic-charcoal h-5 w-5" />
      </button>
    </div>
  );
};

/**
 * Desktop header for explore pages - split layout matching content panels.
 * Renders everything in a single flex container to ensure alignment with content below:
 * - Back button on far left
 * - Left half (over map): centered coordinates and event count
 * - Right half (over list): centered title and date range
 * - Filter area: matches sidebar width (320px when open, 0 when closed)
 */
const ExploreDesktopHeader = ({ catalogs, datasets, currentView }: ExploreNavigationProps) => {
  const { filters } = useFilters();
  const mapBounds = useUIStore((state) => state.ui.mapBounds);
  const mapStats = useUIStore((state) => state.ui.mapStats);
  const isFilterDrawerOpen = useUIStore((state) => state.ui.isFilterDrawerOpen);
  const toggleFilterDrawer = useUIStore((state) => state.toggleFilterDrawer);

  // Delay showing the filter icon until closing animation completes
  const [showFilterIcon, setShowFilterIcon] = useState(!isFilterDrawerOpen);

  useEffect(() => {
    if (isFilterDrawerOpen) {
      // Immediately hide icon when opening
      setShowFilterIcon(false);
    } else {
      // Delay showing icon until animation completes (500ms = duration-500)
      const timer = setTimeout(() => {
        setShowFilterIcon(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isFilterDrawerOpen]);

  const { title, dateRange } = buildDynamicTitle(filters, catalogs, datasets);
  const eventCount = mapStats ? formatEventCount(mapStats.visibleEvents, mapStats.totalEvents) : null;

  return (
    <div className="-mx-8 flex flex-1 items-center">
      {/* Left half - over the map (includes back button and view toggle) */}
      <div className="flex flex-1 items-center">
        {/* Back button */}
        <Link
          href="/"
          className="hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 ml-8 flex items-center rounded-sm p-2 transition-colors"
          title="Back to home"
        >
          <ArrowLeft className="text-cartographic-navy dark:text-cartographic-charcoal h-5 w-5" />
        </Link>

        {/* View Toggle */}
        <div className="ml-2">
          <ViewToggle currentView={currentView} />
        </div>

        {/* Centered stats */}
        <div className="flex flex-1 items-center justify-center gap-2">
          {eventCount && (
            <span className="text-cartographic-navy dark:text-cartographic-charcoal font-mono text-xs">
              {eventCount}
            </span>
          )}
          {eventCount && mapBounds != null && (
            <span className="text-cartographic-navy/30 dark:text-cartographic-charcoal/30">·</span>
          )}
          {mapBounds != null && (
            <span className="text-cartographic-navy/50 dark:text-cartographic-charcoal/50 font-mono text-xs">
              {formatCenterCoordinates(mapBounds)}
            </span>
          )}
        </div>
      </div>

      {/* Right half - over the event list */}
      <div className="flex flex-1 items-center border-l">
        {/* Centered title and date range */}
        <div className="flex flex-1 items-center justify-center gap-3">
          <span className="text-cartographic-charcoal dark:text-cartographic-charcoal font-sans text-sm font-semibold">
            {title}
          </span>
          {dateRange && (
            <>
              <span className="text-cartographic-navy/30 dark:text-cartographic-charcoal/30">·</span>
              <span className="text-cartographic-navy dark:text-cartographic-charcoal font-sans text-sm">
                {dateRange}
              </span>
            </>
          )}
        </div>

        {/* Filter icon button - only visible after closing animation completes */}
        {showFilterIcon && (
          <button
            type="button"
            onClick={toggleFilterDrawer}
            className="hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 mr-4 rounded-sm p-2 transition-colors"
            title="Show filters"
            aria-label="Show filters"
          >
            <Filter className="text-cartographic-navy dark:text-cartographic-charcoal h-5 w-5" />
          </button>
        )}
      </div>

      {/* Filter area - matches sidebar width, shows clickable "Filters" label when open */}
      <div
        className={`flex items-center justify-center border-l transition-all duration-500 ease-in-out ${
          isFilterDrawerOpen ? "w-80 pr-8" : "w-0 overflow-hidden"
        }`}
      >
        <button
          type="button"
          onClick={toggleFilterDrawer}
          className="hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 rounded-sm px-3 py-1 transition-colors"
          title="Hide filters"
          aria-label="Hide filters"
        >
          <span className="text-cartographic-charcoal font-sans text-sm font-semibold">Filters</span>
        </button>
      </div>
    </div>
  );
};

/**
 * Combined explore header that shows appropriate layout for screen size.
 */
export const ExploreFullHeader = ({ catalogs, datasets, currentView }: ExploreNavigationProps) => {
  return (
    <>
      {/* Mobile: simplified header */}
      <div className="flex flex-1 md:hidden">
        <ExploreMobileHeader catalogs={catalogs} datasets={datasets} />
      </div>
      {/* Desktop: full split-pane header */}
      <div className="hidden flex-1 md:flex">
        <ExploreDesktopHeader catalogs={catalogs} datasets={datasets} currentView={currentView} />
      </div>
    </>
  );
};
