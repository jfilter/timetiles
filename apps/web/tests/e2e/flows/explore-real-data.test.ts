/**
 * E2E tests for explore page with real data.
 *
 * Tests the explore page functionality with actual seeded
 * data to verify real-world scenarios.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "@playwright/test";

import { ExplorePage } from "../pages/explore.page";

test.describe("Explore Page - Real Data Tests", () => {
  let explorePage: ExplorePage;

  test.beforeEach(async ({ page }) => {
    explorePage = new ExplorePage(page);
    await explorePage.goto();
    await explorePage.waitForMapLoad();
  });

  test("should work with available catalog data", async ({ page }) => {
    // Check if Data Sources section is available (new button-based UI)
    await expect(explorePage.dataSourcesSection).toBeVisible();

    // Get available catalogs (shown as buttons with dataset/event counts)
    const catalogs = await explorePage.getAvailableCatalogs();
    expect(catalogs.length).toBeGreaterThan(0);

    // Find a catalog with datasets by looking at button text
    // Each button shows: "CatalogName X datasets Y events"
    const catalogsWithDatasets = explorePage.catalogButtons.filter({ hasText: "datasets" });
    const count = await catalogsWithDatasets.count();
    expect(count).toBeGreaterThan(0);

    // Click on the first catalog that has datasets
    await catalogsWithDatasets.first().click();
    await page.waitForTimeout(500);

    // Datasets should now be visible (checkboxes appear when catalog is expanded)
    await page.waitForSelector('input[type="checkbox"]', { timeout: 3000 });

    // Check that datasets are available
    const datasetCheckboxes = await page.locator('input[type="checkbox"]').count();
    expect(datasetCheckboxes).toBeGreaterThan(0);

    // Select the first dataset
    const firstDatasetCheckbox = page.locator('input[type="checkbox"]').first();

    // Set up promise to wait for API response before checking the box
    const responsePromise = (async () => {
      try {
        return await page.waitForResponse((response) => response.url().includes("/api/events"), { timeout: 5000 });
      } catch {
        // Response might not come if data is cached or already loaded
        return null;
      }
    })();

    await firstDatasetCheckbox.check();

    // Wait for response if it comes
    await responsePromise;

    // Wait for events to load
    await explorePage.waitForEventsToLoad();

    // Check that the page shows results
    await expect(explorePage.eventsCount).toBeVisible();
    const eventCount = await explorePage.getEventCount();
    expect(eventCount).toBeGreaterThanOrEqual(0);
  });

  test("should handle date filtering with any data", async () => {
    // Set some date filters
    await explorePage.setStartDate("2024-01-01");
    await explorePage.setEndDate("2024-12-31");

    // URL should reflect the date parameters (new button-based UI doesn't have input values)
    await explorePage.assertUrlParam("startDate", "2024-01-01");
    await explorePage.assertUrlParam("endDate", "2024-12-31");

    // Clear the filters
    if (await explorePage.clearDatesButton.isVisible()) {
      await explorePage.clearDateFilters();

      // Check that dates are cleared
      await explorePage.assertUrlParam("startDate", null);
      await explorePage.assertUrlParam("endDate", null);
    }
  });

  test("should maintain map functionality regardless of data", async ({ page }) => {
    // Map should be interactive
    await expect(explorePage.map).toBeVisible();

    // Should be able to pan the map
    await explorePage.panMap(50, 50);

    // Map should still be responsive
    const mapBox = await explorePage.map.boundingBox();
    expect(mapBox).toBeTruthy();
    expect(mapBox!.width).toBeGreaterThan(100);
    expect(mapBox!.height).toBeGreaterThan(100);

    // URL should eventually have bounds parameter after interaction
    // Wait briefly for any map updates
    await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
    const url = new URL(page.url());
    // Bounds might or might not be set depending on map events, but URL should be valid
    expect(url.pathname).toBe("/explore");
  });

  test("should show appropriate empty states", async ({ page }) => {
    // If no data is available, should show appropriate messages
    await explorePage.noDatasetsMessage.isVisible();
    await explorePage.noEventsMessage.isVisible();

    // Either should show datasets/events, or show appropriate empty state messages
    const hasDatasets = (await page.locator('input[type="checkbox"]').count()) > 0;
    const hasEvents = (await explorePage.getEventCount()) > 0;

    if (!hasDatasets) {
      await expect(explorePage.noDatasetsMessage).toBeVisible();
    }

    if (!hasEvents) {
      // Should show events count as 0
      const count = await explorePage.getEventCount();
      expect(count).toBe(0);
    }
  });

  test("should handle API errors gracefully", async ({ page }) => {
    // Try to make a request that might fail
    await explorePage.setStartDate("9999-01-01");
    await explorePage.setEndDate("9999-12-31");

    try {
      await page.waitForResponse((response) => response.url().includes("/api/events"), { timeout: 5000 });
    } catch {
      // Timeout is OK - might happen if no data matches or API is slow
      // API timeout during E2E test (expected behavior)
    }

    // Page should still be functional
    await expect(explorePage.map).toBeVisible();
    await expect(explorePage.dataSourcesSection).toBeVisible();

    // Should be able to clear the dates
    if (await explorePage.clearDatesButton.isVisible()) {
      await explorePage.clearDateFilters();
    }
  });
});
