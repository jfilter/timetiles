/**
 * Page object model for the explore page.
 *
 * Provides methods and locators for interacting with
 * the explore page during E2E tests.
 *
 * @module
 * @category E2E Tests
 */
import { expect, type Locator, type Page } from "@playwright/test";

export class ExplorePage {
  readonly page: Page;
  readonly map: Locator;
  /** @deprecated Use catalogButtons instead - UI redesigned from select to buttons */
  readonly catalogSelect: Locator;
  readonly catalogButtons: Locator;
  readonly dataSourcesSection: Locator;
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
    // @deprecated - Legacy selector, UI was redesigned. Catalogs are now buttons.
    this.catalogSelect = page.locator("#catalog-select"); // eslint-disable-line sonarjs/deprecation
    // New catalog UI: buttons under "Data Sources" / "Catalogs" section
    this.dataSourcesSection = page.getByRole("button", { name: /Data Sources/i });
    this.catalogButtons = page.locator("button").filter({ hasText: /datasets?|events?/i });
    this.datasetCheckboxes = page.locator('input[type="checkbox"]');
    // New date picker UI uses buttons instead of input fields
    this.startDateInput = page.getByRole("button", { name: /Start date:/i });
    this.endDateInput = page.getByRole("button", { name: /End date:/i });
    // Clear dates button format changed - now shows date range like "Feb 2024 → Jan 2026"
    this.clearDatesButton = page.getByRole("button", { name: /→/ });
    this.eventsList = page.locator(".space-y-2").first();
    // Events count format changed to "Events (X of Y)" or "Events (X)"
    this.eventsCount = page
      .locator("h2")
      .filter({ hasText: /Events \(\d+/ })
      .first();
    this.loadingIndicator = page.getByText("Loading events...").first();
    this.noEventsMessage = page.getByText("No events found").first();
    this.noDatasetsMessage = page.getByText("No datasets available");
  }

  async goto() {
    await this.page.goto("/explore", { timeout: 30000 });
    // Wait for key elements to be visible instead of networkidle
    // (networkidle is unreliable with SPAs that have polling/websockets)
    await this.map.waitFor({ state: "visible", timeout: 30000 });
    await this.dataSourcesSection.waitFor({ state: "visible", timeout: 15000 });
  }

  async waitForMapLoad() {
    await this.map.waitFor({ state: "visible", timeout: 30000 });
    // Wait for map to be fully loaded and interactive
    await this.page.waitForFunction(
      () => {
        // Check if map container exists and has content
        const mapContainer = document.querySelector(
          '[data-testid="map-container"], .maplibregl-canvas, .mapboxgl-canvas'
        );
        return mapContainer !== null;
      },
      { timeout: 15000 }
    );
  }

  /**
   * Wait for the timeline/date range slider to be ready.
   * The timeline shows different states:
   * - "Loading timeline..." when fetching data
   * - "No events to display" when no events match current filters
   * - The actual slider UI with date range button when data is available
   */
  async waitForTimelineReady() {
    // First, wait for "Loading timeline..." to disappear (if present)
    const loadingText = this.page.getByText("Loading timeline...");
    await loadingText.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {
      // If not visible, that's fine - timeline might already be loaded or not yet started
    });

    // Wait for either the date range button (normal state) or "No events to display" message
    const dateRangeButton = this.page.getByRole("button", { name: /→/ }).last();
    const noEventsText = this.page.getByText("No events to display");

