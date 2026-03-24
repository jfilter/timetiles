/**
 * Visual regression tests to catch unintended styling changes.
 *
 * Uses Playwright's toHaveScreenshot() for pixel-level comparison against
 * baseline images. Run `npx playwright test --update-snapshots` to regenerate
 * baselines after intentional design changes.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "../fixtures";

test.describe("Visual Regression", () => {
  // Use a fixed viewport for consistent screenshots
  test.use({ viewport: { width: 1280, height: 800 } });

  test("explore page", async ({ page }) => {
    await page.goto("/explore");
    // Wait for map tiles and data to load
    await page.waitForLoadState("networkidle");
    // Extra wait for map rendering
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot("explore-page.png", {
      maxDiffPixelRatio: 0.03,
      // Mask dynamic content: map canvas and chart (data-dependent histogram bars)
      mask: [page.locator(".maplibregl-canvas"), page.locator("[class*='echarts']")],
    });
  });

  test("explore page - dark mode", async ({ page }) => {
    // Set dark mode before navigating
    await page.addInitScript(() => {
      localStorage.setItem("timetiles-theme", "dark");
    });
    await page.goto("/explore");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot("explore-page-dark.png", {
      maxDiffPixelRatio: 0.03,
      mask: [page.locator(".maplibregl-canvas"), page.locator("[class*='echarts']")],
    });
  });

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("login-page.png", { maxDiffPixelRatio: 0.01 });
  });

  test("not found page", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("not-found-page.png", { maxDiffPixelRatio: 0.01 });
  });

  test("import wizard - upload step", async ({ page }) => {
    // Uses auth state from setup
    await page.goto("/ingest");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("import-wizard-upload.png", { maxDiffPixelRatio: 0.01 });
  });
});
