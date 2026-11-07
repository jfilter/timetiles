// @vitest-environment jsdom
/**
 * Tests for the adaptive header's layout template variants.
 *
 * Without a template the header follows the route (explore controls on
 * /explore, site navigation elsewhere); a template's variant overrides that.
 *
 * @module
 * @category Unit Tests
 */
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { UIProvider } from "@timetiles/ui/provider";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdaptiveHeader } from "@/app/_components/adaptive-header";
import { useTranslatedUILabels } from "@/components/use-translated-ui-labels";
import type { LayoutSettings } from "@/lib/services/resolution/layout-resolver";
import type { MainMenu } from "@/payload-types";

import en from "../../../messages/en.json";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("@timetiles/assets/logos/latest/dark/transparent/wordmark_horizontal.svg", () => ({ default: "dark.svg" }));
vi.mock("@timetiles/assets/logos/latest/light/transparent/wordmark_horizontal.svg", () => ({ default: "light.svg" }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span>{alt}</span> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
  usePathname: () => navigation.pathname,
}));
vi.mock("@/lib/context/site-context", () => ({ useSite: () => ({ isDefaultSite: true }) }));
vi.mock("@/lib/hooks/use-auth-queries", () => ({
  useCurrentUserQuery: () => ({ data: { user: null }, isLoading: false }),
}));
vi.mock("@/lib/hooks/use-theme", () => ({ useMounted: () => false, useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@/components/locale-switcher", () => ({ LocaleSwitcher: () => null }));
vi.mock("@/app/_components/explore-header", () => ({ ExploreFullHeader: () => <div>Explore controls</div> }));
vi.mock("@/app/_components/header-auth", () => ({ HeaderAuth: () => null, MobileHeaderAuth: () => null }));
vi.mock("@/app/_components/theme-preset-picker", () => ({ ThemePresetPicker: () => null }));
vi.mock("@/app/_components/theme-toggle", () => ({ ThemeToggle: () => null }));

const mainMenu = { id: 1, navItems: [{ id: "1", label: "About", url: "/about" }] } as MainMenu;

const layoutWith = (overrides: Partial<LayoutSettings>): LayoutSettings => ({
  headerVariant: "marketing",
  stickyHeader: true,
  footerVariant: "full",
  contentMaxWidth: "lg",
  ...overrides,
});

const TranslatedUI = ({ children }: { children: ReactNode }) => (
  <UIProvider labels={useTranslatedUILabels()}>{children}</UIProvider>
);

const renderHeader = (layout?: LayoutSettings) =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <TranslatedUI>
        <AdaptiveHeader mainMenu={mainMenu} layout={layout} />
      </TranslatedUI>
    </NextIntlClientProvider>
  );

beforeEach(() => {
  navigation.pathname = "/";
});

afterEach(cleanup);

describe("AdaptiveHeader layout variants", () => {
  it("keeps the sticky marketing header with navigation without a template", () => {
    renderHeader();

    const banner = screen.getByRole("banner");
    expect(banner).toHaveClass("sticky", "top-0");
    expect(screen.getByRole("link", { name: "About" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.Common.openNavigation })).toBeInTheDocument();
  });

  it("keeps the explore controls on explore routes without a template", () => {
    navigation.pathname = "/explore";
    renderHeader();

    expect(screen.getByRole("banner")).toHaveTextContent("Explore controls");
    expect(screen.queryByRole("link", { name: "About" })).not.toBeInTheDocument();
  });

  it("renders only the home logo link for the minimal variant", () => {
    renderHeader(layoutWith({ headerVariant: "minimal" }));

    const banner = screen.getByRole("banner");
    expect(screen.getByRole("link", { name: "TimeTiles" })).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.Common.openNavigation })).not.toBeInTheDocument();
    expect(banner).toHaveClass("sticky");
  });

  it("renders the app-styled header with full navigation for the app variant", () => {
    renderHeader(layoutWith({ headerVariant: "app" }));

    expect(screen.getByRole("banner")).toHaveClass("border-primary/30");
    expect(screen.getByRole("link", { name: "About" })).toBeInTheDocument();
  });

  it("does not stick the header when the template disables it", () => {
    renderHeader(layoutWith({ stickyHeader: false }));

    const banner = screen.getByRole("banner");
    expect(banner).not.toHaveClass("sticky");
    expect(banner).toHaveClass("relative");
  });

  it("renders no header for the none variant", () => {
    renderHeader(layoutWith({ headerVariant: "none" }));

    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("lets a template override the route-based explore header", () => {
    navigation.pathname = "/explore";
    renderHeader(layoutWith({ headerVariant: "marketing" }));

    expect(screen.queryByText("Explore controls")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About" })).toBeInTheDocument();
  });
});
