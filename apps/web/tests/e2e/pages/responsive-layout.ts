/**
 * Viewport-aware navigation for pages whose mobile layout hides parts of the desktop one.
 *
 * Below `BREAKPOINT_MD` the explorer shows map, chart and list as tabs and the filters in a
 * bottom sheet, and the site header moves its links into a navigation drawer.
 *
 * @module
 * @category E2E Tests
 */
import { expect, type Locator, type Page } from "@playwright/test";

import { BREAKPOINT_MD_PX } from "@/lib/constants/breakpoints";

/** Part of the explorer a step needs; desktop shows all of them at once. */
export type ExplorerSurface = "map" | "list" | "filters";

const EXPLORER_TAB_NAMES = { map: "Map", list: "List" } as const;

/**
 * True when the page renders its mobile layout. Reads the emulated viewport, not `matchMedia`:
 * before the first navigation, `about:blank` has no viewport meta and lays out 980px wide.
 */
export const isMobileLayout = (page: Page): boolean => (page.viewportSize()?.width ?? Infinity) < BREAKPOINT_MD_PX;

/** Bring an explorer surface into view on the mobile layout; a no-op on desktop. */
export const showExplorerSurface = async (page: Page, surface: ExplorerSurface): Promise<void> => {
  if (!isMobileLayout(page)) return;

  await page.getByRole("tablist").waitFor({ state: "visible", timeout: 15000 });
  const openFiltersButton = page.getByRole("button", { name: "Open filters" });
  const filtersOpen = async () => (await openFiltersButton.getAttribute("inert")) != null;

  if (surface === "filters") {
    if (!(await filtersOpen())) await openFiltersButton.click();
    await expect(page.getByRole("dialog", { name: "Filters" })).toBeInViewport({ timeout: 5000 });
    return;
  }

  if (await filtersOpen()) {
    await page.getByRole("button", { name: "Close filters" }).click();
    await expect(openFiltersButton).not.toHaveAttribute("inert");
  }
  const tab = page.getByRole("tab", { name: EXPLORER_TAB_NAMES[surface] });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
};

/** The header's sign-in link, opening the navigation drawer first on the mobile layout. */
export const headerSignInLink = async (page: Page): Promise<Locator> => {
  if (isMobileLayout(page)) {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    return page.getByRole("dialog").getByRole("link", { name: /sign in/i });
  }
  return page.getByRole("link", { name: /sign in/i });
};

/**
 * Open the signed-in account menu: the user dropdown on desktop, the navigation drawer on mobile.
 * Returns a lookup for its entries, which are menu items on desktop and links or buttons on mobile.
 */
export const openAccountMenu = async (page: Page, userName: string | RegExp) => {
  if (isMobileLayout(page)) {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const drawer = page.getByRole("dialog");
    return (name: string | RegExp): Locator =>
      drawer.getByRole("link", { name }).or(drawer.getByRole("button", { name }));
  }
  const userMenuButton = page.getByRole("button", { name: userName });
  await expect(userMenuButton).toBeVisible({ timeout: 5000 });
  await userMenuButton.click();
  return (name: string | RegExp): Locator => page.getByRole("menuitem", { name });
};
