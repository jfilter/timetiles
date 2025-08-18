import { expect, type Locator, type Page } from "@playwright/test";

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
    // Wait for map to be fully loaded and interactive
    await this.page.waitForFunction(
      () => {
        // Check if map container exists and has content
        const mapContainer = document.querySelector(
          '[data-testid="map-container"], .maplibregl-canvas, .mapboxgl-canvas'
        );
        return mapContainer !== null;
      },
      { timeout: 5000 }
    );
  }

  async selectCatalog(catalogName: string) {
    await this.catalogSelect.click();
    // Wait for dropdown to open and options to be visible
    await this.page.waitForSelector('[role="option"]', { timeout: 5000 });

    // Wait for the specific option to be available and stable
    const option = this.page.getByRole("option", { name: catalogName });
    await option.waitFor({ state: "visible", timeout: 5000 });

    // Wait for the option to be clickable
    await option.waitFor({ state: "attached" });

    await option.click();

    // For "All Catalogs", no URL update expected
    if (catalogName !== "All Catalogs") {
      // Wait for the URL to update with the catalog parameter
      await this.page.waitForFunction(
        () => {
          const url = new URL(window.location.href);
          return url.searchParams.has("catalog");
        },
        catalogName,
        { timeout: 5000 }
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

      // Ensure checkbox state has been updated
      await expect(datasetCheckbox).toBeChecked();
    }
  }

  async deselectDatasets(datasetNames: string[]) {
    for (const name of datasetNames) {
      // Use the same specific selector as selectDatasets to avoid ambiguity
      const datasetCheckbox = this.page.locator(`label:has-text("${name}") input[type="checkbox"]`);
      await datasetCheckbox.uncheck();
    }
  }

  async setStartDate(date: string) {
    await this.startDateInput.fill(date);
    await this.startDateInput.blur();
    // Verify the value was set
    await expect(this.startDateInput).toHaveValue(date);
  }

  async setEndDate(date: string) {
    await this.endDateInput.fill(date);
    await this.endDateInput.blur();
    // Verify the value was set
    await expect(this.endDateInput).toHaveValue(date);
  }

  async clearDateFilters() {
    await this.clearDatesButton.click();
    // Wait for inputs to be cleared
    await expect(this.startDateInput).toHaveValue("");
    await expect(this.endDateInput).toHaveValue("");
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
    // Wait for the events count element to be visible with the expected pattern
    await this.eventsCount.waitFor({ state: "visible", timeout: 5000 });
    const text = await this.eventsCount.textContent({ timeout: 3000 });

    if (!text) {
      throw new Error("Events count text is empty");
    }

    const matches = /Events \((\d+)\)/.exec(text);
    if (!matches?.[1]) {
      throw new Error(`Events count text does not match expected pattern: "${text}"`);
    }

    const count = Number.parseInt(matches[1], 10);

    // Debug logging to help understand what's happening
    console.log(`getEventCount: text="${text}", count=${count}`);

    return count;
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
    // Wait for loading indicator to disappear
    await expect(this.loadingIndicator).not.toBeVisible({ timeout: 10000 });
  }

  async waitForApiResponse() {
    // Wait for API response with a reasonable timeout
    // Don't wait forever if no API call is made
    try {
      await this.page.waitForResponse((response) => response.url().includes("/api/events"), { timeout: 2000 });
    } catch (error) {
      // If no API call within 2s, just ensure network is idle
      // This handles cases where data is cached or no request is triggered
      await this.page.waitForLoadState("networkidle", { timeout: 500 });
    }
  }

  getUrlParams(): Promise<URLSearchParams> {
    const url = new URL(this.page.url());
    return Promise.resolve(url.searchParams);
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
    if (this.page.isClosed()) {
      throw new Error("Page is closed");
    }

    try {
      // Check if we can access a basic element
      await this.page.locator("h1").waitFor({ state: "visible", timeout: 1000 });
      return true;
    } catch (error) {
      // Page is not stable yet, but this is expected during checks
      return false;
    }
  }

  async waitForPageStability() {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      if (await this.isPageStable()) {
        return;
      }

      // Brief pause between stability checks
      await new Promise((resolve) => setTimeout(resolve, 500));
      attempts++;
    }

    throw new Error("Page did not become stable within timeout");
  }
}
