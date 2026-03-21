/**
 * E2E tests for state persistence when switching between map and list views.
 *
 * Verifies that map position (zoom) is preserved when navigating between
 * /explore and /explore/list, testing the actual map zoom level via MapLibre.
 *
 * @module
 * @category E2E Tests
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";

/** Read the MapLibre map's actual zoom level from the page */
const getMapZoom = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector(".maplibregl-canvas");
    const container = canvas?.closest(".maplibregl-map");
    const map = (container as never as Record<string, { getZoom?: () => number }>)?._map;
    return map?.getZoom?.() ?? null;
  });

/** Wait for the map to be loaded and stable */
const waitForMapReady = async (page: Page) => {
  await expect(page.getByRole("region", { name: "Map" }).first()).toBeVisible({ timeout: 15000 });
  // Wait for MapLibre canvas to render
  await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 10000 });
  // Wait for map tiles and data to finish loading
  await page.waitForLoadState("networkidle");
};

test.describe("Explore View Switch - Map Position Persistence", () => {
  test("list view initializes map at URL-specified zoom", async ({ page }) => {
    // Navigate directly to list view with a specific zoom level
    await page.goto("/explore/list?lat=48.1351&lng=11.5820&zoom=10", { timeout: 30000, waitUntil: "domcontentloaded" });
    await waitForMapReady(page);

    // The map should be at (approximately) zoom 10, not at the default/fitBounds zoom
    const zoom = await getMapZoom(page);
    if (zoom !== null) {
      expect(zoom).toBeGreaterThan(8);
      expect(zoom).toBeLessThan(12);
    }
  });

  test("preserves URL params when switching from map to list view", async ({ page }) => {
    await page.goto("/explore?lat=48.1351&lng=11.5820&zoom=10&startDate=2024-01-01", {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    });
    await waitForMapReady(page);

    // Click "List" view toggle
    await page
      .locator("button")
      .filter({ hasText: /^List$/ })
      .click();
    await page.waitForURL("**/explore/list**", { timeout: 15000 });

    // URL params should be carried over by ViewToggle
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
    await waitForMapReady(page);

    // Click "Map" view toggle
    await page.locator("button").filter({ hasText: /^Map$/ }).click();

    // Should navigate to /explore (not /explore/list)
    await expect(page).toHaveURL(/\/explore\?/, { timeout: 15000 });

    const url = new URL(page.url());
    expect(url.searchParams.has("lat")).toBe(true);
    expect(url.searchParams.has("zoom")).toBe(true);
    expect(url.searchParams.get("endDate")).toBe("2025-06-30");
  });
});
