import { type Page, type Locator, expect } from '@playwright/test';

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
    this.map = page.getByRole('region', { name: 'Map' }).first();
    this.catalogSelect = page.locator('#catalog-select');
    this.datasetCheckboxes = page.locator('input[type="checkbox"]');
    this.startDateInput = page.locator('#start-date');
    this.endDateInput = page.locator('#end-date');
    this.clearDatesButton = page.getByText('Clear date filters');
    this.eventsList = page.locator('.space-y-2').first();
    this.eventsCount = page.locator('h2').filter({ hasText: /Events \(\d+\)/ });
    this.loadingIndicator = page.getByText('Loading events...');
    this.noEventsMessage = page.getByText('No events found');
    this.noDatasetsMessage = page.getByText('No datasets available');
  }

  async goto() {
    await this.page.goto('/explore');
    await this.page.waitForLoadState('networkidle');
  }

  async waitForMapLoad() {
    await this.map.waitFor({ state: 'visible' });
    // Wait for map to be interactive
    await this.page.waitForTimeout(500);
  }

  async selectCatalog(catalogName: string) {
    await this.catalogSelect.click();
    // Wait for dropdown to open and options to be visible
    await this.page.waitForSelector('[role="option"]');
    await this.page.getByRole('option', { name: catalogName }).click();
  }

  async selectDatasets(datasetNames: string[]) {
    for (const datasetName of datasetNames) {
      // Use more specific selector to find checkboxes within dataset labels
      const datasetCheckbox = this.page.locator(`label:has-text("${datasetName}") input[type="checkbox"]`);
      await datasetCheckbox.check();
    }
  }

  async deselectDatasets(datasetNames: string[]) {
    for (const name of datasetNames) {
      await this.page.getByLabel(name).uncheck();
    }
  }

  async setStartDate(date: string) {
    await this.startDateInput.fill(date);
  }

  async setEndDate(date: string) {
    await this.endDateInput.fill(date);
  }

  async clearDateFilters() {
    await this.clearDatesButton.click();
  }

  async panMap(deltaX: number, deltaY: number) {
    const mapBox = await this.map.boundingBox();
    if (!mapBox) throw new Error('Map not found');

    const centerX = mapBox.x + mapBox.width / 2;
    const centerY = mapBox.y + mapBox.height / 2;

    await this.page.mouse.move(centerX, centerY);
    await this.page.mouse.down();
    await this.page.mouse.move(centerX + deltaX, centerY + deltaY);
    await this.page.mouse.up();
  }

  async zoomIn() {
    const mapBox = await this.map.boundingBox();
    if (!mapBox) throw new Error('Map not found');

    const centerX = mapBox.x + mapBox.width / 2;
    const centerY = mapBox.y + mapBox.height / 2;

    await this.page.mouse.dblclick(centerX, centerY);
  }

  async zoomOut() {
    const mapBox = await this.map.boundingBox();
    if (!mapBox) throw new Error('Map not found');

    const centerX = mapBox.x + mapBox.width / 2;
    const centerY = mapBox.y + mapBox.height / 2;

    await this.page.keyboard.down('Shift');
    await this.page.mouse.dblclick(centerX, centerY);
    await this.page.keyboard.up('Shift');
  }

  async getEventCount(): Promise<number> {
    const text = await this.eventsCount.textContent();
    const match = text?.match(/Events \((\d+)\)/);
    return match && match[1] ? parseInt(match[1], 10) : 0;
  }

  async getEventTitles(): Promise<string[]> {
    const events = await this.eventsList.locator('h3').allTextContents();
    return events;
  }

  async clickMapMarker(markerIndex: number) {
    const markers = this.page.locator('.maplibregl-marker');
    await markers.nth(markerIndex).click();
  }

  async getPopupContent(): Promise<string | null> {
    const popup = this.page.locator('.maplibregl-popup-content');
    return await popup.textContent();
  }

  async waitForEventsToLoad() {
    await expect(this.loadingIndicator).not.toBeVisible();
  }

  async waitForApiResponse() {
    await this.page.waitForResponse(response => 
      response.url().includes('/api/events') && response.status() === 200,
      { timeout: 10000 }
    );
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
}