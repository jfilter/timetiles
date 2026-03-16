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
    // Use waitUntil: "domcontentloaded" to avoid waiting for i18n middleware
    // to fully resolve all resources
    await page.goto("/explore/list", { timeout: 30000, waitUntil: "domcontentloaded" });

    // Wait for the page to render content
    await page.waitForSelector('[data-testid="map-container"], .maplibregl-canvas', { timeout: 15000 });

    // The list view should show the events count text
    await page.waitForFunction(() => /Showing (?:all )?\d[\d,]* event/.test(document.body.textContent ?? ""), {
      timeout: 15000,
    });

    // Verify the events count element contains a number
    const countText = await page.textContent("body");
    expect(countText).toMatch(/Showing (?:all )?\d[\d,]* event/);
  });

  test("should filter events when selecting a catalog", async ({ page }) => {
    // Use waitUntil: "domcontentloaded" to avoid waiting for i18n middleware
    await page.goto("/explore/list", { timeout: 30000, waitUntil: "domcontentloaded" });

    // Wait for catalog buttons to load
    await page.waitForSelector('button:has-text("datasets")', { timeout: 15000 });

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
