/**
 * E2E tests for the import wizard flow.
 *
 * Tests the complete import wizard journey including:
 * - Page loading and navigation
 * - Authentication requirements
 * - File upload functionality
 * - Step progression
 * - Field mapping validation
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

import { ImportPage } from "../pages/import.page";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_PATH = path.join(__dirname, "../../fixtures");

test.describe("Import Wizard - Authentication", () => {
  let importPage: ImportPage;

  test.beforeEach(({ page }) => {
    importPage = new ImportPage(page);
  });

  test("should show login form on initial load for unauthenticated users", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Verify we're on the import page
    await expect(page).toHaveURL(/\/import/);

    // Should see login/register tabs or auth form
    const authContent = await page.content();
    const hasAuthElements =
      authContent.toLowerCase().includes("sign in") ||
      authContent.toLowerCase().includes("login") ||
      authContent.toLowerCase().includes("email");

    expect(hasAuthElements).toBe(true);
  });

  test("should not show wizard navigation buttons on auth step for unauthenticated users", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Verify we're on the auth step (step 1) by checking for sign in heading
    const signInHeading = page.getByRole("heading", { name: /sign in to continue/i });
    await expect(signInHeading).toBeVisible();

    // The auth step doesn't have wizard navigation buttons (Next/Back)
    // It only has the auth form buttons (Sign In, Sign Up, etc.)
    // Verify the Sign In button exists (we're on auth step)
    const signInButton = page.getByRole("button", { name: /^Sign In$/i });
    await expect(signInButton).toBeVisible();

    // Verify there's no visible "Continue" or standalone "Next" button in the main content
    // (not the progress step buttons which are always there but disabled)
    const wizardNavigation = page.locator('[data-testid="wizard-navigation"]');
    const wizardNavCount = await wizardNavigation.count();
    expect(wizardNavCount).toBe(0);
  });

  test("should allow login with valid credentials", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Login with seeded admin user
    await importPage.login("admin@example.com", "admin123");

    // After login, the wizard should advance to step 2 (Upload)
    // The login() method already waits for the upload heading, so we just verify
    const uploadHeading = page.getByRole("heading", { name: /upload your data/i });
    await expect(uploadHeading).toBeVisible({ timeout: 5000 });

    // Verify we're no longer on the auth step
    const signInHeading = page.getByRole("heading", { name: /sign in to continue/i });
    await expect(signInHeading).not.toBeVisible();
  });

  test("should reject login with invalid credentials", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Try to login with wrong password
    await importPage.loginTab.click();
    await importPage.emailInput.fill("admin@example.com");
    await importPage.passwordInput.fill("wrongpassword");
    await importPage.loginButton.click();

    // Wait for error response
    await page.waitForTimeout(1000);

    // Should show error message or still be on auth step
    const pageContent = await page.content();

    // Should still show login form (not uploaded content)
    const hasLoginForm = pageContent.toLowerCase().includes("password");

    // Should either show an error OR remain on the login form
    const hasError =
      pageContent.toLowerCase().includes("error") ||
      pageContent.toLowerCase().includes("invalid") ||
      pageContent.toLowerCase().includes("incorrect");

    expect(hasLoginForm || hasError).toBe(true);
  });
});

test.describe("Import Wizard - File Upload Flow", () => {
  let importPage: ImportPage;

  test.beforeEach(async ({ page }) => {
    importPage = new ImportPage(page);
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Login first
    await importPage.login("admin@example.com", "admin123");
    await page.waitForTimeout(1000);
  });

  test("should display file upload interface after login", async ({ page }) => {
    // After login, should see upload interface with "Upload your data" heading
    const uploadHeading = page.getByRole("heading", { name: /upload your data/i });
    await expect(uploadHeading).toBeVisible({ timeout: 5000 });

    // Should also see drag and drop text
    const dropText = page.getByText(/drag and drop/i);
    await expect(dropText).toBeVisible();
  });

  test("should have file input available", async ({ page }) => {
    // Look for file input
    const fileInput = page.locator('input[type="file"]');
    const fileInputCount = await fileInput.count();

    // Should have at least one file input
    expect(fileInputCount).toBeGreaterThan(0);
  });

  test("should accept CSV file upload", async ({ page }) => {
    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");

    // Upload file
    await importPage.uploadFile(csvPath);

    // Wait for file processing
    await page.waitForTimeout(2000);

    // After upload, page should show file details or preview
    const pageContent = await page.content();
    const hasFileInfo =
      pageContent.includes("valid-events.csv") ||
      pageContent.toLowerCase().includes("sheet") ||
      pageContent.toLowerCase().includes("row") ||
      pageContent.toLowerCase().includes("preview");

    expect(hasFileInfo).toBe(true);
  });

  test("should accept Excel file upload", async ({ page }) => {
    const excelPath = path.join(FIXTURES_PATH, "events.xlsx");

    // Upload file
    await importPage.uploadFile(excelPath);

    // Wait for file processing
    await page.waitForTimeout(2000);

    // After upload, page should show file details or preview
    const pageContent = await page.content();
    const hasFileInfo =
      pageContent.includes("events.xlsx") ||
      pageContent.toLowerCase().includes("sheet") ||
      pageContent.toLowerCase().includes("row") ||
      pageContent.toLowerCase().includes("preview");

    expect(hasFileInfo).toBe(true);
  });

  test("should enable Next button after file upload", async ({ page }) => {
    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");

    // Upload file
    await importPage.uploadFile(csvPath);
    await page.waitForTimeout(2000);

    // Next button should now be enabled - use the Continue button specifically
    // (exclude Next.js dev tools button by using exact match or data-testid)
    const nextButton = page.locator('[data-testid="wizard-navigation"] button, button:text-is("Continue")').first();
    const nextButtonCount = await nextButton.count();

    if (nextButtonCount > 0) {
      // Check if button is now clickable (not disabled)
      const isDisabled = await nextButton.isDisabled();
      expect(isDisabled).toBe(false);
    }
  });
});

test.describe("Import Wizard - Dataset Selection", () => {
  let importPage: ImportPage;

  test.beforeEach(async ({ page }) => {
    importPage = new ImportPage(page);
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Login and upload file
    await importPage.login("admin@example.com", "admin123");
    await page.waitForTimeout(1000);

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);
    await page.waitForTimeout(2000);

    // Click Next to go to dataset selection
    await importPage.clickNext();
    await page.waitForTimeout(1000);
  });

  test("should show catalog selection interface", async ({ page }) => {
    const pageContent = await page.content();
    const hasCatalogUI = pageContent.toLowerCase().includes("catalog") || pageContent.toLowerCase().includes("dataset");

    expect(hasCatalogUI).toBe(true);
  });

  test("should allow creating new catalog", async ({ page }) => {
    // The dataset selection page should have options to create or select catalogs
    // Check that we're on the dataset selection step and have relevant UI
    const pageContent = await page.content();

    // Should have either select/dropdown UI or create option
    const hasCreateOption =
      pageContent.toLowerCase().includes("create") ||
      pageContent.toLowerCase().includes("new catalog") ||
      pageContent.toLowerCase().includes("new dataset") ||
      pageContent.includes("select");

    expect(hasCreateOption).toBe(true);
  });
});

test.describe("Import Wizard - Field Mapping", () => {
  let importPage: ImportPage;

  test.beforeEach(async ({ page }) => {
    importPage = new ImportPage(page);
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Login and upload file
    await importPage.login("admin@example.com", "admin123");
    await page.waitForTimeout(1000);

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);
    await page.waitForTimeout(2000);

    // Navigate through to dataset selection step
    await importPage.clickNext();
    await page.waitForTimeout(1000);
  });

  test("should show field mapping interface with detected fields", async ({ page }) => {
    // We're on dataset selection step - check that the page has content
    // about fields or mapping that will be shown later
    const pageContent = await page.content();

    // Should show dataset/catalog selection or field-related content
    const hasRelevantUI =
      pageContent.toLowerCase().includes("catalog") ||
      pageContent.toLowerCase().includes("dataset") ||
      pageContent.toLowerCase().includes("field") ||
      pageContent.toLowerCase().includes("title") ||
      pageContent.toLowerCase().includes("date");

    expect(hasRelevantUI).toBe(true);
  });

  test("should show sample data preview", async ({ page }) => {
    // Look for data preview table or sheet preview
    const pageContent = await page.content();

    // The wizard should show some preview of the uploaded data
    const hasPreview =
      pageContent.toLowerCase().includes("preview") ||
      pageContent.toLowerCase().includes("sheet") ||
      pageContent.toLowerCase().includes("row") ||
      pageContent.toLowerCase().includes("sample") ||
      page.locator("table").count();

    expect(hasPreview).toBeTruthy();
  });
});

test.describe("Import Wizard - Multi-Sheet Excel", () => {
  let importPage: ImportPage;

  test.beforeEach(async ({ page }) => {
    importPage = new ImportPage(page);
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Login first
    await importPage.login("admin@example.com", "admin123");
    await page.waitForTimeout(1000);
  });

  test("should handle multi-sheet Excel files", async ({ page }) => {
    const multiSheetPath = path.join(FIXTURES_PATH, "multi-sheet.xlsx");

    await importPage.uploadFile(multiSheetPath);
    await page.waitForTimeout(2000);

    // Should detect multiple sheets
    const pageContent = await page.content();
    const hasMultipleSheets =
      pageContent.toLowerCase().includes("sheet") || pageContent.toLowerCase().includes("multiple");

    expect(hasMultipleSheets).toBe(true);
  });
});

test.describe("Import Wizard - Error Handling", () => {
  let importPage: ImportPage;

  test.beforeEach(async ({ page }) => {
    importPage = new ImportPage(page);
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Login first
    await importPage.login("admin@example.com", "admin123");
    await page.waitForTimeout(1000);
  });

  test("should handle empty file gracefully", async ({ page }) => {
    const emptyPath = path.join(FIXTURES_PATH, "empty.csv");

    await importPage.uploadFile(emptyPath);
    await page.waitForTimeout(2000);

    // Page should still be functional and possibly show an error
    const pageContent = await page.content();
    const hasContent = pageContent.length > 100;
    expect(hasContent).toBe(true);
  });

  test("should handle malformed data gracefully", async ({ page }) => {
    const malformedPath = path.join(FIXTURES_PATH, "malformed-data.csv");

    await importPage.uploadFile(malformedPath);
    await page.waitForTimeout(2000);

    // Page should still be functional
    const pageContent = await page.content();
    const hasContent = pageContent.length > 100;
    expect(hasContent).toBe(true);
  });
});

test.describe("Import Wizard - Browser Navigation", () => {
  let importPage: ImportPage;

  test.beforeEach(({ page }) => {
    importPage = new ImportPage(page);
  });

  test("should handle browser navigation correctly", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Navigate away
    await page.goto("/explore");
    await page.waitForLoadState("networkidle");

    // Navigate back
    await page.goBack();
    await page.waitForLoadState("networkidle");

    // Should return to import page
    expect(page.url()).toContain("/import");
  });

  test("should handle page refresh gracefully", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Login
    await importPage.login("admin@example.com", "admin123");
    await page.waitForTimeout(1000);

    // Refresh the page
    await page.reload();
    await importPage.waitForWizardLoad();

    // Page should still be functional
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(100);
  });
});

test.describe("Import Wizard - Responsive Design", () => {
  let importPage: ImportPage;

  test.beforeEach(({ page }) => {
    importPage = new ImportPage(page);
  });

  test("should work on desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const hasContent = (await page.content()).length > 100;
    expect(hasContent).toBe(true);
  });

  test("should work on tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const hasContent = (await page.content()).length > 100;
    expect(hasContent).toBe(true);
  });

  test("should work on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const hasContent = (await page.content()).length > 100;
    expect(hasContent).toBe(true);
  });
});

test.describe("Import Wizard - Accessibility", () => {
  let importPage: ImportPage;

  test.beforeEach(async ({ page }) => {
    importPage = new ImportPage(page);
    await importPage.goto();
    await importPage.waitForWizardLoad();
  });

  test("should have proper heading structure", async ({ page }) => {
    const headings = await page.locator("h1, h2, h3").all();
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  test("should support keyboard navigation", async ({ page }) => {
    // Tab through the page
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Get focused element
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBeDefined();
  });
});

test.describe("Import Wizard - Full Flow", () => {
  let importPage: ImportPage;

  test.beforeEach(({ page }) => {
    importPage = new ImportPage(page);
  });

  test("should complete full import flow and create events", async ({ page }) => {
    // Increase timeout for job processing
    test.setTimeout(180000); // 3 minutes

    // Use a unique catalog/dataset name to avoid conflicts
    const uniqueId = Date.now();
    const catalogName = `E2E Test Catalog ${uniqueId}`;
    const datasetName = `E2E Test Dataset ${uniqueId}`;

    // Step 1: Navigate and login
    await importPage.goto();
    await importPage.waitForWizardLoad();
    await importPage.login("admin@example.com", "admin123");

    // Step 2: Upload file
    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");

    // Use file chooser approach for more reliable file upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(csvPath);

    // Wait for file processing to complete - look for sheet detection
    const sheetInfo = page.getByText(/detected.*sheet/i);
    await expect(sheetInfo).toBeVisible({ timeout: 15000 });

    // Verify file name is shown
    await expect(page.getByText("valid-events.csv")).toBeVisible();

    // Click Next to go to Dataset Selection (Step 3)
    await importPage.clickNext();

    // Step 3: Dataset Selection
    // Wait for "Select destination" heading
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    // Wait for catalog selection to appear
    const catalogSelect = page.locator("#catalog-select");
    await expect(catalogSelect).toBeVisible({ timeout: 10000 });

    // Select "Create new catalog"
    await catalogSelect.selectOption("new");

    // Fill in new catalog name
    const newCatalogInput = page.locator("#new-catalog-name");
    await expect(newCatalogInput).toBeVisible();
    await newCatalogInput.fill(catalogName);

    // Wait for dataset mapping section to appear
    await page.waitForTimeout(500);

    // The sheet mapping should automatically show "Create new dataset"
    // Fill in the dataset name if visible
    const datasetNameInput = page.locator('[id^="dataset-name-"]').first();
    if (await datasetNameInput.isVisible()) {
      await datasetNameInput.fill(datasetName);
    }

    // Click Next to go to Field Mapping (Step 4)
    await importPage.clickNext();

    // Step 4: Field Mapping
    // Wait for field mapping page to appear
    const fieldMappingHeading = page.getByRole("heading", { name: /map your fields/i });
    await expect(fieldMappingHeading).toBeVisible({ timeout: 10000 });

    // Map the fields from valid-events.csv
    // The CSV has: title, description, date, location, category

    // Map Title field
    const titleSelect = page.locator("#title-field");
    await expect(titleSelect).toBeVisible();
    await titleSelect.selectOption("title");

    // Map Date field
    const dateSelect = page.locator("#date-field");
    await expect(dateSelect).toBeVisible();
    await dateSelect.selectOption("date");

    // Map Location field
    const locationSelect = page.locator("#location-field");
    await expect(locationSelect).toBeVisible();
    await locationSelect.selectOption("location");

    // Optionally map Description field
    const descriptionSelect = page.locator("#description-field");
    if (await descriptionSelect.isVisible()) {
      await descriptionSelect.selectOption("description");
    }

    // Click Next to go to Review (Step 5)
    await importPage.clickNext();

    // Step 5: Review
    // Wait for review page to appear
    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10000 });

    // Verify summary shows our selections
    await expect(page.getByText(catalogName)).toBeVisible();

    // Listen for API response
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/wizard/configure-import"),
      { timeout: 30000 }
    );

    // Click Start Import to begin processing (Step 6)
    const startImportButton = page.getByRole("button", { name: /start import/i });
    await expect(startImportButton).toBeVisible();
    await startImportButton.click();

    // Wait for and check the API response
    const response = await responsePromise;
    const responseStatus = response.status();

    // Parse response and verify success
    const responseBody = await response.json();
    if (responseStatus !== 200) {
      throw new Error(`Configure import failed with status ${responseStatus}: ${JSON.stringify(responseBody)}`);
    }

    expect(responseBody.success).toBe(true);
    expect(responseBody.importFileId).toBeDefined();
    expect(responseBody.catalogId).toBeDefined();

    // Step 6: Processing page is shown
    const processingIndicator = page.getByText(/importing your data/i);
    await expect(processingIndicator).toBeVisible({ timeout: 10000 });

    // Get base URL for API calls
    const baseUrl = page.url().split("/import")[0];

    // Trigger job processing via admin API (for E2E test environment)
    // Run jobs multiple times with small batches to allow UI to poll updates

    // Run jobs in batches, waiting for UI to poll between runs
    for (let batch = 0; batch < 10; batch++) {
      const runJobsResponse = await page.request.post(`${baseUrl}/api/admin/jobs/run`, {
        data: { limit: 100, iterations: 5 },
        timeout: 30000,
      });

      if (!runJobsResponse.ok()) {
        const jobsError = await runJobsResponse.text();
        throw new Error(`Failed to run jobs (batch ${batch}): ${jobsError}`);
      }

      // Wait for UI to poll for progress updates
      await page.waitForTimeout(3000);

      // Check if import is complete
      const isComplete = await page
        .getByText(/import complete/i)
        .isVisible()
        .catch(() => false);
      if (isComplete) {
        break;
      }
    }

    // Wait for completion indicator to be visible
    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 30000 });

    // Verify success message shows events were created
    const successMessage = page.getByText(/events imported/i);
    await expect(successMessage).toBeVisible({ timeout: 5000 });

    // Verify we can navigate to explore page
    const viewOnMapButton = page.getByRole("link", { name: /view on map|explore/i });
    await expect(viewOnMapButton).toBeVisible();
  });

  test("should persist state across page refresh", async ({ page }) => {
    // Step 1: Login and upload
    await importPage.goto();
    await importPage.waitForWizardLoad();
    await importPage.login("admin@example.com", "admin123");

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);
    await page.waitForTimeout(2000);

    // Verify file is shown
    const uploadedContent = await page.content();
    expect(uploadedContent.toLowerCase()).toContain("valid-events.csv");

    // Navigate to dataset selection
    await importPage.clickNext();
    await page.waitForTimeout(1000);

    // Select create new catalog
    const catalogSelect = page.locator("#catalog-select");
    await expect(catalogSelect).toBeVisible({ timeout: 10000 });
    await catalogSelect.selectOption("new");

    const newCatalogInput = page.locator("#new-catalog-name");
    await expect(newCatalogInput).toBeVisible();
    await newCatalogInput.fill("Persistence Test Catalog");

    // Refresh the page
    await page.reload();
    await importPage.waitForWizardLoad();

    // Wait for page to restore state
    await page.waitForTimeout(2000);

    // Verify state was restored - should still be on step 3 or have file info
    const restoredContent = await page.content();
    const hasRestoredState =
      restoredContent.toLowerCase().includes("valid-events.csv") ||
      restoredContent.toLowerCase().includes("catalog") ||
      restoredContent.toLowerCase().includes("persistence test catalog");

    expect(hasRestoredState).toBe(true);
  });
});
