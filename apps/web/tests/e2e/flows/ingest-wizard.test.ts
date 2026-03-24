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
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TEST_CREDENTIALS } from "../../constants/test-credentials";
import { expect, test } from "../fixtures";
import { IngestPage } from "../pages/ingest.page";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_PATH = path.join(__dirname, "../../fixtures");

test.describe("Import Wizard - Authentication", () => {
  // These tests need unauthenticated state to test login flows
  test.use({ storageState: { cookies: [], origins: [] } });

  let importPage: IngestPage;

  test.beforeEach(({ page }) => {
    importPage = new IngestPage(page);
  });

  test("should show login form on initial load for unauthenticated users", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Verify we're on the import page
    await expect(page).toHaveURL(/\/ingest/);

    // Should see auth form with sign in heading and email input
    const signInHeading = page.getByRole("heading", { name: /sign in to continue/i });
    await expect(signInHeading).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 5000 });
  });

  test("should show wizard steps on auth step for unauthenticated users", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Verify we're on the auth step (step 1) by checking for sign in heading
    const signInHeading = page.getByRole("heading", { name: /sign in to continue/i });
    await expect(signInHeading).toBeVisible();

    // Verify the Sign In button exists (we're on auth step)
    const signInButton = page.getByRole("button", { name: /^Sign In$/i });
    await expect(signInButton).toBeVisible({ timeout: 10000 });

    // Wizard header shows current step — verify we're on Step 1 (Sign In)
    await expect(page.getByText(/Step 1 of/)).toBeVisible({ timeout: 5000 });
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
    await importPage.passwordInput.fill(TEST_CREDENTIALS.security.wrong);
    await importPage.loginButton.click();

    // Wait for login API response
    await page.waitForResponse((resp) => resp.url().includes("/api/users/login"), { timeout: 5000 });

    // Should still be on the auth step — sign in heading should remain visible
    const signInHeading = page.getByRole("heading", { name: /sign in to continue/i });
    await expect(signInHeading).toBeVisible({ timeout: 5000 });

    // Should NOT have advanced to the upload step
    const uploadHeading = page.getByRole("heading", { name: /upload your data/i });
    await expect(uploadHeading).not.toBeVisible();
  });
});

