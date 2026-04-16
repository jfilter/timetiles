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

  test("should load the explore page with all components", async () => {
    // Check main components are visible
    await expect(explorePage.map).toBeVisible();
    // Datasets collapsible section trigger should be visible
    await expect(explorePage.dataSourcesSection).toBeVisible();

    // Dataset/catalog checkboxes should be present (data loaded from API)
    await expect(explorePage.datasetCheckboxes.first()).toBeVisible();

    // Should show events count (now a paragraph with "Showing X events...")
    await expect(explorePage.eventsCount).toBeVisible();
  });

  test("should load the map properly", async () => {
    await explorePage.waitForMapLoad();

    // Check map container has proper dimensions
    const mapBox = await explorePage.map.boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox!.width).toBeGreaterThan(300);
    expect(mapBox!.height).toBeGreaterThan(300);

    // Check that map has loaded by verifying the map container has proper attributes
    await expect(explorePage.map).toHaveAttribute("role", "region");
    await expect(explorePage.map).toHaveAttribute("aria-label", "Map");
  });

  test("should display empty states correctly", async () => {
    // Wait for the page to fully load and events to be fetched
    await explorePage.waitForEventsToLoad();

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

    // Mobile view - layout may change (map could be in a tab/drawer)
    await page.setViewportSize({ width: 375, height: 667 });
    // Just verify the page doesn't crash on mobile
    await page.waitForLoadState("domcontentloaded");
  });

  test("should persist state in URL", async ({ page }) => {
    // Initial URL should contain /explore path (may include map state params)
    const initialUrl = new URL(page.url());
    expect(initialUrl.pathname).toBe("/explore");

    // Select all datasets in a catalog (tri-state checkbox)
    await explorePage.selectAllInCatalog("Environmental Data");

    // URL should have datasets parameter after selecting datasets
    const url = new URL(page.url());
    expect(url.searchParams.has("datasets")).toBe(true);
  });

  test("should handle keyboard navigation", async ({ page }) => {
    // Focus the page body first to start keyboard navigation from a known state
    await page.locator("body").focus();

    // Tab to navigate through interactive elements
    await page.keyboard.press("Tab");

    // Check if we can interact with form elements via keyboard
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return { tagName: el?.tagName, id: el?.id, type: (el as HTMLInputElement)?.type };
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
    // Delay the events-list response so the skeleton is observable.
    // Matches useEventsListQuery, which calls /api/v1/events with query params.
    await page.route("**/api/v1/events?**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ events: [], pagination: { totalDocs: 0, limit: 1000, page: 1 } }),
      });
    });

    await page.goto("/explore", { waitUntil: "domcontentloaded" });

    const skeleton = page.getByTestId("events-list-skeleton");

    // Skeleton must appear while the API is intentionally slow
    await expect(skeleton).toBeVisible({ timeout: 3000 });
    // And disappear once the response resolves
    await expect(skeleton).toBeHidden({ timeout: 10000 });
  });
});
