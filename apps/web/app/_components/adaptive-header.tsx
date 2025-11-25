/**
 * Adaptive header component that changes content based on current route.
 *
 * Shows marketing navigation (Home, About, etc.) on marketing pages and
 * app-specific controls (Filter, Export, Settings) on the explore page.
 * Uses cartographic Header components with route-based variant selection.
 *
 * @module
 * @category Components
 */
"use client";

import LogoDark from "@timetiles/assets/logos/final/dark/logo-128.png";
import LogoLight from "@timetiles/assets/logos/final/light/logo-128.png";
import { Header, HeaderActions, HeaderBrand, HeaderNav, HeaderNavItem } from "@timetiles/ui";
import { ArrowLeft, Filter } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";

import { useFilters } from "@/lib/filters";
import { useTheme } from "@/lib/hooks/use-theme";
import { useUIStore } from "@/lib/store";
import { formatCenterCoordinates, formatEventCount } from "@/lib/utils/coordinates";
import type { Catalog, Dataset, MainMenu } from "@/payload-types";

import { ThemeToggle } from "./theme-toggle";

interface AdaptiveHeaderProps {
  mainMenu: MainMenu;
  catalogs?: Catalog[];
  datasets?: Dataset[];
}

/**
 * Marketing navigation component for non-app pages.
 * Shows site navigation links from Payload CMS MainMenu.
 */
const MarketingNavigation = ({ mainMenu }: { mainMenu: MainMenu }) => (
  <>
    {mainMenu.navItems?.map((item) => (
      <HeaderNavItem key={`${item.url}-${item.label}`} href={item.url}>
        {item.label}
      </HeaderNavItem>
    ))}
  </>
);

/**
 * Format date for display in header.
 */
const formatHeaderDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

/**
 * Build dynamic title based on active filters.
 */
const buildDynamicTitle = (
  filters: { catalog?: string | null; datasets: string[]; startDate?: string | null; endDate?: string | null },
  catalogs: Catalog[],
  datasets: Dataset[]
): { title: string; dateRange: string | null } => {
  // Build title based on catalog/dataset selection
  let title = "All Events";

  if (filters.catalog) {
    const catalog = catalogs.find((c) => String(c.id) === filters.catalog);
    title = catalog?.name ?? "Events";
  } else if (filters.datasets.length > 0) {
    if (filters.datasets.length === 1) {
      const dataset = datasets.find((d) => String(d.id) === filters.datasets[0]);
      title = dataset?.name ?? "Events";
    } else if (filters.datasets.length <= 2) {
      const names = filters.datasets
        .map((id) => datasets.find((d) => String(d.id) === id)?.name)
        .filter(Boolean)
        .slice(0, 2);
      title = names.join(", ");
    } else {
      title = `${filters.datasets.length} Datasets`;
    }
  }

  // Build date range string
  let dateRange: string | null = null;
  const hasStart = filters.startDate != null && filters.startDate !== "";
  const hasEnd = filters.endDate != null && filters.endDate !== "";

  if (hasStart && hasEnd) {
    dateRange = `${formatHeaderDate(filters.startDate!)} – ${formatHeaderDate(filters.endDate!)}`;
  } else if (hasStart) {
    dateRange = `From ${formatHeaderDate(filters.startDate!)}`;
  } else if (hasEnd) {
    dateRange = `Until ${formatHeaderDate(filters.endDate!)}`;
  }

  return { title, dateRange };
};

interface ExploreNavigationProps {
  catalogs: Catalog[];
  datasets: Dataset[];
}

/**
 * Explore page full header content.
 * Renders everything in a single flex container to ensure alignment with content below:
 * - Back button on far left
 * - Left half (over map): centered coordinates and event count
 * - Right half (over list): centered title and date range
 * - Filter area: matches sidebar width (320px when open, 0 when closed)
 */
const ExploreFullHeader = ({ catalogs, datasets }: ExploreNavigationProps) => {
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
    <div className="-mx-6 flex flex-1 items-center md:-mx-8">
      {/* Left half - over the map (includes back button) */}
      <div className="flex flex-1 items-center">
        {/* Back button */}
        <Link
          href="/"
          className="hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 ml-6 flex items-center rounded-sm p-2 transition-colors md:ml-8"
          title="Back to home"
        >
          <ArrowLeft className="text-cartographic-navy dark:text-cartographic-charcoal h-5 w-5" />
        </Link>

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
          isFilterDrawerOpen ? "w-80 pr-6 md:pr-8" : "w-0 overflow-hidden"
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
 * Adaptive header that shows different content based on current route.
 *
 * - Marketing pages: Shows site navigation with decorative grid overlay
 * - Explore page: Shows app controls with clean functional design
 *
 * @example
 * ```tsx
 * <AdaptiveHeader mainMenu={mainMenuFromPayload} catalogs={catalogs} datasets={datasets} />
 * ```
 */
export const AdaptiveHeader = ({ mainMenu, catalogs = [], datasets = [] }: Readonly<AdaptiveHeaderProps>) => {
  const pathname = usePathname();
  const isExplorePage = pathname === "/explore";
  const { resolvedTheme } = useTheme();
  const logo = resolvedTheme === "dark" ? LogoDark : LogoLight;

  // Explore page uses a custom full-width layout for alignment with content below
  if (isExplorePage) {
    return (
      <Header variant="app">
        <ExploreFullHeader catalogs={catalogs} datasets={datasets} />
      </Header>
    );
  }

  // Marketing pages use standard brand/nav/actions layout
  return (
    <Header variant="marketing" decorative>
      <HeaderBrand>
        <Link href="/" className="flex items-center gap-3">
          <Image src={logo} alt="TimeTiles" className="h-9 w-9 shrink-0" width={128} height={128} />
          <span className="text-cartographic-navy dark:text-cartographic-charcoal font-sans text-xl font-bold tracking-tight">
            TimeTiles
          </span>
        </Link>
      </HeaderBrand>

      <HeaderNav>
        <MarketingNavigation mainMenu={mainMenu} />
      </HeaderNav>

      <HeaderActions>
        <ThemeToggle />
      </HeaderActions>
    </Header>
  );
};
