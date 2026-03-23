/**
 * Page object model for the embed page.
 *
 * Provides methods and locators for interacting with the
 * embeddable explorer view during E2E tests.
 *
 * @module
 * @category E2E Tests
 */
import { expect, type Locator, type Page } from "@playwright/test";

export class EmbedPage {
  readonly page: Page;
  readonly map: Locator;
  readonly attribution: Locator;
  readonly dataSourcesSection: Locator;

  constructor(page: Page) {
    this.page = page;
    this.map = page.getByRole("region", { name: "Map" }).first();
    this.attribution = page.locator("a", { hasText: /Powered by TimeTiles/i });
    this.dataSourcesSection = page.getByRole("button", { name: /Data Sources/i });
  }

  /** Navigate to the default embed page. */
  async goto(viewSlug?: string) {
    const path = viewSlug ? `/embed/${viewSlug}` : "/embed";
    await this.page.goto(path, { timeout: 30000, waitUntil: "domcontentloaded" });
    await this.map.waitFor({ state: "visible", timeout: 15000 });
  }

  /** Wait for the map canvas to be fully rendered. */
  async waitForMapLoad() {
    await this.map.waitFor({ state: "visible", timeout: 15000 });
    await this.page.waitForFunction(
      () => {
        const canvas = document.querySelector('[data-testid="map-container"], .maplibregl-canvas, .mapboxgl-canvas');
        return canvas !== null;
      },
      { timeout: 15000 }
    );
  }

  /** Returns true if the site header (marketing or app) is visible. */
  async hasHeader(): Promise<boolean> {
    const header = this.page.locator("header").first();
    return header.isVisible({ timeout: 2000 }).catch(() => false);
  }

  /** Returns true if the site footer is visible. */
  async hasFooter(): Promise<boolean> {
    const footer = this.page.locator("footer").first();
    return footer.isVisible({ timeout: 2000 }).catch(() => false);
  }

  /** Assert that the embed body tag has the data-embed attribute. */
  async assertEmbedMode() {
    const body = this.page.locator("body");
    await expect(body).toHaveAttribute("data-embed", "true");
  }
}