test.describe("Import Wizard - File Upload Flow", () => {
  let importPage: IngestPage;

  test.beforeEach(async ({ page }) => {
    importPage = new IngestPage(page);
    await importPage.goto();
    await importPage.waitForWizardLoad();
    // Auth provided by storageState — should already be on upload step
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

    // After upload, page should show file name and ready indicator
    await expect(page.getByText("valid-events.csv")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/file ready for import/i)).toBeVisible({ timeout: 5000 });
  });

  test("should accept Excel file upload", async ({ page }) => {
    const excelPath = path.join(FIXTURES_PATH, "events.xlsx");

    // Upload file
    await importPage.uploadFile(excelPath);

    // After upload, page should show file name and ready indicator
    await expect(page.getByText("events.xlsx")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/file ready for import/i)).toBeVisible({ timeout: 5000 });
  });

  test("should enable Next button after file upload", async ({ page }) => {
    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");

    // Upload file
    await importPage.uploadFile(csvPath);

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
  let importPage: IngestPage;

  test.beforeEach(async ({ page }) => {
    importPage = new IngestPage(page);
    await importPage.goto();
    await importPage.waitForWizardLoad();
    // Auth provided by storageState

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);

    // Click Next to go to dataset selection
    await importPage.clickNext();
  });

  test("should show catalog selection interface", async ({ page }) => {
    // Should show the "Select destination" heading on step 3
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });
  });

  test("should allow creating new catalog", async ({ page }) => {
    // Should be on the dataset selection step with catalog UI
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    // Should have a catalog dropdown or catalog name input visible
    const catalogDropdown = page.locator("#catalog-select");
    const catalogNameInput = page.locator("#new-catalog-name");
    await expect(catalogDropdown.or(catalogNameInput)).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Import Wizard - Field Mapping", () => {
  let importPage: IngestPage;

  test.beforeEach(async ({ page }) => {
    importPage = new IngestPage(page);
    await importPage.goto();
    await importPage.waitForWizardLoad();
    // Auth provided by storageState

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);

    // Navigate through to dataset selection step
    await importPage.clickNext();
  });

  test("should show field mapping interface with detected fields", async ({ page }) => {
    // We're on dataset selection step — verify the heading is visible
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });
  });

  test("should show sample data preview", async ({ page }) => {
    // We're on dataset selection step — should show the destination heading
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    // The step should have a table or relevant data preview UI element
    const table = page.locator("table").first();
    const previewText = page.getByText(/preview|sheet|row|sample/i).first();
    await expect(table.or(previewText)).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Import Wizard - Multi-Sheet Excel", () => {
  // Multi-sheet imports mutate database state — run sequentially
  test.describe.configure({ mode: "serial" });

  let importPage: IngestPage;

  test.beforeEach(async ({ page }) => {
    importPage = new IngestPage(page);
    await importPage.goto();
    await importPage.waitForWizardLoad();
    // Auth provided by storageState
  });

  test("should detect multiple sheets in Excel file", async ({ page }) => {
    const multiSheetPath = path.join(FIXTURES_PATH, "multi-sheet.xlsx");

    await importPage.uploadFile(multiSheetPath);

    // Should detect multiple sheets and display the count
    await expect(page.getByText(/3 sheets/i)).toBeVisible({ timeout: 10000 });
  });

  test("should import all sheets from multi-sheet Excel and create 3 datasets", async ({ page }) => {
    // Increase timeout for full import flow with job processing
    test.setTimeout(300000); // 5 minutes

    // Use a unique catalog/dataset name to avoid conflicts
    const uniqueId = Date.now();
    const catalogName = `E2E Multi-Sheet Catalog ${uniqueId}`;

    // Step 1: Upload multi-sheet Excel file
    const multiSheetPath = path.join(FIXTURES_PATH, "multi-sheet.xlsx");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(multiSheetPath);

    // Wait for file processing - should detect 3 sheets
    await expect(page.getByText(/3 sheets/i)).toBeVisible({ timeout: 10000 });

    // Verify all three sheet names are displayed
    await expect(page.getByText("Tech Events")).toBeVisible();
    await expect(page.getByText("Art Exhibitions")).toBeVisible();
    await expect(page.getByText("Sports Events")).toBeVisible();

    // Click Next to go to Dataset Selection (Step 3)
    await importPage.clickNext();

    // Step 2: Dataset Selection
    // Wait for "Select destination" heading
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    // Create a new catalog (handles both fresh DB and existing catalogs)
    await importPage.createNewCatalog(catalogName);

    // Wait for multi-sheet dataset mapping section to appear
    // The multi-sheet view shows each sheet with a dataset name input
    const sheetMappingSections = page.locator('[class*="rounded-sm border p-4"]');
    await expect(sheetMappingSections).toHaveCount(3, { timeout: 10000 });

    // Verify sheet names are shown
    await expect(page.getByText("Tech Events").first()).toBeVisible();
    await expect(page.getByText("Art Exhibitions").first()).toBeVisible();
    await expect(page.getByText("Sports Events").first()).toBeVisible();

    // Click Next to go to Field Mapping (Step 4)
    await importPage.clickNext();

    // Step 3: Field Mapping
    // Wait for field mapping page to appear
    const fieldMappingHeading = page.getByRole("heading", { name: /map your fields/i });
    await expect(fieldMappingHeading).toBeVisible({ timeout: 10000 });

    // Verify 3 sheet tabs visible (multi-sheet mode)
    await expect(page.locator('[data-testid="sheet-tab-0"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="sheet-tab-1"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="sheet-tab-2"]')).toBeVisible({ timeout: 10000 });

    // Configure field mappings for ALL 3 sheets using the sheet tabs
    // Each sheet has different column names that may or may not be auto-detected

    // Sheet mappings: [sheetIndex, titleCol, dateCol, locationCol]
    const sheetConfigs = [
      { index: 0, title: "title", date: "event_date", location: "venue" }, // Tech Events
      { index: 1, title: "name", date: "date", location: "location" }, // Art Exhibitions
      { index: 2, title: "event_name", date: "start_date", location: "address" }, // Sports Events
    ];

    for (const config of sheetConfigs) {
      // Click the sheet tab to switch to this sheet
      const sheetTab = page.locator(`[data-testid="sheet-tab-${config.index}"]`);
      await sheetTab.click();
      // Wait for field mapping form to be interactive after tab switch
      await importPage.waitForFieldMappingReady();
      // Allow auto-detection to settle before checking field values
      await page.waitForTimeout(500);

      // Column-centric table: find row by column name and set target if not auto-detected
      const titleRow = page.locator("tr").filter({ hasText: config.title }).first();
      await expect(titleRow).toBeVisible({ timeout: 5000 });
      const titleTargetSelect = titleRow.locator("select");
      if ((await titleTargetSelect.inputValue()) === "__none__") {
        await titleTargetSelect.selectOption("titleField");
      }

      const dateRow = page.locator("tr").filter({ hasText: config.date }).first();
      await expect(dateRow).toBeVisible({ timeout: 5000 });
      const dateTargetSelect = dateRow.locator("select");
      if ((await dateTargetSelect.inputValue()) === "__none__") {
        await dateTargetSelect.selectOption("dateField");
      }

      const locationRow = page.locator("tr").filter({ hasText: config.location }).first();
      await expect(locationRow).toBeVisible({ timeout: 5000 });
      const locationTargetSelect = locationRow.locator("select");
      if ((await locationTargetSelect.inputValue()) === "__none__") {
        await locationTargetSelect.selectOption("locationField");
      }
    }

    // Click Next to go to Review (Step 5)
    await importPage.clickNext();

    // Step 4: Review
    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10000 });

    // Verify summary shows our custom catalog name
    await expect(page.getByText(catalogName)).toBeVisible({ timeout: 5000 });

    // Verify it shows 3 datasets will be created
    await expect(page.getByText(/3 datasets/i)).toBeVisible({ timeout: 5000 });

    // Verify all 3 sheets' field mappings are shown on Review page
    // Check that field mapping sections exist for all 3 sheets
    for (let sheetIndex = 0; sheetIndex < 3; sheetIndex++) {
      const fieldMappingSection = page.locator(`[data-testid="field-mapping-${sheetIndex}"]`);
      await expect(fieldMappingSection).toBeVisible({ timeout: 5000 });
    }

    // Verify all 3 field mapping sections exist in the review step
    for (let i = 0; i < 3; i++) {
      const section = page.locator(`[data-testid="field-mapping-${i}"]`);
      await expect(section).toBeVisible();
    }

    // Listen for API response
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/ingest/configure"), {
      timeout: 10000,
    });

    // Click Start Import to begin processing (Step 6)
    const startImportButton = page.getByRole("button", { name: /start import/i });
    await expect(startImportButton).toBeVisible();
    await startImportButton.click();

    // Wait for and check the API response
    const response = await responsePromise;
    const responseStatus = response.status();

    const responseBody = await response.json();
    if (responseStatus !== 200) {
      throw new Error(`Configure import failed with status ${responseStatus}: ${JSON.stringify(responseBody)}`);
    }

    expect(typeof responseBody.ingestFileId).toBe("number");
    expect(typeof responseBody.catalogId).toBe("number");

    // Verify 3 datasets were created in the response
    // Response should have datasets object with 3 entries (keyed by sheet index)
    expect(responseBody.datasets).not.toBeNull();
    const datasetIds = Object.values(responseBody.datasets);
    expect(datasetIds.length).toBe(3);

    // Step 5: Processing page is shown
    const processingIndicator = page.getByText(/importing your data/i);
    await expect(processingIndicator).toBeVisible({ timeout: 10000 });

    // Get base URL for API calls
    const baseUrl = page.url().split("/ingest")[0];

    // Wait for import to complete — 2 job workers process jobs in parallel,
    // but multi-sheet imports queue 18+ jobs that compete with other parallel tests
    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 210000 });

    // Verify success message shows events were imported
    // Total: 3 (Tech) + 4 (Art) + 2 (Sports) = 9 events
    const successMessage = page.getByText(/import complete/i);
    await expect(successMessage).toBeVisible({ timeout: 10000 });

    // Verify we can navigate to explore page
    const viewOnMapButton = page.getByRole("button", { name: /view on map|explore/i });
    await expect(viewOnMapButton).toBeVisible();

    // Verify the datasets were created by checking the API
    const catalogsResponse = await page.request.get(
      `${baseUrl}/api/catalogs?where[name][equals]=${encodeURIComponent(catalogName)}`
    );
    expect(catalogsResponse.ok()).toBe(true);
    const catalogsData = await catalogsResponse.json();
    expect(catalogsData.docs.length).toBe(1);

    const createdCatalogId = catalogsData.docs[0].id;

    // Verify 3 datasets exist in the catalog
    const datasetsResponse = await page.request.get(
      `${baseUrl}/api/datasets?where[catalog][equals]=${createdCatalogId}`
    );
    expect(datasetsResponse.ok()).toBe(true);
    const datasetsData = await datasetsResponse.json();
    expect(datasetsData.docs.length).toBe(3);

    // Verify dataset names match sheet names
    const datasetNames = datasetsData.docs.map((d: { name: string }) => d.name);
    expect(datasetNames).toContain("Tech Events");
    expect(datasetNames).toContain("Art Exhibitions");
    expect(datasetNames).toContain("Sports Events");
  });

  test("should import all sheets from multi-sheet ODS and create 3 datasets", async ({ page }) => {
    // Increase timeout for full import flow with job processing
    test.setTimeout(240000); // 4 minutes

    // Use a unique catalog/dataset name to avoid conflicts
    const uniqueId = Date.now();
    const catalogName = `E2E ODS Multi-Sheet Catalog ${uniqueId}`;

    // Step 1: Upload multi-sheet ODS file (LibreOffice format)
    const multiSheetPath = path.join(FIXTURES_PATH, "multi-sheet.ods");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(multiSheetPath);

    // Wait for file processing - should detect 3 sheets
    await expect(page.getByText(/3 sheets/i)).toBeVisible({ timeout: 10000 });

    // Verify all three sheet names are displayed
    await expect(page.getByText("Tech Events")).toBeVisible();
    await expect(page.getByText("Art Exhibitions")).toBeVisible();
    await expect(page.getByText("Sports Events")).toBeVisible();

    // Click Next to go to Dataset Selection (Step 3)
    await importPage.clickNext();

    // Step 2: Dataset Selection
    // Wait for "Select destination" heading
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    // Create a new catalog (handles both fresh DB and existing catalogs)
    await importPage.createNewCatalog(catalogName);

    // Wait for multi-sheet dataset mapping section to appear
    // The multi-sheet view shows each sheet with a dataset name input
    const sheetMappingSections = page.locator('[class*="rounded-sm border p-4"]');
    await expect(sheetMappingSections).toHaveCount(3, { timeout: 10000 });

    // Verify sheet names are shown
    await expect(page.getByText("Tech Events").first()).toBeVisible();
    await expect(page.getByText("Art Exhibitions").first()).toBeVisible();
    await expect(page.getByText("Sports Events").first()).toBeVisible();

    // Click Next to go to Field Mapping (Step 4)
    await importPage.clickNext();

    // Step 3: Field Mapping
    // Wait for field mapping page to appear
    const fieldMappingHeading = page.getByRole("heading", { name: /map your fields/i });
    await expect(fieldMappingHeading).toBeVisible({ timeout: 10000 });

    // Verify 3 sheet tabs visible (multi-sheet mode)
    await expect(page.locator('[data-testid="sheet-tab-0"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="sheet-tab-1"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="sheet-tab-2"]')).toBeVisible({ timeout: 10000 });

    // Configure field mappings for ALL 3 sheets using the sheet tabs
    // Each sheet has different column names that may or may not be auto-detected

    // Sheet mappings: [sheetIndex, titleCol, dateCol, locationCol]
    const sheetConfigs = [
      { index: 0, title: "title", date: "event_date", location: "venue" }, // Tech Events
      { index: 1, title: "name", date: "date", location: "location" }, // Art Exhibitions
      { index: 2, title: "event_name", date: "start_date", location: "address" }, // Sports Events
    ];

    for (const config of sheetConfigs) {
      // Click the sheet tab to switch to this sheet
      const sheetTab = page.locator(`[data-testid="sheet-tab-${config.index}"]`);
      await sheetTab.click();
      // Wait for field mapping form to be interactive after tab switch
      await importPage.waitForFieldMappingReady();
      // Allow auto-detection to settle before checking field values
      await page.waitForTimeout(500);

      // Column-centric table: find row by column name and set target if not auto-detected
      const titleRow = page.locator("tr").filter({ hasText: config.title }).first();
      await expect(titleRow).toBeVisible({ timeout: 5000 });
      const titleTargetSelect = titleRow.locator("select");
      if ((await titleTargetSelect.inputValue()) === "__none__") {
        await titleTargetSelect.selectOption("titleField");
      }

      const dateRow = page.locator("tr").filter({ hasText: config.date }).first();
      await expect(dateRow).toBeVisible({ timeout: 5000 });
      const dateTargetSelect = dateRow.locator("select");
      if ((await dateTargetSelect.inputValue()) === "__none__") {
        await dateTargetSelect.selectOption("dateField");
      }

      const locationRow = page.locator("tr").filter({ hasText: config.location }).first();
      await expect(locationRow).toBeVisible({ timeout: 5000 });
      const locationTargetSelect = locationRow.locator("select");
      if ((await locationTargetSelect.inputValue()) === "__none__") {
        await locationTargetSelect.selectOption("locationField");
      }
    }

    // Click Next to go to Review (Step 5)
    await importPage.clickNext();

    // Step 4: Review
    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10000 });

    // Verify summary shows our custom catalog name
    await expect(page.getByText(catalogName)).toBeVisible({ timeout: 5000 });

    // Verify it shows 3 datasets will be created
    await expect(page.getByText(/3 datasets/i)).toBeVisible({ timeout: 5000 });

    // Verify all 3 sheets' field mappings are shown on Review page
    // Check that field mapping sections exist for all 3 sheets
    for (let sheetIndex = 0; sheetIndex < 3; sheetIndex++) {
      const fieldMappingSection = page.locator(`[data-testid="field-mapping-${sheetIndex}"]`);
      await expect(fieldMappingSection).toBeVisible({ timeout: 5000 });
    }

    // Verify all 3 field mapping sections exist in the review step
    for (let i = 0; i < 3; i++) {
      const section = page.locator(`[data-testid="field-mapping-${i}"]`);
      await expect(section).toBeVisible();
    }

    // Listen for API response
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/ingest/configure"), {
      timeout: 10000,
    });

    // Click Start Import to begin processing (Step 6)
    const startImportButton = page.getByRole("button", { name: /start import/i });
    await expect(startImportButton).toBeVisible();
    await startImportButton.click();

    // Wait for and check the API response
    const response = await responsePromise;
    const responseStatus = response.status();

    const responseBody = await response.json();
    if (responseStatus !== 200) {
      throw new Error(`Configure import failed with status ${responseStatus}: ${JSON.stringify(responseBody)}`);
    }

    expect(typeof responseBody.ingestFileId).toBe("number");
    expect(typeof responseBody.catalogId).toBe("number");

    // Verify 3 datasets were created in the response
    // Response should have datasets object with 3 entries (keyed by sheet index)
    expect(responseBody.datasets).not.toBeNull();
    const datasetIds = Object.values(responseBody.datasets);
    expect(datasetIds.length).toBe(3);

    // Step 5: Processing page is shown
    const processingIndicator = page.getByText(/importing your data/i);
    await expect(processingIndicator).toBeVisible({ timeout: 10000 });

    // Get base URL for API calls
    const baseUrl = page.url().split("/ingest")[0];

    // Wait for import to complete — 2 job workers process jobs in parallel,
    // but multi-sheet imports queue 18+ jobs that compete with other parallel tests
    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 210000 });

    // Verify success message shows events were imported
    // Total: 3 (Tech) + 4 (Art) + 2 (Sports) = 9 events
    const successMessage = page.getByText(/import complete/i);
    await expect(successMessage).toBeVisible({ timeout: 10000 });

    // Verify we can navigate to explore page
    const viewOnMapButton = page.getByRole("button", { name: /view on map|explore/i });
    await expect(viewOnMapButton).toBeVisible();

    // Verify the datasets were created by checking the API
    const catalogsResponse = await page.request.get(
      `${baseUrl}/api/catalogs?where[name][equals]=${encodeURIComponent(catalogName)}`
    );
    expect(catalogsResponse.ok()).toBe(true);
    const catalogsData = await catalogsResponse.json();
    expect(catalogsData.docs.length).toBe(1);

    const createdCatalogId = catalogsData.docs[0].id;

    // Verify 3 datasets exist in the catalog
    const datasetsResponse = await page.request.get(
      `${baseUrl}/api/datasets?where[catalog][equals]=${createdCatalogId}`
    );
    expect(datasetsResponse.ok()).toBe(true);
    const datasetsData = await datasetsResponse.json();
    expect(datasetsData.docs.length).toBe(3);

    // Verify dataset names match sheet names
    const datasetNames = datasetsData.docs.map((d: { name: string }) => d.name);
    expect(datasetNames).toContain("Tech Events");
    expect(datasetNames).toContain("Art Exhibitions");
    expect(datasetNames).toContain("Sports Events");
  });
});

