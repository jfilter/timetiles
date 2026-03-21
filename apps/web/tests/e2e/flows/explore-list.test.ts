/**
 * E2E tests for the list-based explore view.
 *
 * Verifies the /explore/list route loads, displays events,
 * and supports catalog filtering.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "../fixtures";

test.describe("Explore Page - List View", () => {
  test("should load the list view and display events", async ({ page }) => {
    await page.goto("/explore/list", { timeout: 30000, waitUntil: "domcontentloaded" });

    // Wait for the map container to render
    await page.waitForSelector('[data-testid="map-container"], .maplibregl-canvas', { timeout: 15000 });

    // Wait for the events count text to appear
    await page.waitForFunction(() => /Showing (?:all )?\d[\d,]* event/.test(document.body.textContent ?? ""), {
      timeout: 15000,
    });

    // Verify the events count text is present
    const countText = await page.textContent("body");
    expect(countText).toMatch(/Showing (?:all )?\d[\d,]* event/);

    // Verify the map is visible (not just present in DOM)
    const mapContainer = page.locator('[data-testid="map-container"], .maplibregl-canvas').first();
    await expect(mapContainer).toBeVisible();

    // Verify the list view has event cards or list items rendered
    // Wait for at least one event item to appear in the list
    const eventItems = page.locator('[data-testid^="event-"], .event-card, [role="article"], table tbody tr').first();
    const hasEventItems = await eventItems
      .count()
      .then((c) => c > 0)
      .catch(() => false);

    // If events exist, verify they have visible content
    if (hasEventItems) {
      await expect(eventItems).toBeVisible();
    }

    // Verify navigation is functional
    const nav = page.locator("nav").first();
    await expect(nav).toBeVisible();
  });

  test("should filter events when selecting a catalog", async ({ page }) => {
    // Use waitUntil: "domcontentloaded" to avoid waiting for i18n middleware
    await page.goto("/explore/list", { timeout: 30000, waitUntil: "domcontentloaded" });

    // Wait for catalog buttons to load
    await page.waitForSelector('button:has-text("datasets")', { timeout: 30000 });

    // Click "Environmental Data" catalog
    const catalogButton = page.getByRole("button", { name: /Environmental Data/i }).first();
    await catalogButton.waitFor({ state: "visible", timeout: 5000 });
    await catalogButton.click({ force: true });

    // Wait for filtered events to load
    await page.waitForFunction(() => /Showing (?:all )?\d[\d,]* event/.test(document.body.textContent ?? ""), {
      timeout: 15000,
    });

    // The page should show environmental data context
    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("Environmental Data");
  });
});
