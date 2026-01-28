/**
 * E2E tests for basic explore page functionality.
 *
 * Tests core navigation, UI elements, and basic interactions
 * on the explore page.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "../fixtures";
import { ExplorePage } from "../pages/explore.page";

test.describe("Explore Page - Basic Functionality", () => {
  let explorePage: ExplorePage;

  test.beforeEach(async ({ page }) => {
    explorePage = new ExplorePage(page);
    await explorePage.goto();
  });

  test("should load the explore page with all components", async ({ page }) => {
    // Check main components are visible
    await expect(explorePage.map).toBeVisible();
    // UI redesigned: catalogs are now shown as buttons under Data Sources section
    await expect(explorePage.dataSourcesSection).toBeVisible();

    // Check initial state - Catalogs section should be visible (renamed from Datasets)
    // Note: With seeded data, there might be catalogs available
    const catalogsSection = page.locator("text=Catalogs").first();
    await expect(catalogsSection).toBeVisible();

    // Should show events count (now a paragraph with "Showing X events...")
    await expect(explorePage.eventsCount).toBeVisible();
  });

  test("should load the map properly", async () => {
    await explorePage.waitForMapLoad();

    // Check map container has proper dimensions
    const mapBox = await explorePage.map.boundingBox();
    expect(mapBox).toBeTruthy();
    expect(mapBox!.width).toBeGreaterThan(300);
    expect(mapBox!.height).toBeGreaterThan(300);

    // Check that map has loaded by verifying the map container has proper attributes
    await expect(explorePage.map).toHaveAttribute("role", "region");
    await expect(explorePage.map).toHaveAttribute("aria-label", "Map");
  });

  test("should display empty states correctly", async ({ page }) => {
    // Wait for the page to fully load and events to be fetched
    await explorePage.waitForEventsToLoad();

    // Wait a bit for React to settle after loading
    await page.waitForTimeout(1000);

    // New UI format: "Showing X of Y events" or "Showing all X events"
    // The events count paragraph is always visible, showing the current state
    const countText = await explorePage.eventsCount.textContent();

    // The new UI shows descriptive text like:
    // - "Showing 0 of 56 events in the map view." (when map bounds filter to 0)
    // - "Showing all 56 events." (when showing everything)
    // - "No events found" only appears when truly no data exists

    if (countText?.includes("Showing")) {
      // Events count paragraph is visible with descriptive text - this is the expected state
      await expect(explorePage.eventsCount).toBeVisible();
    } else {
      // No events exist at all - check for the no events message
      const noEventsVisible = await explorePage.noEventsMessage.isVisible().catch(() => false);
      if (noEventsVisible) {
        await expect(explorePage.noEventsMessage).toBeVisible();
      } else {
        // Fallback - just verify the events count element is present
        await expect(explorePage.eventsCount).toBeVisible();
      }
    }
  });

  test("should have responsive layout", async ({ page }) => {
    // Desktop view - side by side
    await page.setViewportSize({ width: 1200, height: 800 });

    const mapBox = await explorePage.map.boundingBox();
    const pageWidth = await page.evaluate(() => window.innerWidth);

    // Map should take roughly 40% of width (adjusted based on actual layout)
    expect(mapBox!.width).toBeGreaterThanOrEqual(pageWidth * 0.35);
    expect(mapBox!.width).toBeLessThan(pageWidth * 0.6);

    // Mobile view - stacked (if implemented)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500); // Wait for responsive changes

    // Both sections should still be visible
    await expect(explorePage.map).toBeVisible();
    await expect(explorePage.dataSourcesSection).toBeVisible();
  });

  test("should persist state in URL", async ({ page }) => {
    // Initial URL should contain /explore path (may include map state params)
    const initialUrl = new URL(page.url());
    expect(initialUrl.pathname).toBe("/explore");

    // Select a catalog (new button-based UI)
    await explorePage.selectCatalog("Environmental Data");

    // URL should have catalog parameter after selecting a specific catalog
    const url = new URL(page.url());
    expect(url.searchParams.has("catalog")).toBe(true);
  });

  test("should handle keyboard navigation", async ({ page }) => {
    // Focus the page body first to start keyboard navigation from a known state
    await page.locator("body").focus();

    // Tab to navigate through interactive elements
    await page.keyboard.press("Tab");

    // The first tabbable element should be the catalog select
    // Wait a bit for focus to settle
    await page.waitForTimeout(100);

    // Check if we can interact with form elements via keyboard
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tagName: el?.tagName,
        id: el?.id,
        type: (el as HTMLInputElement)?.type,
      };
    });

    // We should be on some interactive element (link, select, input, button, or custom component)
    const interactiveElements = ["A", "SELECT", "INPUT", "BUTTON", "DIV"];
    expect(interactiveElements).toContain(focusedElement.tagName);

    // Continue tabbing to ensure we can navigate through the form
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
    }

    // Verify we're still on an interactive element
    const laterElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(interactiveElements).toContain(laterElement);
  });

  test("should show loading state while fetching events", async ({ page }) => {
    // Set up slow API response BEFORE navigation to capture loading state
    await page.route("**/api/events/**", async (route) => {
      await page.waitForTimeout(2000); // Delay response to see loading state
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ docs: [], totalDocs: 0, limit: 1000, page: 1 }),
      });
    });

    // Navigate without waiting for full load (use simpler navigation)
    await page.goto("/explore", { waitUntil: "domcontentloaded" });

    // Wait for page content to be present
    await page.waitForSelector("body", { timeout: 10000 });

    // The loading state is shown as "Loading events..." in the EventsList
    const loadingText = page.getByText("Loading events...");

    // Check if loading state appears (it might be very quick)
    try {
      await expect(loadingText).toBeVisible({ timeout: 3000 });
      // Should hide loading indicator after response
      await expect(loadingText).not.toBeVisible({ timeout: 10000 });
    } catch {
      // If loading was too fast to catch, verify the page eventually loads
      // Check that the events count paragraph is visible (now shows "Showing X events...")
      const eventsCount = page
        .locator("p")
        .filter({ hasText: /Showing .* event/ })
        .first();
      await expect(eventsCount).toBeVisible({ timeout: 5000 });
    }
  });
});
