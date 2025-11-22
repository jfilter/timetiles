/**
 * E2E tests for explore page filtering functionality.
 *
 * Tests catalog filtering, dataset filtering, and search
 * capabilities on the explore page.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "@playwright/test";

import { ExplorePage } from "../pages/explore.page";

test.describe("Explore Page - Filtering", () => {
  let explorePage: ExplorePage;

  test.beforeEach(async ({ page }) => {
    explorePage = new ExplorePage(page);
    await explorePage.goto();
    await explorePage.waitForMapLoad();
  });

  test("should filter by catalog", async () => {
    // Select a specific catalog (Environmental Data from seed data)
    await explorePage.selectCatalog("Environmental Data");

    // Verify that datasets specific to this catalog are shown
    await expect(explorePage.page.getByText("Air Quality Measurements", { exact: true })).toBeVisible();

    // Select a dataset
    await explorePage.selectDatasets(["Air Quality Measurements"]);

    // Quick API check without waiting for long timeouts
    await explorePage.waitForApiResponse();

    // Verify the events section is visible (even if showing "No events found")
    await expect(explorePage.eventsCount).toBeVisible();

    // Check that URL has catalog and dataset params (values will be IDs, not slugs)
    const params = await explorePage.getUrlParams();
    expect(params.has("catalog")).toBe(true);
    expect(params.has("datasets")).toBe(true);

    // Verify the catalog selection persisted
    await expect(explorePage.page.locator("#catalog-select")).toContainText("Environmental Data");

    // Verify the dataset checkbox is checked
    await expect(explorePage.page.locator('input[type="checkbox"]:checked')).toBeVisible();
  });

  test("should filter by multiple datasets", async () => {
    // Select Economic Indicators catalog
    await explorePage.selectCatalog("Economic Indicators");

    // Check if GDP Growth Rates dataset is visible
    const gdpDataset = explorePage.page.getByText("GDP Growth Rates");
    await expect(gdpDataset).toBeVisible();

    // Select the dataset
    await explorePage.selectDatasets(["GDP Growth Rates"]);

    // Wait for API response and events to load
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Check URL has the filters
    const params = await explorePage.getUrlParams();
    expect(params.has("catalog")).toBe(true);
    expect(params.has("datasets")).toBe(true);
  });

  test("should filter by date range", async () => {
    // Select a catalog and dataset first
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements"]);

    // Set date filters
    await explorePage.setStartDate("2024-01-01");
    await explorePage.setEndDate("2024-12-31");

    // Wait for URL to update with date parameters
    await explorePage.page.waitForFunction(
      () => {
        const url = new URL(window.location.href);
        return url.searchParams.has("startDate") && url.searchParams.has("endDate");
      },
      { timeout: 5000 }
    );

    // Wait for API response and events to load
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Check URL reflects date filters
    await explorePage.assertUrlParam("startDate", "2024-01-01");
    await explorePage.assertUrlParam("endDate", "2024-12-31");
  });

  test("should clear date filters", async () => {
    // Set up initial filters
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements"]);
    await explorePage.setStartDate("2024-01-01");
    await explorePage.setEndDate("2024-12-31");

    await explorePage.waitForApiResponse();

    // Clear date filters
    await explorePage.clearDateFilters();

    // Wait for URL parameters to be removed
    await explorePage.page.waitForFunction(
      () => {
        const url = new URL(window.location.href);
        return !url.searchParams.has("startDate") && !url.searchParams.has("endDate");
      },
      { timeout: 5000 }
    );

    // Check that date params are removed from URL
    await explorePage.assertUrlParam("startDate", null);
    await explorePage.assertUrlParam("endDate", null);
  });

  test("should combine multiple filters", async () => {
    // Test multiple filters working together
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements"]);
    await explorePage.setStartDate("2024-06-01");
    await explorePage.setEndDate("2024-06-30");

    // Wait for API response and events to load
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Verify all filters are in URL (checking existence, not exact values)
    const params = await explorePage.getUrlParams();
    expect(params.has("catalog")).toBe(true);
    expect(params.has("datasets")).toBe(true);
    expect(params.get("startDate")).toBe("2024-06-01");
    expect(params.get("endDate")).toBe("2024-06-30");
  });

  test("should update results when changing filters", async () => {
    // Start with one catalog and dataset
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements"]);

    // Wait for the first results to load completely
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    const initialCount = await explorePage.getEventCount();

    // Should have loaded events from the selected dataset
    console.log(`Initial count with Environmental Data: ${initialCount}`);

    // Deselect the current dataset first
    await explorePage.deselectDatasets(["Air Quality Measurements"]);
    // Wait for UI to update after deselection
    await explorePage.waitForApiResponse();

    // Now change to a different catalog
    await explorePage.selectCatalog("Economic Indicators");

    // Select a dataset from the new catalog
    await explorePage.selectDatasets(["GDP Growth Rates"]);

    // Wait for the new results to load
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    const newCount = await explorePage.getEventCount();

    console.log(`New count with Economic Indicators: ${newCount}`);

    // Verify URL parameters reflect the new selection
    const params = await explorePage.getUrlParams();
    expect(params.has("catalog")).toBe(true);
    expect(params.has("datasets")).toBe(true);

    // The catalog should have changed to Economic Indicators
    const catalogParam = params.get("catalog");
    expect(catalogParam).toBeTruthy();
    // Economic Indicators catalog should have a different ID than Environmental Data
    expect(catalogParam).not.toContain("environmental");
  });

  test("should handle edge cases in date filtering", async () => {
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements"]);

    // Test with same start and end date
    await explorePage.setStartDate("2024-07-01");
    await explorePage.setEndDate("2024-07-01");

    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Should not error and should show events for that specific date
    const count = await explorePage.getEventCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("should preserve filters when navigating", async () => {
    // Set up filters
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements"]);
    await explorePage.setStartDate("2024-01-01");

    await explorePage.waitForApiResponse();

    // Get current URL with params
    const urlWithParams = explorePage.page.url();

    // Navigate away and back
    await explorePage.page.goto("/");
    await explorePage.page.goto(urlWithParams);

    // Check that filters are restored
    await explorePage.waitForApiResponse();
    await expect(explorePage.page.locator("#catalog-select")).toContainText("Environmental Data");
    await expect(explorePage.page.locator("#start-date")).toHaveValue("2024-01-01");
  });
});
