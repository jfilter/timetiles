/**
 * E2E tests for locale content rendering.
 *
 * Verifies that CMS page content renders correctly for both
 * English and German locales, catching localization seed issues.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "../fixtures";

test.describe("Locale Content", () => {
  test("homepage renders English content", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Hero section (from Pages collection)
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Explore Your Geodata with TimeTiles", {
      timeout: 10000,
    });

    // Feature cards
    await expect(page.getByRole("heading", { name: "Powerful Features" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Interactive Maps" })).toBeVisible();

    // CTA
    await expect(page.getByRole("heading", { name: "Ready to explore your data?" })).toBeVisible();

    // Footer (from Footer global)
    await expect(page.getByRole("heading", { name: "Project" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Community" })).toBeVisible();
  });

  test("homepage renders German content", async ({ page }) => {
    await page.goto("/de");
    await page.waitForLoadState("domcontentloaded");

    // Hero section
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Erkunden Sie Ihre Geodaten mit TimeTiles", {
      timeout: 10000,
    });

    // Feature cards
    await expect(page.getByRole("heading", { name: "Leistungsstarke Funktionen" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Interaktive Karten" })).toBeVisible();

    // CTA
    await expect(page.getByRole("heading", { name: "Bereit, Ihre Daten zu erkunden?" })).toBeVisible();

    // Footer
    await expect(page.getByRole("heading", { name: "Projekt" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gemeinschaft" })).toBeVisible();
  });
});
