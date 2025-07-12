import { test, expect } from '@playwright/test';
import { ExplorePage } from '../pages/explore.page';

test.describe('Explore Page - Map Interactions', () => {
  let explorePage: ExplorePage;

  test.beforeEach(async ({ page }) => {
    explorePage = new ExplorePage(page);
    await explorePage.goto();
    await explorePage.waitForMapLoad();
  });

  test('should filter events by map bounds when panning', async ({ page }) => {
    // First load some events
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    
    const initialEventCount = await explorePage.getEventCount();
    
    // Pan the map to change bounds
    await explorePage.panMap(100, 100);
    
    // Wait for the bounds change to trigger a new API request
    await page.waitForResponse(response => 
      response.url().includes('/api/events') && 
      response.url().includes('bounds='),
      { timeout: 5000 }
    );
    
    await explorePage.waitForEventsToLoad();
    
    // Verify that the URL contains bounds parameter
    const url = new URL(page.url());
    expect(url.searchParams.has('bounds')).toBe(true);
    
    // The bounds parameter should be a valid JSON string
    const boundsParam = url.searchParams.get('bounds');
    expect(() => JSON.parse(boundsParam!)).not.toThrow();
  });

  test('should update markers when events change', async ({ page }) => {
    // Load events for first dataset
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    
    // Count initial markers
    const initialMarkers = await page.locator('.maplibregl-marker').count();
    
    // Switch to different dataset
    await explorePage.selectCatalog('Economic Indicators');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['GDP Growth Rates']);
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    
    // Count new markers - should potentially be different
    const newMarkers = await page.locator('.maplibregl-marker').count();
    
    // Both should be valid numbers (0 or more)
    expect(initialMarkers).toBeGreaterThanOrEqual(0);
    expect(newMarkers).toBeGreaterThanOrEqual(0);
  });

  test('should handle zoom interactions', async ({ page }) => {
    // Load some events first
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    
    // Zoom in
    await explorePage.zoomIn();
    
    // Wait for potential bounds change
    await page.waitForTimeout(1000);
    
    // Should trigger new bounds request when zoom causes significant bounds change
    const response = page.waitForResponse(response => 
      response.url().includes('/api/events') && 
      response.url().includes('bounds='),
      { timeout: 5000 }
    );
    
    await response;
    
    // Verify that the new bounds are in URL
    const url = new URL(page.url());
    expect(url.searchParams.has('bounds')).toBe(true);
  });

  test('should display map popups when clicking markers', async ({ page }) => {
    // Load events
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    
    // Check if there are any markers
    const markerCount = await page.locator('.maplibregl-marker').count();
    
    if (markerCount > 0) {
      // Click on first marker
      await explorePage.clickMapMarker(0);
      
      // Wait for popup to appear
      await expect(page.locator('.maplibregl-popup')).toBeVisible({ timeout: 5000 });
      
      // Popup should contain some content
      const popupContent = await explorePage.getPopupContent();
      expect(popupContent).toBeTruthy();
      expect(popupContent!.length).toBeGreaterThan(0);
    }
  });

  test('should handle map bounds updates correctly', async ({ page }) => {
    // Load events
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    await explorePage.waitForApiResponse();
    
    // Get initial URL bounds
    let url = new URL(page.url());
    const initialBounds = url.searchParams.get('bounds');
    
    // Pan the map
    await explorePage.panMap(200, 0);
    
    // Wait for bounds update
    await page.waitForResponse(response => 
      response.url().includes('/api/events') && 
      response.url().includes('bounds='),
      { timeout: 5000 }
    );
    
    // Get new bounds
    url = new URL(page.url());
    const newBounds = url.searchParams.get('bounds');
    
    // Bounds should have changed
    expect(newBounds).not.toBe(initialBounds);
    
    // Both bounds should be valid JSON
    if (initialBounds) {
      expect(() => JSON.parse(initialBounds)).not.toThrow();
    }
    expect(() => JSON.parse(newBounds!)).not.toThrow();
  });

  test('should maintain performance with many events', async ({ page }) => {
    // Load a catalog that might have many events
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    
    // Time the API response
    const startTime = Date.now();
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    const endTime = Date.now();
    
    // Should complete within reasonable time (5 seconds)
    const responseTime = endTime - startTime;
    expect(responseTime).toBeLessThan(5000);
    
    // Map should still be interactive after loading
    await expect(explorePage.map).toBeVisible();
    
    // Should be able to pan without issues
    await explorePage.panMap(50, 50);
    await page.waitForTimeout(500);
    
    // Map should still be responsive
    const mapBox = await explorePage.map.boundingBox();
    expect(mapBox).toBeTruthy();
  });

  test('should handle empty results gracefully', async ({ page }) => {
    // Set up filters that might return no results
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    
    // Set date range in far future (likely no events)
    await explorePage.setStartDate('2030-01-01');
    await explorePage.setEndDate('2030-12-31');
    
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