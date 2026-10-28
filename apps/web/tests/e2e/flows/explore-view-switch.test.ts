/**
 * E2E tests for state persistence when switching between map and list views.
 *
 * Verifies that map position (zoom) is preserved when navigating between
 * /explore and /explore/list.
 *
 * @module
 * @category E2E Tests
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { ExplorePage } from "../pages/explore.page";
import { isMobileLayout, showExplorerSurface } from "../pages/responsive-layout";

/** Switch views: the header toggle on desktop, the view tabs on mobile, where both routes render the same tabs. */
const switchView = async (page: Page, view: "map" | "list") => {
  if (isMobileLayout(page)) return showExplorerSurface(page, view);
  await page
    .locator("button")
    .filter({ hasText: view === "list" ? /^List$/ : /^Map$/ })
    .click();
  await expect(page).toHaveURL(view === "list" ? /\/explore\/list/ : /\/explore\?/, { timeout: 15000 });
};

test.describe("Explore View Switch - Map Position Persistence", () => {
  test("list view preserves URL zoom parameter", async ({ page }) => {
    // Navigate directly to list view with a specific zoom level
    await page.goto("/explore/list?lat=48.1351&lng=11.5820&zoom=10", { timeout: 30000, waitUntil: "domcontentloaded" });
    await new ExplorePage(page).waitForMapLoad();

    // The zoom parameter should be preserved in the URL
    const url = new URL(page.url());
    const zoom = url.searchParams.get("zoom");
    expect(zoom).toBe("10");
  });

  test("preserves URL params when switching from map to list view", async ({ page }) => {
    await page.goto("/explore?lat=48.1351&lng=11.5820&zoom=10&startDate=2024-01-01", {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    });
    await new ExplorePage(page).waitForMapLoad();

    await switchView(page, "list");

    // URL params must survive the view switch
    const url = new URL(page.url());
    expect(url.searchParams.has("lat")).toBe(true);
    expect(url.searchParams.has("zoom")).toBe(true);
    expect(url.searchParams.get("startDate")).toBe("2024-01-01");
  });

  test("preserves URL params when switching from list to map view", async ({ page }) => {
    await page.goto("/explore/list?lat=52.5200&lng=13.4050&zoom=12&endDate=2025-06-30", {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    });
    await new ExplorePage(page).waitForMapLoad();

    await switchView(page, "map");

    const url = new URL(page.url());
    expect(url.searchParams.has("lat")).toBe(true);
    expect(url.searchParams.has("zoom")).toBe(true);
    expect(url.searchParams.get("endDate")).toBe("2025-06-30");
  });
});
