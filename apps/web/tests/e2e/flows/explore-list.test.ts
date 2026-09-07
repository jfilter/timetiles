/**
 * E2E tests for the list-based explore view.
 *
 * Verifies the /explore/list route loads and displays event cards.
 * Shared dataset selection is covered by explore-filtering.test.ts.
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

    // The seeded database always has events, so the list must render cards.
    // `event-card` is the list item's own testid — no loose fallback selectors,
    // which used to match unrelated table rows.
    const eventCards = page.getByTestId("event-card");
    await expect(eventCards.first()).toBeVisible({ timeout: 15000 });

    // The first page holds exactly PAGE_SIZE cards (or all of them if fewer).
    // Read the list's own header, not the chart panel's copy of the sentence.
    const listHeader = page
      .locator("p")
      .filter({ hasText: /Showing (?:all )?\d[\d,]* event/ })
      .last();
    const total = Number.parseInt(
      /Showing (?:all )?(\d[\d,]*)/.exec((await listHeader.textContent()) ?? "")?.[1]?.replaceAll(",", "") ?? "0",
      10
    );
    expect(total).toBeGreaterThan(0);
    const PAGE_SIZE = 20;
    await expect(eventCards).toHaveCount(Math.min(total, PAGE_SIZE));

    // Verify page loaded — check for any navigation or header element
    const header = page.locator("header, nav, [role='banner']").first();
    await expect(header).toBeVisible({ timeout: 10000 });
  });
});
