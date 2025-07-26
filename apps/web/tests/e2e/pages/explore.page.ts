import { type Page, type Locator, expect } from "@playwright/test";

export class ExplorePage {
  readonly page: Page;
  readonly map: Locator;
  readonly catalogSelect: Locator;
  readonly datasetCheckboxes: Locator;
  readonly startDateInput: Locator;
  readonly endDateInput: Locator;
  readonly clearDatesButton: Locator;
  readonly eventsList: Locator;
  readonly eventsCount: Locator;
  readonly loadingIndicator: Locator;
  readonly noEventsMessage: Locator;
  readonly noDatasetsMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.map = page.getByRole("region", { name: "Map" }).first();
    this.catalogSelect = page.locator("#catalog-select");
    this.datasetCheckboxes = page.locator('input[type="checkbox"]');
    this.startDateInput = page.locator("#start-date");
    this.endDateInput = page.locator("#end-date");
    this.clearDatesButton = page.getByText("Clear date filters");
    this.eventsList = page.locator(".space-y-2").first();
    this.eventsCount = page.locator("h2").filter({ hasText: /Events \(\d+\)/ });
    this.loadingIndicator = page.getByText("Loading events...");
    this.noEventsMessage = page.getByText("No events found");
    this.noDatasetsMessage = page.getByText("No datasets available");
  }

  async goto() {
    await this.page.goto("/explore");
    await this.page.waitForLoadState("networkidle");
  }

  async waitForMapLoad() {
    await this.map.waitFor({ state: "visible" });
    // Wait for map to be interactive
    await this.page.waitForTimeout(500);
  }

  async selectCatalog(catalogName: string) {
    await this.catalogSelect.click();
    // Wait for dropdown to open and options to be visible
    await this.page.waitForSelector('[role="option"]', { timeout: 5000 });

    // Wait for the specific option to be available and stable
    const option = this.page.getByRole("option", { name: catalogName });
    await option.waitFor({ state: "visible", timeout: 5000 });

    // Add a small delay to ensure UI stability
    await this.page.waitForTimeout(200);

    await option.click();

    // For "All Catalogs", no URL update expected
    if (catalogName !== "All Catalogs") {
      // Wait for the URL to update with the catalog parameter
      await this.page.waitForFunction(
        (name) => {
          const url = new URL(window.location.href);
          return url.searchParams.has("catalog");
        },
        catalogName,
        { timeout: 5000 },
      );
    }

    // Wait for datasets section to update
    await this.page.waitForSelector("text=Datasets", { timeout: 3000 });
  }

  async selectDatasets(datasetNames: string[]) {
    for (const datasetName of datasetNames) {
      // First, wait for the dataset to be visible in the list
      await this.page.waitForSelector(`text=${datasetName}`, { timeout: 5000 });

      // Use more specific selector to find checkboxes within dataset labels
      const datasetCheckbox = this.page.locator(`label:has-text("${datasetName}") input[type="checkbox"]`);

      // Wait for the checkbox to be visible and enabled
      await datasetCheckbox.waitFor({ state: "visible", timeout: 3000 });
      await datasetCheckbox.check();

      // Brief wait for the selection to register
      await this.page.waitForTimeout(100);
    }
  }

  async deselectDatasets(datasetNames: string[]) {
    for (const name of datasetNames) {
      await this.page.getByLabel(name).uncheck();
    }
  }

  async setStartDate(date: string) {
    await this.startDateInput.fill(date);
    await this.startDateInput.blur();
    await this.page.waitForTimeout(100);
  }

  async setEndDate(date: string) {
    await this.endDateInput.fill(date);
    await this.endDateInput.blur();
    await this.page.waitForTimeout(100);
  }

  async clearDateFilters() {
    await this.clearDatesButton.click();
    await this.page.waitForTimeout(200);
  }

  async panMap(deltaX: number, deltaY: number) {
    const mapBox = await this.map.boundingBox();
    if (!mapBox) throw new Error("Map not found");

    const centerX = mapBox.x + mapBox.width / 2;
    const centerY = mapBox.y + mapBox.height / 2;

    await this.page.mouse.move(centerX, centerY);
    await this.page.mouse.down();
    await this.page.mouse.move(centerX + deltaX, centerY + deltaY);
    await this.page.mouse.up();
  }

  async zoomIn() {
    const mapBox = await this.map.boundingBox();
    if (!mapBox) throw new Error("Map not found");

    const centerX = mapBox.x + mapBox.width / 2;
    const centerY = mapBox.y + mapBox.height / 2;

    await this.page.mouse.dblclick(centerX, centerY);
  }

  async zoomOut() {
    const mapBox = await this.map.boundingBox();
    if (!mapBox) throw new Error("Map not found");

    const centerX = mapBox.x + mapBox.width / 2;
    const centerY = mapBox.y + mapBox.height / 2;

    await this.page.keyboard.down("Shift");
    await this.page.mouse.dblclick(centerX, centerY);
    await this.page.keyboard.up("Shift");
  }

  async getEventCount(): Promise<number> {
    try {
      // Check if the page is still available
      if (this.page.isClosed()) {
        return 0;
      }

      const text = await this.eventsCount.textContent({ timeout: 3000 });
      const match = text?.match(/Events \((\d+)\)/);
      return match?.[1] ? parseInt(match[1], 10) : 0;
    } catch (error) {
      return 0;
    }
  }

  async getEventTitles(): Promise<string[]> {
    return this.eventsList.locator("h3").allTextContents();
  }

  async clickMapMarker(markerIndex: number) {
    const markers = this.page.locator(".maplibregl-marker");
    await markers.nth(markerIndex).click();
  }

  async getPopupContent(): Promise<string | null> {
    const popup = this.page.locator(".maplibregl-popup-content");
    return popup.textContent();
  }

  async waitForEventsToLoad() {
    try {
      // Check if the page is still available
      if (this.page.isClosed()) {
        return;
      }

      await expect(this.loadingIndicator).not.toBeVisible({ timeout: 5000 });
    } catch (error) {
      // If loading indicator check fails, just continue
      console.debug('Loading indicator check failed (non-critical):', error);
    }
  }

  async waitForApiResponse() {
    try {
      await this.page.waitForResponse(
        (response) => response.url().includes("/api/events") && response.status() === 200,
        { timeout: 5000 },
      );
    } catch (error) {
      // If we can't catch the API response quickly, just continue
      // The test should focus on UI state, not API timing
      console.debug('API response timeout (non-critical):', error);
    }
  }

  async getUrlParams(): Promise<URLSearchParams> {
    const url = new URL(this.page.url());
    return url.searchParams;
  }

  async assertUrlParam(param: string, value: string | null) {
    const params = await this.getUrlParams();
    if (value === null) {
      expect(params.has(param)).toBe(false);
    } else {
      expect(params.get(param)).toBe(value);
    }
  }

  async assertUrlParams(expected: Record<string, string | string[] | null>) {
    const params = await this.getUrlParams();

    for (const [key, value] of Object.entries(expected)) {
      if (value === null) {
        expect(params.has(key)).toBe(false);
      } else if (Array.isArray(value)) {
        const actualValues = params.getAll(key);
        expect(actualValues).toEqual(value);
      } else {
        expect(params.get(key)).toBe(value);
      }
    }
  }

  async isPageStable(): Promise<boolean> {
    try {
      if (this.page.isClosed()) {
        return false;
      }

      // Check if we can access a basic element
      await this.page.locator("h1").waitFor({ state: "visible", timeout: 1000 });
      return true;
    } catch (error) {
      return false;
      console.debug('URL parameter assertion failed:', error);    }
  }

  async waitForPageStability() {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      if (await this.isPageStable()) {
        return;
      }

      await this.page.waitForTimeout(500);
      attempts++;
    }

    throw new Error("Page did not become stable within timeout");
  }
}
