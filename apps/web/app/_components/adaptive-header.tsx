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

import LogoDark from "@workspace/assets/logos/final/dark/logo-128.png";
import LogoLight from "@workspace/assets/logos/final/light/logo-128.png";
import { Header, HeaderActions, HeaderBrand, HeaderNav, HeaderNavItem } from "@workspace/ui";
import { ArrowLeft, Download, Filter, Menu, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

import { useActiveFiltersCount } from "@/lib/hooks/use-active-filters-count";
import { useTheme } from "@/lib/hooks/use-theme";
import { useUIStore } from "@/lib/store";
import { formatCenterCoordinates, formatEventCount } from "@/lib/utils/coordinates";
import type { MainMenu } from "@/payload-types";

import { ThemeToggle } from "./theme-toggle";

interface AdaptiveHeaderProps {
  mainMenu: MainMenu;
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
 * Explore page brand section.
 * Shows back button on far left.
 */
const ExploreBrand = () => (
  <Link
    href="/"
    className="hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 flex items-center rounded-sm p-2 transition-colors"
    title="Back to home"
  >
    <ArrowLeft className="text-cartographic-navy dark:text-cartographic-charcoal h-5 w-5" />
  </Link>
);

/**
 * Explore page navigation component.
 * Shows map statistics, "Event Explorer" title, and active filter count badge.
 */
const ExploreNavigation = () => {
  const filterCount = useActiveFiltersCount();
  const mapBounds = useUIStore((state) => state.ui.mapBounds);
  const mapStats = useUIStore((state) => state.ui.mapStats);

  return (
    <div className="flex items-center gap-4">
      {/* Map Statistics */}
      {mapBounds != null && mapStats != null && (
        <>
          {/* Center Coordinates */}
          <span className="text-cartographic-navy dark:text-cartographic-charcoal hidden font-mono text-xs lg:inline">
            {formatCenterCoordinates(mapBounds)}
          </span>

          {/* Separator between coordinates and count */}
          {formatEventCount(mapStats.visibleEvents, mapStats.totalEvents) != null && (
            <span className="text-cartographic-navy/30 dark:text-cartographic-charcoal/30 hidden font-mono lg:inline">
              ·
            </span>
          )}

          {/* Event Count */}
          {formatEventCount(mapStats.visibleEvents, mapStats.totalEvents) != null && (
            <span className="text-cartographic-navy dark:text-cartographic-charcoal hidden font-mono text-xs md:inline">
              {formatEventCount(mapStats.visibleEvents, mapStats.totalEvents)}
            </span>
          )}

          {/* Separator after stats */}
          <span className="text-cartographic-navy/30 dark:text-cartographic-charcoal/30 hidden md:inline">·</span>
        </>
      )}

      {/* Event Explorer Title */}
      <span className="text-cartographic-charcoal dark:text-cartographic-charcoal font-sans text-sm font-semibold">
        Event Explorer
      </span>

      {/* Active Filter Badge */}
      {filterCount > 0 && (
        <span className="bg-cartographic-blue/10 text-cartographic-blue dark:bg-cartographic-blue/20 rounded-sm px-2 py-0.5 font-sans text-xs">
          {filterCount} filter{filterCount > 1 ? "s" : ""} active
        </span>
      )}
    </div>
  );
};

/**
 * Explore page action buttons component.
 * Shows filter toggle, export, settings, and mobile menu buttons.
 */
const ExploreActions = () => {
  const { ui, toggleFilterDrawer } = useUIStore();
  const isFilterOpen = ui.isFilterDrawerOpen;

  return (
    <>
      <button
        type="button"
        onClick={toggleFilterDrawer}
        className={`hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 rounded-sm p-2 transition-colors ${
          isFilterOpen ? "bg-cartographic-navy/10 dark:bg-cartographic-charcoal/10" : ""
        }`}
        title={isFilterOpen ? "Hide filters" : "Show filters"}
        aria-label={isFilterOpen ? "Hide filters" : "Show filters"}
      >
        <Filter className="text-cartographic-navy dark:text-cartographic-charcoal h-5 w-5" />
      </button>
      <button
        type="button"
        className="hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 rounded-sm p-2 transition-colors"
        title="Export data"
        aria-label="Export data"
      >
        <Download className="text-cartographic-navy dark:text-cartographic-charcoal h-5 w-5" />
      </button>
      <button
        type="button"
        className="hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 rounded-sm p-2 transition-colors"
        title="Settings"
        aria-label="Settings"
      >
        <Settings className="text-cartographic-navy dark:text-cartographic-charcoal h-5 w-5" />
      </button>
      <ThemeToggle />
      <button
        type="button"
        className="hover:bg-cartographic-navy/10 dark:hover:bg-cartographic-charcoal/10 rounded-sm p-2 transition-colors lg:hidden"
        title="Menu"
        aria-label="Menu"
      >
        <Menu className="text-cartographic-navy dark:text-cartographic-charcoal h-5 w-5" />
      </button>
    </>
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
 * <AdaptiveHeader mainMenu={mainMenuFromPayload} />
 * ```
 */
export const AdaptiveHeader = ({ mainMenu }: Readonly<AdaptiveHeaderProps>) => {
  const pathname = usePathname();
  const isExplorePage = pathname === "/explore";
  const { resolvedTheme } = useTheme();
  const logo = resolvedTheme === "dark" ? LogoDark : LogoLight;

  return (
    <Header variant={isExplorePage ? "app" : "marketing"} decorative={!isExplorePage}>
      <HeaderBrand>
        {isExplorePage ? (
          <ExploreBrand />
        ) : (
          <Link href="/" className="flex items-center gap-3">
            <Image src={logo} alt="TimeTiles" className="h-9 w-9 shrink-0" width={128} height={128} />
            <span className="text-cartographic-navy dark:text-cartographic-charcoal font-sans text-xl font-bold tracking-tight">
              TimeTiles
            </span>
          </Link>
        )}
      </HeaderBrand>

      <HeaderNav>{isExplorePage ? <ExploreNavigation /> : <MarketingNavigation mainMenu={mainMenu} />}</HeaderNav>

      <HeaderActions>{isExplorePage ? <ExploreActions /> : <ThemeToggle />}</HeaderActions>
    </Header>
  );
};
