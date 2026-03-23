/**
 * E2E tests for the embeddable explorer view.
 *
 * Tests that `/embed` renders the explore experience without site chrome
 * (no header, no footer) and with proper security headers.
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "../fixtures";
import { EmbedPage } from "../pages/embed.page";

test.describe("Embed Page", () => {
  let embedPage: EmbedPage;

  test.beforeEach(async ({ page }) => {
    embedPage = new EmbedPage(page);
    await embedPage.goto();
  });

  test("should render the map without header or footer", async () => {
    await expect(embedPage.map).toBeVisible();
    expect(await embedPage.hasHeader()).toBe(false);
    expect(await embedPage.hasFooter()).toBe(false);
  });

  test("should have data-embed attribute on body", async () => {
    await embedPage.assertEmbedMode();
  });

  test("should show the attribution bar", async () => {
    await expect(embedPage.attribution).toBeVisible();
    await expect(embedPage.attribution).toHaveAttribute("target", "_blank");
    await expect(embedPage.attribution).toHaveAttribute("href", /\/explore/);
  });

  test("should load the map properly", async () => {
    await embedPage.waitForMapLoad();
    const mapBox = await embedPage.map.boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox!.width).toBeGreaterThan(200);
    expect(mapBox!.height).toBeGreaterThan(200);
  });

  test("should load data source filters", async () => {
    await expect(embedPage.dataSourcesSection).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Embed Security Headers", () => {
  test("should set frame-ancestors * for embed routes", async ({ request }) => {
    const response = await request.get("/embed");
    const csp = response.headers()["content-security-policy"];
    expect(csp).toContain("frame-ancestors *");
    expect(response.headers()["x-frame-options"]).toBeUndefined();
  });

  test("should set X-Frame-Options DENY for non-embed routes", async ({ request }) => {
    const response = await request.get("/explore");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    const csp = response.headers()["content-security-policy"];
    expect(csp).toContain("frame-ancestors 'self'");
  });
});

test.describe("Embed with View Slug", () => {
  test("should accept view slug in URL path", async ({ page }) => {
    // Navigate to a non-existent view — should show the "not configured" fallback
    // rather than a crash. This validates the route is wired up correctly.
    await page.goto("/embed/nonexistent-view-slug", { timeout: 30000, waitUntil: "domcontentloaded" });

    // The body should still have embed mode
    const body = page.locator("body");
    await expect(body).toHaveAttribute("data-embed", "true");
  });

  test("should accept view via query parameter", async ({ page }) => {
    // ?view= should also work on the base /embed route
    await page.goto("/embed?view=nonexistent", { timeout: 30000, waitUntil: "domcontentloaded" });

    const body = page.locator("body");
    await expect(body).toHaveAttribute("data-embed", "true");
  });
});

test.describe("Embed Locale Support", () => {
  test("should render German locale embed", async ({ page }) => {
    await page.goto("/de/embed", { timeout: 30000, waitUntil: "domcontentloaded" });

    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "de");

    // Attribution should be in German
    const attribution = page.locator("a", { hasText: /Bereitgestellt von TimeTiles/i });
    await expect(attribution).toBeVisible();
  });
});

test.describe("Embed Metadata", () => {
  test("should have noindex robots meta", async ({ page }) => {
    await page.goto("/embed", { timeout: 30000, waitUntil: "domcontentloaded" });

    const robotsMeta = page.locator('meta[name="robots"]');
    const content = await robotsMeta.getAttribute("content");
    expect(content).toContain("noindex");
  });
});