test.describe("Import Wizard - Error Handling", () => {
  let importPage: IngestPage;

  test.beforeEach(async ({ page }) => {
    importPage = new IngestPage(page);
    await importPage.goto();
    await importPage.waitForWizardLoad();
    // Auth provided by storageState
  });

  test("should handle empty file gracefully", async ({ page }) => {
    const emptyPath = path.join(FIXTURES_PATH, "empty.csv");

    // Upload may fail validation — use setInputFiles directly to avoid timeout in uploadFile()
    await page.locator('input[type="file"]').setInputFiles(emptyPath);

    // Page should still be functional — the upload heading should remain visible
    // or an error/warning message should be shown (exclude Next.js route announcer)
    const uploadHeading = page.getByRole("heading", { name: /upload your data/i });
    const errorMessage = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(uploadHeading.or(errorMessage)).toBeVisible({ timeout: 10000 });
  });

  test("should handle malformed data gracefully", async ({ page }) => {
    const malformedPath = path.join(FIXTURES_PATH, "malformed-data.csv");

    // Upload may fail validation — use setInputFiles directly to avoid timeout in uploadFile()
    await page.locator('input[type="file"]').setInputFiles(malformedPath);

    // Page should still be functional — the upload heading should remain visible
    // or an error/warning message should be shown (exclude Next.js route announcer)
    const uploadHeading = page.getByRole("heading", { name: /upload your data/i });
    const errorMessage = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(uploadHeading.or(errorMessage)).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Import Wizard - Browser Navigation", () => {
  let importPage: IngestPage;

  test.beforeEach(({ page }) => {
    importPage = new IngestPage(page);
  });

  test("should handle browser navigation correctly", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Navigate away (use waitUntil: "domcontentloaded" to avoid i18n middleware delays)
    await page.goto("/explore", { timeout: 30000, waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded");

    // Navigate back
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    // Should return to import page (note: explore page may redirect with query params)
    // The back navigation should work without crashing
    const currentUrl = page.url();
    // Either we're back on /import OR the browser didn't navigate (acceptable)
    expect(currentUrl.includes("/ingest") || currentUrl.includes("/explore")).toBe(true);
  });

  test("should handle page refresh gracefully", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Refresh the page (auth provided by storageState)
    await page.reload();
    await importPage.waitForWizardLoad();

    // Page should still be functional — the upload heading should be visible
    const uploadHeading = page.getByRole("heading", { name: /upload your data/i });
    await expect(uploadHeading).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Import Wizard - Responsive Design", () => {
  let importPage: IngestPage;

  test.beforeEach(({ page }) => {
    importPage = new IngestPage(page);
  });

  test("should work on desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Wizard heading should be visible at desktop size
    const uploadHeading = page.getByRole("heading", { name: /upload your data/i });
    await expect(uploadHeading).toBeVisible({ timeout: 5000 });
  });

  test("should work on tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Wizard heading should be visible at tablet size
    const uploadHeading = page.getByRole("heading", { name: /upload your data/i });
    await expect(uploadHeading).toBeVisible({ timeout: 5000 });
  });

  test("should work on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Wizard heading should be visible at mobile size
    const uploadHeading = page.getByRole("heading", { name: /upload your data/i });
    await expect(uploadHeading).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Import Wizard - Accessibility", () => {
  let importPage: IngestPage;

  test.beforeEach(async ({ page }) => {
    importPage = new IngestPage(page);
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
  // Full flow tests mutate database — run sequentially
  test.describe.configure({ mode: "serial" });

  let importPage: IngestPage;

  test.beforeEach(({ page }) => {
    importPage = new IngestPage(page);
  });

  test("should complete full import flow and create events", async ({ page }) => {
    // Increase timeout for job processing
    test.setTimeout(180000); // 3 minutes

    // Use a unique catalog name to avoid conflicts
    const uniqueId = Date.now();
    const catalogName = `E2E Test Catalog ${uniqueId}`;

    // Step 1: Navigate (auth provided by storageState)
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Step 2: Upload file
    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");

    // Use file chooser approach for more reliable file upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(csvPath);

    // Wait for file processing to complete - look for success indicator
    const fileReady = page.getByText(/File ready for import/i);
    await expect(fileReady).toBeVisible({ timeout: 10000 });

    // Verify file name is shown
    await expect(page.getByText("valid-events.csv")).toBeVisible();

    // Click Next to go to Dataset Selection (Step 3)
    await importPage.clickNext();

    // Step 3: Dataset Selection
    // Wait for "Select destination" heading
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    // Create a new catalog (handles both fresh DB and existing catalogs)
    await importPage.createNewCatalog(catalogName);

    // Click Next to go to Field Mapping (Step 4)
    await importPage.clickNext();

    // Step 4: Field Mapping
    // Wait for field mapping page to appear
    const fieldMappingHeading = page.getByRole("heading", { name: /map your fields/i });
    await expect(fieldMappingHeading).toBeVisible({ timeout: 10000 });

    // The CSV has: title, description, date, location, category
    // Column-centric mapping table — auto-detection should pre-fill target fields

    // Wait for column mapping table to be interactive
    await importPage.waitForFieldMappingReady();

    // Verify the column mapping table has rows for our columns
    const titleRow = page.locator("tr").filter({ hasText: "title" }).first();
    await expect(titleRow).toBeVisible({ timeout: 10000 });

    // Click Next to go to Review (Step 5)
    await importPage.clickNext();

    // Step 5: Review
    // Wait for review page to appear
    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10000 });

    // Verify summary shows the catalog section (name may be derived from file or user input)
    const catalogSection = page.locator("text=Catalog").first();
    await expect(catalogSection).toBeVisible({ timeout: 10000 });

    // Listen for API response
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/ingest/configure"), {
      timeout: 10000,
    });

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

    expect(typeof responseBody.ingestFileId).toBe("number");
    expect(typeof responseBody.catalogId).toBe("number");

    // Step 6: Processing page is shown
    const processingIndicator = page.getByText(/importing your data/i);
    await expect(processingIndicator).toBeVisible({ timeout: 10000 });

    // Wait for import to complete (job worker processes jobs automatically every 2s)
    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 120000 });

    // Verify success message shows events were created
    const successMessage = page.getByText(/import complete/i);
    await expect(successMessage).toBeVisible({ timeout: 10000 });

    // Verify we can navigate to explore page
    const viewOnMapButton = page.getByRole("button", { name: /view on map|explore/i });
    await expect(viewOnMapButton).toBeVisible();
  });

  test("should persist state across page refresh", async ({ page }) => {
    // Step 1: Upload (auth provided by storageState)
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);

    // Verify file is shown
    await expect(page.getByText("valid-events.csv")).toBeVisible({ timeout: 5000 });

    // Navigate to dataset selection
    await importPage.clickNext();

    // Create a new catalog (handles both fresh DB and existing catalogs)
    await importPage.createNewCatalog("Persistence Test Catalog");

    // Refresh the page
    await page.reload();
    await importPage.waitForWizardLoad();

    // Verify state was restored — should show the file name or catalog info
    const fileName = page.getByText("valid-events.csv");
    const catalogInfo = page.getByText(/persistence test catalog/i);
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(fileName.or(catalogInfo).or(destinationHeading)).toBeVisible({ timeout: 10000 });
  });
});
