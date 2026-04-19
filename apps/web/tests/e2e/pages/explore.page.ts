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
    // "Datasets" collapsible section trigger (renamed from "Data Sources")
    this.dataSourcesSection = page.getByRole("button", { name: /^Datasets/i });
    // Catalog group checkboxes — each has aria-label "Select all datasets in X"
    this.catalogButtons = page.locator('[role="checkbox"][aria-label*="all datasets in"]');
    this.datasetCheckboxes = page.locator('[role="checkbox"]');
    // New date picker UI uses buttons instead of input fields
    this.startDateInput = page.getByRole("button", { name: /Start date:/i });
    this.endDateInput = page.getByRole("button", { name: /End date:/i });
    // Clear dates button format changed - now shows date range like "Feb 2024 → Jan 2026"
    this.clearDatesButton = page.getByRole("button", { name: /→/ });
    this.eventsList = page.locator(".space-y-2").first();
    // Events count format changed to "Showing X of Y events" or "Showing all X events"
    this.eventsCount = page
      .locator("p")
      .filter({ hasText: /Showing .* event/ })
      .first();
    this.loadingIndicator = page.getByText("Loading...").first();
    // New UI shows "Showing all 0 events" or "Showing 0 of X events" when no events match
    this.noEventsMessage = page
      .locator("p")
      .filter({ hasText: /Showing (?:all )?0|No events/ })
      .first();
    this.noDatasetsMessage = page.getByText(/No data(sets)? available/).first();
  }

  /**
   * Navigate to the explore page.
   *
   * @param options.globalView when true, navigates with lat/lng/zoom URL
   *   params that initialize the map at a global view (lat=0, lng=0, zoom=2).
   *   Use this for tests that rely on the map-bounded temporal histogram
   *   having data — the seed events are scattered globally, not in the
   *   hardcoded default view (Berlin at zoom 12).
   */
  async goto(options?: { globalView?: boolean }) {
    const path = options?.globalView ? "/explore?lat=0&lng=0&zoom=1" : "/explore";
    await this.page.goto(path, { timeout: 30000, waitUntil: "domcontentloaded" });
    await this.map.waitFor({ state: "visible", timeout: 15000 });
    await this.dataSourcesSection.waitFor({ state: "visible", timeout: 10000 });

    // Wait for catalog/dataset checkboxes to appear (API data loaded)
    await this.page.waitForSelector('[role="checkbox"]', { timeout: 15000 });
  }

  async waitForMapLoad() {
    await this.map.waitFor({ state: "visible", timeout: 15000 });
    await expect(this.page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 10000 });
    await expect(this.dataSourcesSection).toBeVisible({ timeout: 10000 });

    const loadingText = this.page.getByText(/loading map data/i);
    await loadingText.waitFor({ state: "hidden", timeout: 15000 }).catch(async (err) => {
      if (await loadingText.isVisible().catch(() => false)) throw err;
    });

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
    // Wait for either the "Loading timeline..." label to disappear (if present)
    // or the final timeline UI to render. Skipping the `/api/v1/events/temporal`
    // waitForResponse — the timeline UI is the user-visible contract; the
    // response-level wait just races with cache hits and hides real timing
    // bugs. The downstream waits cover both cached and uncached cases.
    const loadingText = this.page.getByText("Loading timeline...");
    // Don't fail if loadingText isn't present (cached render) — only if it's
    // still visible after timeout, which is a real regression.
    await loadingText.waitFor({ state: "hidden", timeout: 10000 }).catch(async (err) => {
      if (await loadingText.isVisible().catch(() => false)) throw err;
    });

    // Wait for either the date range button (data state) or "No events to display".
    // If neither appears within 10s the page has failed to render the timeline —
    // let the error propagate so the test fails with a meaningful stack.
    const dateRangeButton = this.page
      .locator("button")
      .filter({ hasText: /\w{3} \d{4} → \w{3} \d{4}/ })
      .first();
    const noEventsText = this.page.getByText("No events to display");

    await Promise.race([
      dateRangeButton.waitFor({ state: "visible", timeout: 10000 }),
      noEventsText.waitFor({ state: "visible", timeout: 10000 }),
    ]);
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

    // Wait for timeline to be loaded first
    await this.waitForTimelineReady();

    // The date range button shows format like "Jan 2024 → Dec 2025"
    // It's inside the Time Range section and contains "→" text
    // Look for a button with text containing months and arrow
    const dateRangeButton = this.page
      .locator("button")
      .filter({ hasText: /\w{3} \d{4} → \w{3} \d{4}/ })
      .first();

    // Wait for button to be visible and stable before clicking.
    // Previously used `force: true` to bypass actionability checks,
    // which masked overlay/animation issues in the time-range section.
    await dateRangeButton.waitFor({ state: "visible", timeout: 10000 });
    await dateRangeButton.scrollIntoViewIfNeeded();
    await dateRangeButton.click({ timeout: 10000 });

    // Wait for edit mode to open (date inputs to appear)
    await dateInputs.first().waitFor({ state: "visible", timeout: 5000 });
  }

  /**
   * Open the filter drawer if it's not already open.
   * The filter drawer contains catalog and dataset selection.
   * Note: Filter drawer is open by default on page load.
   */
  async openFilterDrawer() {
    // Check if filter drawer is already open by looking for any checkbox
    const anyCheckbox = this.page.locator('[role="checkbox"]').first();
    const isAlreadyOpen = await anyCheckbox.isVisible({ timeout: 2000 }).catch(() => false);

    if (isAlreadyOpen) {
      // Already open, nothing to do
      return;
    }

    // Try to find "Show filters" button (visible when drawer is closed)
    const showFiltersButton = this.page.getByRole("button", { name: /Show filters|Filters/i });
    const showButtonVisible = await showFiltersButton.isVisible({ timeout: 1000 }).catch(() => false);

    if (showButtonVisible) {
      await showFiltersButton.click();
      // Wait for the drawer to open (checkboxes should become visible)
      await anyCheckbox.waitFor({ state: "visible", timeout: 5000 });
    }
  }

  /**
   * Select (or deselect) all datasets in a catalog group via its tri-state checkbox.
   * Aria-label format: "Select all datasets in {name}" or "Deselect all datasets in {name}".
   * On select: URL gains `datasets=` with all that catalog's IDs.
   */
  async selectAllInCatalog(catalogName: string) {
    await this.openFilterDrawer();
    await this.page.waitForSelector('[role="checkbox"]', { timeout: 15000 });

    const catalogCheckbox = this.page.locator(`[role="checkbox"][aria-label*="${catalogName}"]`).first();
    await catalogCheckbox.waitFor({ state: "visible", timeout: 10000 });
    await catalogCheckbox.scrollIntoViewIfNeeded();
    await catalogCheckbox.click({ timeout: 10000 });

    // Catalog click must push `datasets` into the URL — nuqs is `history: "replace"`
    // but still synchronous from the browser's perspective. If this times out
    // the test has found a real regression in the selection wiring.
    await this.page.waitForFunction(() => new URL(globalThis.location.href).searchParams.has("datasets"), {
      timeout: 5000,
    });
  }

  /**
   * Expand every collapsed catalog group so every dataset row is rendered.
   * Catalog groups auto-collapse once any dataset is selected (only the
   * group with selected children stays open), so individual datasets in
   * other catalogs become unreachable. Call this before locating a dataset.
   */
  async expandAllCatalogs() {
    // Collapsed catalog buttons contain a chevron-right icon
    const collapsedButtons = this.page.locator("button:has(.lucide-chevron-right)");
    const count = await collapsedButtons.count();
    for (let i = 0; i < count; i++) {
      // Re-query each iteration since the DOM mutates after each click
      const button = this.page.locator("button:has(.lucide-chevron-right)").first();
      const visible = await button.isVisible({ timeout: 500 }).catch(() => false);
      if (!visible) break;
      await button.scrollIntoViewIfNeeded();
      await button.click();
    }
  }

  /**
   * Toggle a single dataset's checkbox by clicking its label row.
   * Used for individual dataset selection / deselection.
   */
  async toggleDataset(datasetName: string) {
    await this.openFilterDrawer();
    await this.page.waitForSelector('[role="checkbox"]', { timeout: 15000 });

    // Catalog groups collapse after the first dataset is selected — expand
    // any collapsed groups so the dataset label is reachable.
    await this.expandAllCatalogs();

    const datasetLabel = this.page
      .locator("label")
      .filter({ hasText: new RegExp(datasetName, "i") })
      .first();
    await datasetLabel.waitFor({ state: "visible", timeout: 10000 });
    await datasetLabel.scrollIntoViewIfNeeded();
    await datasetLabel.click({ timeout: 10000 });
    await this.waitForApiResponse();
  }

  /**
   * Get all visible catalog names from the Datasets section.
   * Extracts names from catalog tri-state checkbox aria-labels.
   */
  async getAvailableCatalogs(): Promise<string[]> {
    await this.openFilterDrawer();
    await this.page.waitForSelector('[role="checkbox"]', { timeout: 10000 });

    const ariaLabels = await this.catalogButtons.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? "")
    );

    return ariaLabels
      .map((label) => {
        const match = /all datasets in (.+)$/.exec(label);
        return match?.[1]?.trim() ?? "";
      })
      .filter(Boolean);
  }

  /**
   * Get all visible dataset labels (text content of the dataset rows).
   * Useful for asserting which datasets are visible after filtering.
   */
  async getAvailableDatasets(): Promise<string[]> {
    await this.openFilterDrawer();
    await this.page.waitForSelector('[role="checkbox"]', { timeout: 10000 });

    // Dataset labels wrap each individual dataset checkbox.
    // The label's first text node is the dataset name.
    return this.page.locator("label").evaluateAll((labels) =>
      labels
        .map((label) => {
          const nameSpan = label.querySelector("span > span");
          return nameSpan?.textContent?.trim() ?? "";
        })
        .filter(Boolean)
    );
  }

  /**
   * Get currently-selected dataset names (checkboxes in checked state).
   */
  async getSelectedDatasets(): Promise<string[]> {
    return this.page.locator("label").evaluateAll((labels) =>
      labels
        .filter((label) => {
          const cb = label.querySelector('[role="checkbox"]');
          return cb?.getAttribute("data-state") === "checked";
        })
        .map((label) => {
          const nameSpan = label.querySelector("span > span");
          return nameSpan?.textContent?.trim() ?? "";
        })
        .filter(Boolean)
    );
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

    // URL is the canonical source of truth for filter state — if it doesn't
    // update after filling the start-date input, the filter wiring is broken
    // and the test should fail here, not later with a mysterious mismatch.
    await this.page.waitForFunction(
      (expectedDate) => globalThis.location.href.includes(`startDate=${expectedDate}`),
      date,
      { timeout: 5000 }
    );
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

    await this.page.waitForFunction(
      (expectedDate) => globalThis.location.href.includes(`endDate=${expectedDate}`),
      date,
      { timeout: 5000 }
    );
  }

  async clearDateFilters() {
    // Try to use the "Clear date filters" button if visible
    const clearButton = this.page.getByRole("button", { name: /Clear date filters/i });
    const isClearButtonVisible = await clearButton.isVisible().catch(() => false);

    if (isClearButtonVisible) {
      await clearButton.click();
      await this.page.waitForFunction(
        () => {
          const url = new URL(globalThis.location.href);
          return !url.searchParams.has("startDate") && !url.searchParams.has("endDate");
        },
        { timeout: 5000 }
      );
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

    // Match "Showing X of Y events" or "Showing all X events" or "Showing X event(s)"
    // Use simple pattern - extract the first number after "Showing"
    const matches = /Showing (?:all )?(\d[\d,]*)/.exec(text);
    if (!matches?.[1]) {
      throw new Error(`Events count text does not match expected pattern: "${text}"`);
    }

    // Remove commas from number (e.g., "1,245" -> "1245")
    const count = Number.parseInt(matches[1].replaceAll(",", ""), 10);

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
    await expect(this.loadingIndicator).not.toBeVisible({ timeout: 10000 });
  }

  async waitForApiResponse() {
    // Wait for API response with a reasonable timeout
    // Don't wait forever if no API call is made
    try {
      await this.page.waitForResponse(
        (response) => response.url().includes("/api/v1/events") || response.url().includes("/api/events"),
        { timeout: 5000 }
      );
    } catch {
      // If no API call within 2s, data is likely cached — continue immediately
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
