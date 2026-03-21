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

import { expect, test } from "../fixtures";
import { ImportPage } from "../pages/import.page";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_PATH = path.join(__dirname, "../../fixtures");

test.describe("Import Wizard - Dataset Selection Step", () => {
  let importPage: ImportPage;

  test.beforeEach(({ page }) => {
    importPage = new ImportPage(page);
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

  test("should auto-select catalog from config suggestions when available", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Upload CSV (if a previous import exists, suggestions will auto-apply)
    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);

    // Navigate to dataset selection
    await importPage.clickNext();

    // Wait for form to be ready
    const catalogDropdown = page.locator("#catalog-select");
    const catalogNameInput = page.locator("#new-catalog-name");
    await expect(catalogDropdown.or(catalogNameInput)).toBeVisible({ timeout: 10000 });

    // Check if config suggestion was auto-applied (green banner)
    const suggestionBanner = page.locator('[data-testid="dataset-suggestion-applied"]');
    const hasSuggestion = await suggestionBanner.isVisible().catch(() => false);

    if (hasSuggestion) {
      // Suggestion was applied — catalog dropdown should show a selected catalog name
      await expect(catalogDropdown).toBeVisible();
      const displayedText = await catalogDropdown.textContent();
      expect(displayedText?.trim().length).toBeGreaterThan(0);
    } else {
      // No suggestion — either dropdown or name input should be visible
      const hasDropdown = await catalogDropdown.isVisible().catch(() => false);
      const hasInput = await catalogNameInput.isVisible().catch(() => false);
      expect(hasDropdown || hasInput).toBe(true);

      // If name input is shown, it should have a filename-derived default value
      if (hasInput) {
        const inputValue = await catalogNameInput.inputValue();
        expect(inputValue.length).toBeGreaterThan(0);
      }
    }
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