    // Wait for one of these states
    await Promise.race([
      dateRangeButton.waitFor({ state: "visible", timeout: 15000 }),
      noEventsText.waitFor({ state: "visible", timeout: 15000 }),
    ]).catch(() => {
      // If neither appears, continue anyway - might be a timing issue
    });
  }

  /**
   * Enter date edit mode if not already in it.
   * In edit mode, two date input fields are visible.
   */
  async enterDateEditMode() {
    // Check if we're already in edit mode by looking for date input fields
    const dateInputs = this.page.locator('input[type="date"]');
    const inputCount = await dateInputs.count();

    if (inputCount >= 2) {
      // Already in edit mode (two date inputs visible)
      const firstInput = dateInputs.first();
      if (await firstInput.isVisible()) {
        return;
      }
    }

    // Not in edit mode - find and click the date range button to open it
    // The date range button shows format like "Jan 2024 → Dec 2025"
    // It's a button containing "→" but NOT in the slider track (those have aria-label with "date:")
    const allArrowButtons = this.page.getByRole("button", { name: /→/ });
    const buttonCount = await allArrowButtons.count();

    // Find the button that is the date range display (not slider handles)
    for (let i = 0; i < buttonCount; i++) {
      const button = allArrowButtons.nth(i);
      const ariaLabel = await button.getAttribute("aria-label");

      // Skip slider handles (they have aria-label starting with date info)
      if (ariaLabel && (ariaLabel.includes("date:") || ariaLabel.includes("valuemin"))) {
        continue;
      }

      // This is likely the date range button - click it
      await button.click();
      break;
    }

    // Wait for edit mode to open (date inputs to appear)
    await dateInputs.first().waitFor({ state: "visible", timeout: 5000 });
  }

  async selectCatalog(catalogName: string) {
    // New UI: catalogs are displayed as buttons under "Data Sources" section
    // Each button shows: "CatalogName X datasets Y events"
    const catalogButton = this.page.getByRole("button", { name: new RegExp(catalogName, "i") }).first();
    await catalogButton.waitFor({ state: "visible", timeout: 5000 });
    await catalogButton.click();

    // Wait for UI to update after selection
    await this.page.waitForTimeout(500);
  }

  /**
   * Get all available catalog names from the Data Sources section.
   * Returns array of catalog names (without dataset/event counts).
   */
  async getAvailableCatalogs(): Promise<string[]> {
    // Wait for catalogs to load
    await this.page.waitForSelector('button:has-text("datasets")', { timeout: 5000 });

    // Get all catalog buttons
    const buttons = await this.catalogButtons.allTextContents();

    // Extract catalog names (text before the numbers)
    return buttons.map((text) => {
      // Format: "Catalog Name X datasets Y events" or "Catalog Name X dataset"
      // Use indexOf to find where the number starts instead of regex with backtracking
      const numIndex = text.search(/\d/);
      if (numIndex > 0) {
        return text.slice(0, numIndex).trim();
      }
      return text.trim();
    });
  }

  async selectDatasets(datasetNames: string[]) {
    for (const datasetName of datasetNames) {
      // New UI: datasets are shown as buttons with event counts (e.g., "Air Quality Measurements5")
      // Use partial name match since buttons have numbers appended
      const datasetButton = this.page.getByRole("button", { name: new RegExp(datasetName, "i") }).first();
      await datasetButton.waitFor({ state: "visible", timeout: 5000 });
      await datasetButton.click();
      // Wait for UI to update after selection
      await this.page.waitForTimeout(300);
    }
  }

  async deselectDatasets(datasetNames: string[]) {
    for (const name of datasetNames) {
      // New UI: click the dataset button again to deselect
      const datasetButton = this.page.getByRole("button", { name: new RegExp(name, "i") }).first();
      await datasetButton.click();
      await this.page.waitForTimeout(300);
    }
  }

  async setStartDate(date: string) {
    // Wait for timeline to load first (date range button only appears after timeline loads)
    await this.waitForTimelineReady();

    // Enter edit mode if not already in it
    await this.enterDateEditMode();

    // Wait for the date inputs to appear (start date is first date input)
    const dateInputs = this.page.locator('input[type="date"]');
    const startDateInput = dateInputs.first();
    await startDateInput.waitFor({ state: "visible", timeout: 3000 });

    // Clear and fill the date input
    await startDateInput.fill(date);

    // Wait for URL to update with the date
    await this.page
      .waitForFunction((expectedDate) => window.location.href.includes(`startDate=${expectedDate}`), date, {
        timeout: 5000,
      })
      .catch(() => {
        // URL might not update immediately, continue anyway
      });
  }

  async setEndDate(date: string) {
    // Wait for timeline to load first (date range button only appears after timeline loads)
    await this.waitForTimelineReady();

    // Enter edit mode if not already in it
    await this.enterDateEditMode();

    // Wait for the date inputs to appear (end date is second date input)
    const dateInputs = this.page.locator('input[type="date"]');
    const endDateInput = dateInputs.nth(1);
    await endDateInput.waitFor({ state: "visible", timeout: 3000 });

    // Clear and fill the date input
    await endDateInput.fill(date);

    // Wait for URL to update with the date
    await this.page
      .waitForFunction((expectedDate) => window.location.href.includes(`endDate=${expectedDate}`), date, {
        timeout: 5000,
      })
      .catch(() => {
        // URL might not update immediately, continue anyway
      });
  }

  async clearDateFilters() {
    // Try to use the "Clear date filters" button if visible
    const clearButton = this.page.getByRole("button", { name: /Clear date filters/i });
    const isClearButtonVisible = await clearButton.isVisible().catch(() => false);

    if (isClearButtonVisible) {
      await clearButton.click();
      // Wait for URL to update
      await this.page
        .waitForFunction(
          () => {
            const url = new URL(window.location.href);
            return !url.searchParams.has("startDate") && !url.searchParams.has("endDate");
          },
          { timeout: 5000 }
        )
        .catch(() => {
          // Continue anyway
        });
    } else {
      // Fallback: clear dates by navigating to /explore without date params
      const currentUrl = new URL(this.page.url());
      currentUrl.searchParams.delete("startDate");
      currentUrl.searchParams.delete("endDate");

      // Navigate to the URL without date params
      await this.page.goto(currentUrl.toString());

      // Wait for page to stabilize
      await this.map.waitFor({ state: "visible", timeout: 10000 });
    }
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

    // Match "Events (X)" or "Events (X of Y)" - capture the first number
    // Use simple pattern - extract digits after opening parenthesis
    const matches = /Events \((\d+)/.exec(text);
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
    // Use longer timeout to handle server resource constraints
    await expect(this.loadingIndicator).not.toBeVisible({ timeout: 30000 });
  }

  async waitForApiResponse() {
    // Wait for API response with a reasonable timeout
    // Don't wait forever if no API call is made
    try {
      await this.page.waitForResponse((response) => response.url().includes("/api/events"), { timeout: 2000 });
    } catch {
      // If no API call within 2s, just wait a brief moment
      // This handles cases where data is cached or no request is triggered
      // Note: Don't use networkidle as it's unreliable with SPAs that have polling
      await this.page.waitForTimeout(500);
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
    } catch {
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
