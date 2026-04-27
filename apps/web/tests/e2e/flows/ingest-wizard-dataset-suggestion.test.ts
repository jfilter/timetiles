/**
 * E2E tests for the import wizard dataset suggestion flow.
 *
 * Verifies that Step 3 (Dataset Selection) shows the correct UI:
 * - Catalog input or dropdown is visible
 * - Config suggestion banner appears when previous imports match
 *
 * @module
 * @category E2E Tests
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { APIRequestContext, APIResponse } from "@playwright/test";

import { expect, test } from "../fixtures";
import { IngestPage } from "../pages/ingest.page";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_PATH = path.join(__dirname, "../../fixtures");

const parseCreatedDoc = async <T extends { id: number }>(response: APIResponse): Promise<T> => {
  if (response.status() !== 201) {
    throw new Error(`Expected API create to return 201, got ${response.status()}: ${await response.text()}`);
  }
  const body = await response.json();
  return (body.doc ?? body) as T;
};

const seedDatasetSuggestion = async (request: APIRequestContext): Promise<void> => {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const catalog = await parseCreatedDoc<{ id: number }>(
    await request.post("/api/catalogs", { data: { name: `Suggestion Catalog ${uniqueId}`, isPublic: true } })
  );

  await parseCreatedDoc<{ id: number }>(
    await request.post("/api/datasets", {
      data: {
        name: `Sheet1 Suggested Config ${uniqueId}`,
        catalog: catalog.id,
        language: "eng",
        isPublic: true,
        fieldMappingOverrides: {
          titlePath: "title",
          descriptionPath: "description",
          timestampPath: "date",
          locationNamePath: "location",
          endTimestampPath: "category",
        },
        idStrategy: { type: "content-hash", duplicateStrategy: "skip" },
        deduplicationConfig: { enabled: true },
      },
    })
  );
};

test.describe("Import Wizard - Dataset Selection Step", () => {
  let importPage: IngestPage;

  test.beforeEach(({ page }) => {
    importPage = new IngestPage(page);
  });

  test("should show catalog selection on Step 3 after CSV upload", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Upload CSV
    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);

    // Navigate to dataset selection (Step 3)
    await importPage.clickNext();

    // Wait for Step 3 to load — either catalog dropdown or name input should appear
    const catalogDropdown = page.locator("#catalog-select");
    const catalogNameInput = page.locator("#new-catalog-name");
    await expect(catalogDropdown.or(catalogNameInput)).toBeVisible({ timeout: 10000 });
  });

  test("should show catalog selection on Step 3 after multi-sheet Excel upload", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Upload multi-sheet Excel
    const excelPath = path.join(FIXTURES_PATH, "multi-sheet.xlsx");
    await importPage.uploadFile(excelPath);

    // Navigate to dataset selection (Step 3)
    await importPage.clickNext();

    // Wait for Step 3 to load
    const catalogDropdown = page.locator("#catalog-select");
    const catalogNameInput = page.locator("#new-catalog-name");
    await expect(catalogDropdown.or(catalogNameInput)).toBeVisible({ timeout: 10000 });

    // Should show all 3 sheets
    await expect(page.getByText("Tech Events")).toBeVisible();
    await expect(page.getByText("Art Exhibitions")).toBeVisible();
    await expect(page.getByText("Sports Events")).toBeVisible();
  });

  test("should show suggested banner (not auto-applied) when match score >= 60", async ({ page, request }) => {
    await seedDatasetSuggestion(request);
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Upload CSV — if a previous import exists with a similar schema, the
    // server returns config suggestions and the wizard surfaces a banner.
    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);

    // Navigate to dataset selection
    await importPage.clickNext();

    // Wait for form to be ready
    const catalogDropdown = page.locator("#catalog-select");
    const catalogNameInput = page.locator("#new-catalog-name");
    await expect(catalogDropdown.or(catalogNameInput)).toBeVisible({ timeout: 10000 });

    // The applied banner should NEVER be reached without an explicit click —
    // it is no longer auto-shown when the server returns a match.
    const appliedBanner = page.locator('[data-testid="dataset-suggestion-applied"]');
    await expect(appliedBanner).not.toBeVisible();

    const suggestedBanner = page.locator('[data-testid="dataset-suggestion-banner"]');
    await expect(suggestedBanner).toBeVisible({ timeout: 10000 });
    await expect(suggestedBanner.getByRole("button", { name: /use this config/i })).toBeVisible();
    await expect(suggestedBanner.getByRole("button", { name: /ignore/i })).toBeVisible();
  });

  test("Ignore dismisses banner and lets user manually create a catalog", async ({ page, request }) => {
    await seedDatasetSuggestion(request);
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);
    await importPage.clickNext();

    const suggestedBanner = page.locator('[data-testid="dataset-suggestion-banner"]');
    await expect(suggestedBanner).toBeVisible({ timeout: 10000 });

    // Click Ignore
    await suggestedBanner.getByRole("button", { name: /ignore/i }).click();

    // Banner should disappear; applied banner should NOT appear
    await expect(suggestedBanner).not.toBeVisible();
    await expect(page.locator('[data-testid="dataset-suggestion-applied"]')).not.toBeVisible();

    // Catalog form (dropdown or name input) should remain visible
    const catalogDropdown = page.locator("#catalog-select");
    const catalogNameInput = page.locator("#new-catalog-name");
    await expect(catalogDropdown.or(catalogNameInput)).toBeVisible();
  });

  test("Use this config sets catalog and sheet mappings atomically", async ({ page, request }) => {
    await seedDatasetSuggestion(request);
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);
    await importPage.clickNext();

    const suggestedBanner = page.locator('[data-testid="dataset-suggestion-banner"]');
    await expect(suggestedBanner).toBeVisible({ timeout: 10000 });

    // Click "Use this config"
    await suggestedBanner.getByRole("button", { name: /use this config/i }).click();

    // Suggested banner should be replaced by applied banner
    await expect(suggestedBanner).not.toBeVisible();
    const appliedBanner = page.locator('[data-testid="dataset-suggestion-applied"]');
    await expect(appliedBanner).toBeVisible();
    await expect(appliedBanner.getByRole("button", { name: /reset to auto-detected/i })).toBeVisible();

    // Catalog must show a selected catalog (not empty/null)
    const catalogDropdown = page.locator("#catalog-select");
    await expect(catalogDropdown).toBeVisible();
    const catalogText = await catalogDropdown.textContent();
    expect(catalogText?.trim().length).toBeGreaterThan(0);
  });

  test("should show Continue button on Step 3", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);

    // Navigate to Step 3
    await importPage.clickNext();

    // Wait for form
    const catalogDropdown = page.locator("#catalog-select");
    const catalogNameInput = page.locator("#new-catalog-name");
    await expect(catalogDropdown.or(catalogNameInput)).toBeVisible({ timeout: 10000 });

    // Continue button should be visible
    const continueButton = page.getByRole("button", { name: /continue/i });
    await expect(continueButton).toBeVisible();
  });
});
