import { test, expect } from '@playwright/test';
import { ExplorePage } from '../pages/explore.page';

test.describe('Explore Page - Basic Functionality', () => {
  let explorePage: ExplorePage;

  test.beforeEach(async ({ page }) => {
    explorePage = new ExplorePage(page);
    await explorePage.goto();
  });

  test('should load the explore page with all components', async ({ page }) => {
    // Check page heading
    await expect(page.getByText('Event Explorer')).toBeVisible();
    
    // Check main components are visible
    await expect(explorePage.map).toBeVisible();
    await expect(explorePage.catalogSelect).toBeVisible();
    await expect(explorePage.startDateInput).toBeVisible();
    await expect(explorePage.endDateInput).toBeVisible();
    
    // Check initial state - should show "No datasets available" when no catalog selected
    await expect(explorePage.noDatasetsMessage).toBeVisible();
    
    // Should show events count (initially 0)
    await expect(explorePage.eventsCount).toBeVisible();
  });

  test('should load the map properly', async () => {
    await explorePage.waitForMapLoad();
    
    // Check map container has proper dimensions
    const mapBox = await explorePage.map.boundingBox();
    expect(mapBox).toBeTruthy();
    expect(mapBox!.width).toBeGreaterThan(300);
    expect(mapBox!.height).toBeGreaterThan(300);
    
    // Check map has loaded tiles
    const tiles = explorePage.page.locator('.maplibregl-tile');
    await expect(tiles.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display empty states correctly', async () => {
    // When no catalog is selected
    await expect(explorePage.noDatasetsMessage).toBeVisible();
    await expect(explorePage.noEventsMessage).toBeVisible();
    
    // Event count should show 0
    const count = await explorePage.getEventCount();
    expect(count).toBe(0);
  });

  test('should have responsive layout', async ({ page }) => {
    // Desktop view - side by side
    await page.setViewportSize({ width: 1200, height: 800 });
    
    const mapBox = await explorePage.map.boundingBox();
    const pageWidth = await page.evaluate(() => window.innerWidth);
    
    // Map should take roughly 50% of width
    expect(mapBox!.width).toBeCloseTo(pageWidth / 2, -1);
    
    // Mobile view - stacked (if implemented)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500); // Wait for responsive changes
    
    // Both sections should still be visible
    await expect(explorePage.map).toBeVisible();
    await expect(explorePage.catalogSelect).toBeVisible();
  });

  test('should persist state in URL', async ({ page }) => {
    // Initial URL should be clean
    expect(page.url()).toBe('http://localhost:3000/explore');
    
    // Select a catalog
    await explorePage.selectCatalog('All Catalogs');
    
    // URL should remain clean when "All Catalogs" is selected
    expect(page.url()).toBe('http://localhost:3000/explore');
  });

  test('should handle keyboard navigation', async ({ page }) => {
    // Tab through interactive elements
    await page.keyboard.press('Tab'); // Skip navigation
    await page.keyboard.press('Tab'); // Focus catalog select
    
    // Catalog select should be focused
    await expect(explorePage.catalogSelect).toBeFocused();
    
    // Continue tabbing
    await page.keyboard.press('Tab'); // Focus first dataset checkbox (if any)
    await page.keyboard.press('Tab'); // Focus start date
    await expect(explorePage.startDateInput).toBeFocused();
    
    await page.keyboard.press('Tab'); // Focus end date
    await expect(explorePage.endDateInput).toBeFocused();
  });

  test('should show loading state while fetching events', async ({ page }) => {
    // Mock slow API response
    await page.route('**/api/events*', async (route) => {
      await page.waitForTimeout(1000);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ docs: [], totalDocs: 0, limit: 1000, page: 1 }),
      });
    });
    
    await explorePage.goto();
    
    // Should show loading indicator
    await expect(explorePage.loadingIndicator).toBeVisible();
    
    // Should hide loading indicator after response
    await expect(explorePage.loadingIndicator).not.toBeVisible({ timeout: 5000 });
  });
});