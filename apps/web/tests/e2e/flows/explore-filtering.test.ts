/**
 * E2E tests for explore page filtering functionality.
 *
 * Tests dataset filtering and date range filtering on the explore page.
 * The dataset-centric filter UI exposes a single `datasets` URL param
 * (an array of selected dataset IDs). Catalog tri-state checkboxes are
 * a bulk action: "select all datasets in this catalog".
 *
 * @module
 * @category E2E Tests
 */
import type { Page, Response } from "@playwright/test";

import { expect, test } from "../fixtures";
import { ExplorePage } from "../pages/explore.page";

const waitForEventsListResponse = (page: Page, expectedParams: Record<string, string>) =>
  page.waitForResponse(
    (response) => {
      if (response.request().method() !== "GET") return false;

      const url = new URL(response.url());
      return (
        url.pathname === "/api/v1/events" &&
        Object.entries(expectedParams).every(([key, value]) => url.searchParams.get(key) === value)
      );
    },
    { timeout: 15000 }
  );

/**
 * Ranges derived from today, not hard-coded.
 *
 * The environmental seed timestamps events at `Date.now() - index * 1h`, so the data always
 * sits in the current month. Fixed 2024 windows matched it only while "now" was in 2024 —
 * these assertions had been failing on every run since, for a reason that had nothing to do
 * with filtering.
 */
const pad = (value: number): string => String(value).padStart(2, "0");

const CURRENT_YEAR = new Date().getUTCFullYear();

const YEAR_START = `${CURRENT_YEAR}-01-01`;
const YEAR_END = `${CURRENT_YEAR}-12-31`;

