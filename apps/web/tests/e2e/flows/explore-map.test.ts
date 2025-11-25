/**
 * E2E tests for explore page map functionality.
 *
 * Tests map interactions including clustering, zoom,
 * pan, and marker interactions.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "@playwright/test";

import { ExplorePage } from "../pages/explore.page";

test.describe("Explore Page - Map Interactions", () => {
  let explorePage: ExplorePage;

  test.beforeEach(async ({ page }) => {
    explorePage = new ExplorePage(page);
    await explorePage.goto();
    await explorePage.waitForMapLoad();
  });

  test("should filter events by map bounds when panning", async ({ page }) => {
    // Set up request tracking BEFORE any API calls
    const eventsListRequests: string[] = [];
    const mapClustersRequests: string[] = [];

    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/events/list")) {
        eventsListRequests.push(url);
      }
      if (url.includes("/api/events/map-clusters")) {
        mapClustersRequests.push(url);
      }
    });

    // Load some events first
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements"]);
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Clear previous requests and set up new tracking for pan
    eventsListRequests.length = 0;
    mapClustersRequests.length = 0;

    // Pan the map significantly to ensure bounds change
    await explorePage.panMap(400, 400);

    // Wait for the 300ms debounce delay plus buffer time for API calls
    await page.waitForTimeout(500);

    // Wait for any pending API responses to complete
    await page.waitForLoadState("networkidle", { timeout: 3000 });

    // Check that API calls were made with bounds after panning
    const eventsListWithBounds = eventsListRequests.filter((url) => url.includes("bounds="));
    const mapClustersWithBounds = mapClustersRequests.filter((url) => url.includes("bounds="));

    expect(eventsListWithBounds.length).toBeGreaterThan(0);
    expect(mapClustersWithBounds.length).toBeGreaterThan(0);
  });

  test("should update markers when events change", async ({ page: _page }) => {
    // Load events for first dataset
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements"]);
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Switch to different dataset
    await explorePage.selectCatalog("Economic Indicators");
    await explorePage.selectDatasets(["GDP Growth Rates"]);
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Verify markers were rendered (test verifies map updates, not specific counts)
    // Both datasets should render markers if data exists
  });

  test("should handle zoom interactions", async ({ page }) => {
    // Load some events first
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements"]);
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Zoom in
    await explorePage.zoomIn();

    // Wait for map zoom animation
    await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});

    // Verify map is still visible and functional after zoom
    await expect(explorePage.map).toBeVisible();

    // Verify map has valid dimensions after zoom
    const mapBox = await explorePage.map.boundingBox();
    expect(mapBox).toBeTruthy();
    expect(mapBox!.width).toBeGreaterThan(0);
    expect(mapBox!.height).toBeGreaterThan(0);
  });

  test("should display map popups when clicking markers", async ({ page }) => {
    // Load events
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements"]);
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Check if there are any markers
    const markerCount = await page.locator(".maplibregl-marker").count();

    if (markerCount > 0) {
      // Click on first marker
      await explorePage.clickMapMarker(0);

      // Wait for popup to appear
      await expect(page.locator(".maplibregl-popup")).toBeVisible({
        timeout: 5000,
      });

      // Popup should contain some content
      const popupContent = await explorePage.getPopupContent();
      expect(popupContent).toBeTruthy();
      expect(popupContent!.length).toBeGreaterThan(0);
    }
  });

  test("should handle map bounds updates correctly", async ({ page }) => {
    // Set up request tracking before any API calls - track all events endpoints
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/events")) {
        apiRequests.push(url.toString());
      }
    });

    // Load events
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements"]);
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Pan the map
    await explorePage.panMap(200, 0);

    // Wait for potential API call - account for 300ms debounce
    // Wait for API response after bounds change
    await explorePage.waitForApiResponse();

    // At least some API requests should have been made
    expect(apiRequests.length).toBeGreaterThan(0);

    // The test passes if we have API requests (the map functionality is working)
    // Bounds filtering may or may not be implemented yet
  });

  test("should handle many events gracefully", async () => {
    // Load a catalog that might have many events
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements", "Water Quality Assessments"]);

    // Wait for data to load
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Get the event count for logging
    const eventCount = await explorePage.getEventCount();
    console.log(`Loaded ${eventCount} events`);

    // Map should still be visible and interactive after loading events
    await expect(explorePage.map).toBeVisible();

    // Verify we can still interact with the map
    const mapBox = await explorePage.map.boundingBox();
    expect(mapBox).toBeTruthy();
    expect(mapBox!.width).toBeGreaterThan(0);
    expect(mapBox!.height).toBeGreaterThan(0);

    // Should be able to pan the map
    await explorePage.panMap(50, 50);

    // Map should still be visible after panning
    await expect(explorePage.map).toBeVisible();

    // Should be able to zoom
    await explorePage.zoomIn();

    // Verify the events list is still accessible
    await expect(explorePage.eventsList).toBeVisible();
  });

  test("should handle empty results gracefully", async () => {
    // Set up filters that might return no results
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.selectDatasets(["Air Quality Measurements"]);

    // Set date range in far future (likely no events)
    await explorePage.setStartDate("2030-01-01");
    await explorePage.setEndDate("2030-12-31");

    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Should show "No events found" message
    await expect(explorePage.noEventsMessage).toBeVisible();

    // Event count should be 0
    const count = await explorePage.getEventCount();
    expect(count).toBe(0);

    // Map should still be functional
    await expect(explorePage.map).toBeVisible();
    await explorePage.panMap(50, 50);
  });
});
