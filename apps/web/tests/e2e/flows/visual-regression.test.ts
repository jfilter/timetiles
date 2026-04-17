/**
 * Visual regression tests to catch unintended styling changes.
 *
 * Uses Playwright's toHaveScreenshot() for pixel-level comparison against
 * baseline images. Run `npx playwright test --update-snapshots` to regenerate
 * baselines after intentional design changes.
 *
 * ## Opt-in on CI
 *
 * These tests are skipped by default because:
 * - Baselines are per-platform (`chromium-darwin.png` vs `chromium-linux.png`);
 *   running on both macOS and Linux CI requires dual baselines maintained
 *   in lockstep.
 * - The explore-page tests capture data that mutates between runs (other
 *   tests create catalogs/datasets during the suite that bleed into the
 *   filter sidebar here).
 * - The "login page" test actually captures the homepage because the
 *   authenticated fixture redirects `/login` away.
 *
 * To run locally or on a specific CI job, set `E2E_VISUAL_REGRESSION=true`
 * before running Playwright. Baselines are generated on first run; review
 * and commit deliberately.
 *
 * @module
 * @category E2E Tests
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { ExplorePage } from "../pages/explore.page";

// eslint-disable-next-line turbo/no-undeclared-env-vars -- test-only opt-in flag
const RUN_VISUAL_REGRESSION = process.env.E2E_VISUAL_REGRESSION === "true";

const waitForExploreScreenshotReady = async (page: Page) => {
  const explorePage = new ExplorePage(page);
  await explorePage.waitForMapLoad();
  await expect(explorePage.eventsCount.or(explorePage.noEventsMessage).first()).toBeVisible({ timeout: 15000 });
};

test.describe("Visual Regression", () => {
  // Skip the whole suite unless explicitly opted in. See module docstring.
  test.skip(!RUN_VISUAL_REGRESSION, "Opt-in only — set E2E_VISUAL_REGRESSION=true");

  // Use a fixed viewport for consistent screenshots
  test.use({ viewport: { width: 1280, height: 800 } });

  test("explore page", async ({ page }) => {
    await page.goto("/explore");
    await waitForExploreScreenshotReady(page);
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
    await waitForExploreScreenshotReady(page);
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