const expectEventsWithinDateRange = async (response: Response, startDate: string, endDate: string) => {
  expect(response.status()).toBe(200);

  const body = (await response.json()) as { events?: Array<{ eventTimestamp?: string | null }> };
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T23:59:59.999Z`).getTime();

  // Without this the whole check is vacuous: an empty result skips the loop and
  // the helper asserts nothing but the status code, so a filter that wrongly
  // excludes everything passes exactly like a correct one. Both callers filter
  // ranges the seed data covers, so an empty response is itself a failure.
  const events = body.events ?? [];
  expect(events.length).toBeGreaterThan(0);

  for (const event of events) {
    expect(event.eventTimestamp).toBeTruthy();
    const timestamp = new Date(event.eventTimestamp!).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(start);
    expect(timestamp).toBeLessThanOrEqual(end);
  }
};

test.describe("Explore Page - Filtering", () => {
  let explorePage: ExplorePage;

  test.beforeEach(async ({ page }) => {
    explorePage = new ExplorePage(page);
    // Initialize at global view so date-range tests can render the
    // temporal histogram (bounded to the map viewport) over seeded
    // events which are scattered globally.
    await explorePage.goto({ globalView: true });
    await explorePage.waitForMapLoad();
  });

  test("should select all datasets in a catalog via tri-state checkbox", async () => {
    // The catalog tri-state checkbox selects every dataset in the group at once.
    await explorePage.selectAllInCatalog("Environmental Data");
    await explorePage.waitForApiResponse();

    // URL should have datasets param with multiple comma-separated IDs
    const params = await explorePage.getUrlParams();
    expect(params.has("datasets")).toBe(true);
    const ids = params.get("datasets")?.split(",") ?? [];
    expect(ids.length).toBeGreaterThan(1);

    // Datasets in the catalog are visible as checkbox labels
    await expect(
      explorePage.page
        .locator("label")
        .filter({ hasText: /Air Quality Measurements/i })
        .first()
    ).toBeVisible();

    // Events count is rendered (may be 0 if map bounds filter all out)
    await expect(explorePage.eventsCount).toBeVisible();
  });

  test("should filter by a single dataset", async () => {
    // Groups are expanded by default — click the dataset checkbox directly.
    await explorePage.toggleDataset("Air Quality Measurements");

    await expect(explorePage.eventsCount).toBeVisible();

    const params = await explorePage.getUrlParams();
    expect(params.has("datasets")).toBe(true);
    // Only one dataset should be selected
    const ids = params.get("datasets")?.split(",") ?? [];
    expect(ids).toHaveLength(1);
  });

  test("should filter by multiple datasets", async () => {
    await explorePage.toggleDataset("Air Quality Measurements");
    await explorePage.toggleDataset("GDP Growth Rates");

    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    const params = await explorePage.getUrlParams();
    expect(params.has("datasets")).toBe(true);
    const ids = params.get("datasets")?.split(",") ?? [];
    expect(ids).toHaveLength(2);
  });

  test("should filter by date range", async ({ page }) => {
    await explorePage.toggleDataset("Air Quality Measurements");

    const filteredResponsePromise = waitForEventsListResponse(page, { startDate: YEAR_START, endDate: YEAR_END });

    await explorePage.setStartDate(YEAR_START);
    await explorePage.setEndDate(YEAR_END);
    const filteredResponse = await filteredResponsePromise;

    await explorePage.page.waitForFunction(
      () => {
        const url = new URL(globalThis.location.href);
        return url.searchParams.has("startDate") && url.searchParams.has("endDate");
      },
      { timeout: 5000 }
    );

    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    await explorePage.assertUrlParam("startDate", YEAR_START);
    await explorePage.assertUrlParam("endDate", YEAR_END);
    await expectEventsWithinDateRange(filteredResponse, YEAR_START, YEAR_END);
  });

  test("should clear date filters", async () => {
    await explorePage.toggleDataset("Air Quality Measurements");
    await explorePage.setStartDate(YEAR_START);
    await explorePage.setEndDate(YEAR_END);

    await explorePage.waitForApiResponse();
    await explorePage.clearDateFilters();

    await explorePage.page.waitForFunction(
      () => {
        const url = new URL(globalThis.location.href);
        return !url.searchParams.has("startDate") && !url.searchParams.has("endDate");
      },
      { timeout: 5000 }
    );

    await explorePage.assertUrlParam("startDate", null);
    await explorePage.assertUrlParam("endDate", null);
  });

  test("should combine multiple filters", async () => {
    await explorePage.toggleDataset("Air Quality Measurements");
    await explorePage.setStartDate(YEAR_START);
    await explorePage.setEndDate(YEAR_END);

    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    const params = await explorePage.getUrlParams();
    expect(params.has("datasets")).toBe(true);
    expect(params.get("startDate")).toBe(YEAR_START);
    expect(params.get("endDate")).toBe(YEAR_END);
  });

  test("should update results when changing dataset selection", async () => {
    // Start with one dataset
    await explorePage.toggleDataset("Air Quality Measurements");
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    const initialParams = await explorePage.getUrlParams();
    const initialIds = initialParams.get("datasets")?.split(",") ?? [];
    expect(initialIds).toHaveLength(1);

    // Deselect it
    await explorePage.toggleDataset("Air Quality Measurements");
    await explorePage.waitForApiResponse();

    // Select a different dataset from a different catalog
    const changedDatasetResponsePromise = explorePage.page.waitForResponse(
      (response) => {
        if (response.request().method() !== "GET") return false;

        const url = new URL(response.url());
        const datasets = url.searchParams.get("datasets");
        return url.pathname === "/api/v1/events" && datasets != null && datasets !== initialIds[0];
      },
      { timeout: 15000 }
    );

    await explorePage.toggleDataset("GDP Growth Rates");
    const changedDatasetResponse = await changedDatasetResponsePromise;
    expect(changedDatasetResponse.status()).toBe(200);
    await explorePage.waitForEventsToLoad();

    // Counts may differ — but the assertion is the URL state changed correctly
    const params = await explorePage.getUrlParams();
    expect(params.has("datasets")).toBe(true);
    const ids = params.get("datasets")?.split(",") ?? [];
    expect(ids).toHaveLength(1);
    expect(ids).not.toEqual(initialIds);
  });

  test("should handle edge cases in date filtering", async ({ page }) => {
    // The month has to come from the data, not from the calendar: the seed spreads events
    // over the past year, so any fixed month is a coin flip on whether it contains any — and
    // an empty result would fail this test for a reason that has nothing to do with
    // filtering. Take the month of an event that actually exists.
    const unfilteredPromise = waitForEventsListResponse(page, {});
    await explorePage.toggleDataset("Air Quality Measurements");
    const unfiltered = await unfilteredPromise;

    const body = (await unfiltered.json()) as { events?: Array<{ eventTimestamp?: string | null }> };
    const sample = body.events?.find((event) => Boolean(event.eventTimestamp))?.eventTimestamp;
    expect(sample, "seed data must contain at least one timestamped event").toBeTruthy();

    const sampleDate = new Date(sample!);
    const year = sampleDate.getUTCFullYear();
    const month = sampleDate.getUTCMonth() + 1;
    const monthStart = `${year}-${pad(month)}-01`;
    const monthEnd = `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;

    // Single-month date range
    const monthResponsePromise = waitForEventsListResponse(page, { startDate: monthStart, endDate: monthEnd });

    await explorePage.setStartDate(monthStart);
    await explorePage.setEndDate(monthEnd);
    const monthResponse = await monthResponsePromise;

    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    await expectEventsWithinDateRange(monthResponse, monthStart, monthEnd);
  });

  test("should preserve filters when navigating", async () => {
    await explorePage.toggleDataset("Air Quality Measurements");
    await explorePage.setStartDate(YEAR_START);

    await explorePage.waitForApiResponse();

    const urlWithParams = explorePage.page.url();

    // Navigate away and back
    await explorePage.page.goto("/");
    await explorePage.page.goto(urlWithParams);

    await explorePage.waitForApiResponse();

    // Verify the dataset checkbox is restored to checked state
    const selected = await explorePage.getSelectedDatasets();
    expect(selected.some((name) => /Air Quality Measurements/i.test(name))).toBe(true);

    // Verify date filter is restored via URL
    await explorePage.assertUrlParam("startDate", YEAR_START);
  });
});
