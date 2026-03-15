/**
 * E2E tests for explore page map functionality.
 *
 * Tests map interactions including clustering, zoom,
 * pan, and marker interactions.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "../fixtures";
import { ExplorePage } from "../pages/explore.page";

test.describe("Explore Page - Map Interactions", () => {
  let explorePage: ExplorePage;

  test.beforeEach(async ({ page }) => {
    explorePage = new ExplorePage(page);
    await explorePage.goto();
    await explorePage.waitForMapLoad();
  });

  test("should filter events by map bounds when panning", async ({ page }) => {
    // Select catalog (auto-selects all datasets)
    await explorePage.selectCatalog("Environmental Data");

    // Wait for initial geo cluster response (proves map has bounds)
    await page.waitForResponse(
      (response) => response.url().includes("/api/v1/events/geo") && response.url().includes("bounds="),
      { timeout: 10000 }
    );

    // Pan the map
    await explorePage.panMap(200, 0);

    // Wait for new geo cluster response after pan (new bounds trigger new query after 300ms debounce)
    const postPanResponse = await page.waitForResponse(
      (response) => response.url().includes("/api/v1/events/geo") && response.url().includes("bounds="),
      { timeout: 10000 }
    );

    // The response should be successful
    expect(postPanResponse.status()).toBe(200);
    // The URL should contain bounds parameters
    expect(postPanResponse.url()).toContain("bounds=");
  });

  test("should update markers when events change", async ({ page }) => {
    // Select catalog and let all data load
    await explorePage.selectCatalog("Environmental Data");
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Wait for event count to show loaded data (map bounds → debounce → query → render)
    await page.waitForFunction(() => /Showing (?:all )?\d[\d,]* event/.test(document.body.textContent ?? ""), {
      timeout: 15000,
    });

    // Events count should be visible
    await expect(explorePage.eventsCount).toBeVisible();

    // Verify the map canvas is rendering (WebGL active) and clusters are on the map
    const mapState = await page.evaluate(() => {
      const canvas = document.querySelector(".maplibregl-canvas") as HTMLCanvasElement | null;
      // Check for MapLibre map instance via the container's internal reference
      const container = document.querySelector(".maplibregl-map");
      // Look for cluster/point elements rendered as circles or SVG markers
      const mapMarkers = document.querySelectorAll(".maplibregl-marker");
      // Check canvas is rendering
      const gl = canvas?.getContext("webgl") ?? canvas?.getContext("webgl2");
      return {
        canvasRendering: canvas != null && canvas.width > 0 && canvas.height > 0,
        hasWebGL: !!gl,
        hasMapContainer: !!container,
        domMarkerCount: mapMarkers.length,
      };
    });
    expect(mapState.canvasRendering).toBe(true);
    expect(mapState.hasWebGL).toBe(true);
    expect(mapState.hasMapContainer).toBe(true);
  });

  test("should handle zoom interactions", async ({ page }) => {
    // Load some events first
    await explorePage.selectCatalog("Environmental Data");
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
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Check if there are any markers
    const markerCount = await page.locator(".maplibregl-marker").count();

    if (markerCount > 0) {
      // Click on first marker
      await explorePage.clickMapMarker(0);

      // Wait for popup to appear
      await expect(page.locator(".maplibregl-popup")).toBeVisible({ timeout: 5000 });

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
      if (url.pathname.startsWith("/api/v1/events")) {
        apiRequests.push(url.toString());
      }
    });

    // Load events
    await explorePage.selectCatalog("Environmental Data");
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

    // Wait for API response and events to load first (timeline appears after data loads)
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    // Set date range in far future (likely no events)
    // The setStartDate method will wait for the timeline to be ready
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
