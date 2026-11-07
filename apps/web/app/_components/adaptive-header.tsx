/**
 * Adaptive header component that changes content based on current route.
 *
 * Shows marketing navigation (Home, About, etc.) on marketing pages and
 * app-specific controls (Filter, Export, Settings) on the explore page.
 * A CMS page's layout template overrides the route-based choice.
 *
 * @module
 * @category Components
 */
"use client";

import LogoDark from "@timetiles/assets/logos/latest/dark/transparent/wordmark_horizontal.svg";
import LogoLight from "@timetiles/assets/logos/latest/light/transparent/wordmark_horizontal.svg";
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
import type { LayoutSettings } from "@/lib/services/resolution/layout-resolver";
import type { Catalog, Dataset, MainMenu, User } from "@/payload-types";

import { ExploreFullHeader } from "./explore-header";
import { HeaderAuth, MobileHeaderAuth } from "./header-auth";
import { ThemePresetPicker } from "./theme-preset-picker";
import { ThemeToggle } from "./theme-toggle";

/** Stable empty arrays to avoid creating new references on each render. */
const EMPTY_CATALOGS: Catalog[] = [];
const EMPTY_DATASETS: Dataset[] = [];

interface AdaptiveHeaderProps {
  mainMenu: MainMenu;
  catalogs?: Catalog[];
  datasets?: Dataset[];
  user?: User | null;
  /** Layout template of a CMS page; `null` keeps the route-based header. */
  layout?: LayoutSettings | null;
}

/**
 * Marketing navigation component for non-app pages.
 * Shows site navigation links from Payload CMS MainMenu.
 */
const MarketingNavigation = ({ mainMenu }: { mainMenu: MainMenu }) => (
  <>
    {mainMenu.navItems?.map((item) => (
      // asChild + locale-aware Link: a plain <a href="/explore"> would drop
      // the /de prefix and silently switch the user back to English.
      <HeaderNavItem key={`${item.url}-${item.label}`} asChild>
        <Link href={item.url}>{item.label}</Link>
      </HeaderNavItem>
    ))}
  </>
);

/** Brand link to the home page with the theme-matching wordmark. */
const HeaderLogoLink = () => {
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();
  // Use light logo as default during SSR to prevent hydration mismatch
  const logo = mounted && resolvedTheme === "dark" ? LogoDark : LogoLight;

  return (
    <HeaderBrand>
      <Link href="/">
        <Image src={logo} alt="TimeTiles" className="h-9 w-auto" width={640} height={134} />
      </Link>
    </HeaderBrand>
  );
};

interface SiteNavigationProps {
  mainMenu: MainMenu;
  user: User | null;
  pathname: string;
}

/** Site navigation, desktop actions, and the mobile navigation drawer. */
const SiteNavigation = ({ mainMenu, user, pathname }: Readonly<SiteNavigationProps>) => {
  const { isDefaultSite } = useSite();
  const t = useTranslations("Common");

  // On non-default sites, hide ingestion-related nav items
  const filteredMenu = isDefaultSite
    ? mainMenu
    : { ...mainMenu, navItems: mainMenu.navItems?.filter((item) => item.url !== "/ingest") };

  return (
    <>
      <HeaderNav>
        <MarketingNavigation mainMenu={filteredMenu} />
      </HeaderNav>

      <HeaderActions>
        {/* Desktop only: auth, locale switcher, and theme toggle */}
        <div className="hidden md:block">
          <HeaderAuth user={user} />
        </div>
        <div className="hidden md:block">
          <LocaleSwitcher />
        </div>
        <div className="hidden items-center gap-1 md:flex">
          <ThemePresetPicker />
          <ThemeToggle />
        </div>

        <MobileNavDrawer>
          <MobileNavDrawerTrigger />
          <MobileNavDrawerContent>
            {filteredMenu.navItems?.map((item) => (
              <MobileNavDrawerLink key={`mobile-${item.url}-${item.label}`} active={pathname === item.url} asChild>
                <Link href={item.url}>{item.label}</Link>
              </MobileNavDrawerLink>
            ))}

            {/* Divider */}
            <div className="border-primary/20 dark:border-primary/40 my-2 border-t" />

            <MobileHeaderAuth user={user} pathname={pathname} />

            {/* Theme toggle in drawer */}
            <div className="flex items-center justify-between px-6 py-4">
              <span className="text-foreground dark:text-foreground font-serif text-lg">{t("theme")}</span>
              <ThemeToggle />
            </div>
          </MobileNavDrawerContent>
        </MobileNavDrawer>
      </HeaderActions>
    </>
  );
};

type HeaderMode = "explore" | LayoutSettings["headerVariant"];

/** A layout template's variant wins; without one, explore routes get app controls. */
const resolveHeaderMode = (layout: LayoutSettings | null, pathname: string): HeaderMode => {
  if (layout != null) return layout.headerVariant;
  return pathname === "/explore" || pathname === "/explore/list" ? "explore" : "marketing";
};

/**
 * Adaptive header that shows different content based on current route.
 *
 * - Marketing pages: Shows site navigation
 * - Explore page: Shows app controls with clean functional design
 * - With a layout template: the template's variant ("minimal" is logo only)
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
  layout = null,
}: Readonly<AdaptiveHeaderProps>) => {
  const pathname = usePathname();
  const mode = resolveHeaderMode(layout, pathname);

  // Subscribe to client-side auth state so the navbar reacts to login/logout
  // without needing a full page reload. Server prop is used during SSR and
  // while the client query is loading to avoid a flash.
  const { data: authData, isLoading: isAuthLoading } = useCurrentUserQuery();
  const resolvedUser = isAuthLoading ? (user ?? null) : (authData?.user ?? null);

  if (mode === "none") return null;

  // Explore pages use a custom full-width layout for alignment with content below
  if (mode === "explore") {
    const currentView = pathname === "/explore/list" ? "list" : "map";
    return (
      <Header variant="app">
        <ExploreFullHeader catalogs={catalogs} datasets={datasets} currentView={currentView} />
      </Header>
    );
  }

  return (
    <Header variant={mode === "app" ? "app" : "marketing"} sticky={layout?.stickyHeader ?? true}>
      <HeaderLogoLink />
      {mode !== "minimal" && <SiteNavigation mainMenu={mainMenu} user={resolvedUser} pathname={pathname} />}
    </Header>
  );
};
