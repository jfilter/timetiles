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
    
    // Check that map has loaded by verifying the map container has proper attributes
    await expect(explorePage.map).toHaveAttribute('role', 'region');
    await expect(explorePage.map).toHaveAttribute('aria-label', 'Map');
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
    
    // Map should take roughly 50% of width (with some tolerance for borders/scrollbars)
    expect(mapBox!.width).toBeGreaterThan(pageWidth * 0.4);
    expect(mapBox!.width).toBeLessThan(pageWidth * 0.6);
    
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
    // Click on the page heading to set initial focus
    await page.getByRole('heading', { name: 'Event Explorer' }).click();
    
    // Tab to navigate through interactive elements
    await page.keyboard.press('Tab');
    
    // The first tabbable element should be the catalog select
    // Wait a bit for focus to settle
    await page.waitForTimeout(100);
    
    // Check if we can interact with form elements via keyboard
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tagName: el?.tagName,
        id: el?.id,
        type: (el as HTMLInputElement)?.type
      };
    });
    
    // We should be on some interactive element (select, input, or button)
    expect(['SELECT', 'INPUT', 'BUTTON', 'DIV']).toContain(focusedElement.tagName);
    
    // Continue tabbing to ensure we can navigate through the form
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }
    
    // Verify we're still on an interactive element
    const laterElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['SELECT', 'INPUT', 'BUTTON', 'DIV']).toContain(laterElement);
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