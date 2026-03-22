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

import LogoDark from "@timetiles/assets/logos/latest/dark/no-grid/png/wordmark_horizontal_512.png";
import LogoLight from "@timetiles/assets/logos/latest/light/no-grid/png/wordmark_horizontal_512.png";
import {
  Header,
  HeaderActions,
  HeaderBrand,
  HeaderNav,
  HeaderNavItem,
  MobileNavDrawer,
  MobileNavDrawerContent,
  MobileNavDrawerLink,
  MobileNavDrawerTrigger,
} from "@timetiles/ui";
import Image from "next/image";
import { useTranslations } from "next-intl";
import React from "react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link, usePathname } from "@/i18n/navigation";
import { useSite } from "@/lib/context/site-context";
import { useCurrentUserQuery } from "@/lib/hooks/use-auth-queries";
import { useMounted, useTheme } from "@/lib/hooks/use-theme";
import type { Catalog, Dataset, MainMenu, User } from "@/payload-types";

import { ExploreFullHeader } from "./explore-header";
import { HeaderAuth } from "./header-auth";
import { ThemeToggle } from "./theme-toggle";

/** Stable empty arrays to avoid creating new references on each render. */
const EMPTY_CATALOGS: Catalog[] = [];
const EMPTY_DATASETS: Dataset[] = [];

interface AdaptiveHeaderProps {
  mainMenu: MainMenu;
  catalogs?: Catalog[];
  datasets?: Dataset[];
  user?: User | null;
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
 * Adaptive header that shows different content based on current route.
 *
 * - Marketing pages: Shows site navigation
 * - Explore page: Shows app controls with clean functional design
 *
 * @example
 * ```tsx
 * <AdaptiveHeader mainMenu={mainMenuFromPayload} catalogs={catalogs} datasets={datasets} />
 * ```
 */
export const AdaptiveHeader = ({
  mainMenu,
  catalogs = EMPTY_CATALOGS,
  datasets = EMPTY_DATASETS,
  user = null,
}: Readonly<AdaptiveHeaderProps>) => {
  const pathname = usePathname();
  const { isDefaultSite } = useSite();
  const t = useTranslations("Common");
  const isExplorePage = pathname === "/explore" || pathname === "/explore/list";
  const currentView: "map" | "list" = pathname === "/explore/list" ? "list" : "map";
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();
  // Use light logo as default during SSR to prevent hydration mismatch
  const logo = mounted && resolvedTheme === "dark" ? LogoDark : LogoLight;

  // Subscribe to client-side auth state so the navbar reacts to login/logout
  // without needing a full page reload. Server prop is used during SSR and
  // while the client query is loading to avoid a flash.
  const { data: authData, isLoading: isAuthLoading } = useCurrentUserQuery();
  const resolvedUser = isAuthLoading ? (user ?? null) : (authData?.user ?? null);

  // Explore pages use a custom full-width layout for alignment with content below
  if (isExplorePage) {
    return (
      <Header variant="app">
        <ExploreFullHeader catalogs={catalogs} datasets={datasets} currentView={currentView} />
      </Header>
    );
  }

  // On non-default sites, hide ingestion-related nav items
  const filteredMenu = isDefaultSite
    ? mainMenu
    : { ...mainMenu, navItems: mainMenu.navItems?.filter((item) => item.url !== "/ingest") };

  // Marketing pages use standard brand/nav/actions layout
  return (
    <Header variant="marketing">
      <HeaderBrand>
        <Link href="/">
          <Image src={logo} alt="TimeTiles" className="h-9 w-auto" width={640} height={134} />
        </Link>
      </HeaderBrand>

      <HeaderNav>
        <MarketingNavigation mainMenu={filteredMenu} />
      </HeaderNav>

      <HeaderActions>
        {/* Desktop only: auth, locale switcher, and theme toggle */}
        <div className="hidden md:block">
          <HeaderAuth user={resolvedUser} />
        </div>
        <div className="hidden md:block">
          <LocaleSwitcher />
        </div>
        <div className="hidden md:block">
          <ThemeToggle />
        </div>

        {/* Mobile navigation drawer */}
        <MobileNavDrawer>
          <MobileNavDrawerTrigger />
          <MobileNavDrawerContent>
            {filteredMenu.navItems?.map((item) => (
              <MobileNavDrawerLink key={`mobile-${item.url}-${item.label}`} active={pathname === item.url} asChild>
                <Link href={item.url}>{item.label}</Link>
              </MobileNavDrawerLink>
            ))}

            {/* Divider */}
            <div className="border-cartographic-navy/20 dark:border-cartographic-navy/40 my-2 border-t" />

            {/* Auth link for mobile */}
            <MobileNavDrawerLink active={pathname === "/login"} asChild>
              <Link href={resolvedUser ? "/dashboard" : "/login"}>{resolvedUser ? t("dashboard") : t("signIn")}</Link>
            </MobileNavDrawerLink>

            {/* Theme toggle in drawer */}
            <div className="flex items-center justify-between px-6 py-4">
              <span className="text-cartographic-charcoal dark:text-cartographic-charcoal font-serif text-lg">
                {t("theme")}
              </span>
              <ThemeToggle />
            </div>
          </MobileNavDrawerContent>
        </MobileNavDrawer>
      </HeaderActions>
    </Header>
  );
};
