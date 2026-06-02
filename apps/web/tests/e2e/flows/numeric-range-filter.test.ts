/**
 * E2E test for numeric range filtering on event data fields.
 *
 * Verifies the per-column numeric range filter renders for a dataset with a
 * detected numeric field, and that an applied range flows end-to-end through the
 * query path in a real browser (URL `rf` param → API → SQL normalization →
 * filtered results). Uses the environmental "Air Quality Measurements" dataset,
 * whose events carry a numeric `value` field (0–100); the seed marks it as
 * `fieldTypes.number` with a number-kind interpretation-plan column.
 *
 * @module
 * @category E2E Tests
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { ExplorePage } from "../pages/explore.page";

const DATASET = "Air Quality Measurements";

/** Fetch the /api/v1/events list for a dataset (optionally range-filtered) and return its events. */
const fetchListEvents = async (page: Page, datasets: string, rf?: string): Promise<unknown[]> => {
  const responsePromise = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      if (url.pathname !== "/api/v1/events") return false;
      if (url.searchParams.get("datasets") !== datasets) return false;
      return rf == null ? url.searchParams.get("rf") == null : url.searchParams.get("rf") != null;
    },
    { timeout: 20000 }
  );
  const target = rf == null ? `/explore/list?datasets=${datasets}` : `/explore/list?datasets=${datasets}&rf=${rf}`;
  await page.goto(target, { waitUntil: "domcontentloaded" });
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { events?: unknown[] };
  return body.events ?? [];
};

test.describe("Explore Page - Numeric Range Filter", () => {
  let explorePage: ExplorePage;

  test.beforeEach(async ({ page }) => {
    explorePage = new ExplorePage(page);
    await explorePage.goto({ globalView: true });
    await explorePage.waitForMapLoad();
  });

  test("renders the numeric range filter and applies it end-to-end", async ({ page }) => {
    // Selecting a single dataset loads its numeric fields (the numeric-stats
    // endpoint) and reveals the per-column range filter UI.
    const numericStatsResponse = page.waitForResponse(
      (response) => response.url().includes("/numeric-stats") && response.status() === 200,
      { timeout: 20000 }
    );
    await explorePage.toggleDataset(DATASET);
    await numericStatsResponse;

    // The "Numeric Ranges" filter section renders (seed → numeric-stats → UI).
    await expect(page.getByText(/Numeric Ranges/i).first()).toBeVisible({ timeout: 10000 });

    const datasets = (await explorePage.getUrlParams()).get("datasets");
    expect(datasets).toBeTruthy();

    // Baseline: the dataset has events.
    const baselineEvents = await fetchListEvents(page, datasets!);
    expect(baselineEvents.length).toBeGreaterThan(0);

    // A range above the domain maximum (value ∈ [0,100]) deterministically
    // excludes every event — proving the rf param flows through to the SQL range
    // filter (and that the cast is applied, not ignored).
    const rf = encodeURIComponent(JSON.stringify({ value: { min: 101, max: null } }));
    const filteredEvents = await fetchListEvents(page, datasets!, rf);
    expect(filteredEvents).toHaveLength(0);
  });
});
