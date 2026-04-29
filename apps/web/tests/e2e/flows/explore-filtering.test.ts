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

const expectEventsWithinDateRange = async (response: Response, startDate: string, endDate: string) => {
  expect(response.status()).toBe(200);

  const body = (await response.json()) as { events?: Array<{ eventTimestamp?: string | null }> };
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T23:59:59.999Z`).getTime();

  for (const event of body.events ?? []) {
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
    expect(ids.length).toBe(1);
  });

  test("should filter by multiple datasets", async () => {
    await explorePage.toggleDataset("Air Quality Measurements");
    await explorePage.toggleDataset("GDP Growth Rates");

    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    const params = await explorePage.getUrlParams();
    expect(params.has("datasets")).toBe(true);
    const ids = params.get("datasets")?.split(",") ?? [];
    expect(ids.length).toBe(2);
  });

  test("should filter by date range", async ({ page }) => {
    await explorePage.toggleDataset("Air Quality Measurements");

    const filteredResponsePromise = waitForEventsListResponse(page, { startDate: "2024-01-01", endDate: "2024-12-31" });

    await explorePage.setStartDate("2024-01-01");
    await explorePage.setEndDate("2024-12-31");
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

    await explorePage.assertUrlParam("startDate", "2024-01-01");
    await explorePage.assertUrlParam("endDate", "2024-12-31");
    await expectEventsWithinDateRange(filteredResponse, "2024-01-01", "2024-12-31");
  });

  test("should clear date filters", async () => {
    await explorePage.toggleDataset("Air Quality Measurements");
    await explorePage.setStartDate("2024-01-01");
    await explorePage.setEndDate("2024-12-31");

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
    await explorePage.setStartDate("2024-06-01");
    await explorePage.setEndDate("2024-06-30");

    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    const params = await explorePage.getUrlParams();
    expect(params.has("datasets")).toBe(true);
    expect(params.get("startDate")).toBe("2024-06-01");
    expect(params.get("endDate")).toBe("2024-06-30");
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
    expect(ids.length).toBe(1);
    expect(ids).not.toEqual(initialIds);
  });

  test("should handle edge cases in date filtering", async ({ page }) => {
    await explorePage.toggleDataset("Air Quality Measurements");

    // Single-month date range
    const julyResponsePromise = waitForEventsListResponse(page, { startDate: "2024-07-01", endDate: "2024-07-31" });

    await explorePage.setStartDate("2024-07-01");
    await explorePage.setEndDate("2024-07-31");
    const julyResponse = await julyResponsePromise;

    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();

    await expectEventsWithinDateRange(julyResponse, "2024-07-01", "2024-07-31");
  });

  test("should preserve filters when navigating", async () => {
    await explorePage.toggleDataset("Air Quality Measurements");
    await explorePage.setStartDate("2024-01-01");

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
    await explorePage.assertUrlParam("startDate", "2024-01-01");
  });
});
