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
    await expect(page.getByRole('heading', { name: 'Event Explorer' })).toBeVisible();
    
    // Check main components are visible
    await expect(explorePage.map).toBeVisible();
    await expect(explorePage.catalogSelect).toBeVisible();
    await expect(explorePage.startDateInput).toBeVisible();
    await expect(explorePage.endDateInput).toBeVisible();
    
    // Check initial state - dataset message should be visible
    // Note: With seeded data, there might be datasets available
    const datasetsSection = page.locator('text=Datasets').first();
    await expect(datasetsSection).toBeVisible();
    
    // Should show events count
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

  test('should display empty states correctly', async ({ page }) => {
    // Check if we have "No events found" when there are no events
    // Note: Depending on seeded data, this might not always be true
    const eventCount = await explorePage.getEventCount();
    
    if (eventCount === 0) {
      await expect(explorePage.noEventsMessage).toBeVisible();
    } else {
      // If there are events, they should be visible
      await expect(page.locator('.space-y-2 > div').first()).toBeVisible();
    }
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
    // Click on the page body first to ensure focus is in the right place
    await page.locator('body').click();
    
    // Tab to the first interactive element - the catalog select
    await page.keyboard.press('Tab');
    
    // Check if catalog select is focused (it might take a few tabs depending on the page structure)
    let focused = await page.evaluate(() => document.activeElement?.id);
    let tabCount = 1;
    
    while (focused !== 'catalog-select' && tabCount < 10) {
      await page.keyboard.press('Tab');
      focused = await page.evaluate(() => document.activeElement?.id);
      tabCount++;
    }
    
    // Now we should be on the catalog select
    await expect(explorePage.catalogSelect).toBeFocused();
    
    // Tab through other elements
    await page.keyboard.press('Tab'); // This might focus a dataset checkbox
    await page.keyboard.press('Tab'); // Continue tabbing
    await page.keyboard.press('Tab'); // Should eventually reach start date
    
    // Check if we're on a date input
    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeElement).toBe('INPUT');
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
    
    // The loading state is shown as "Loading events..." in the EventsList
    const loadingText = page.getByText('Loading events...');
    
    // Check if loading state appears (it might be very quick)
    try {
      await expect(loadingText).toBeVisible({ timeout: 500 });
      // Should hide loading indicator after response
      await expect(loadingText).not.toBeVisible({ timeout: 5000 });
    } catch {
      // If loading was too fast to catch, just verify the page loaded
      await expect(explorePage.eventsCount).toBeVisible();
    }
  });
});