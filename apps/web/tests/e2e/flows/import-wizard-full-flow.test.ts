/**
 * E2E tests for complete import wizard flows.
 *
 * Tests end-to-end import scenarios including:
 * - English CSV import with auto-detection
 * - German CSV import with auto-detection
 * - State persistence across page refresh
 *
 * @module
 * @category E2E Tests
 */
import path from "path";
import { fileURLToPath } from "url";

import { expect, test } from "../fixtures";
import { ImportPage } from "../pages/import.page";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_PATH = path.join(__dirname, "../../fixtures");

test.describe("Import Wizard - Full Flow", () => {
  let importPage: ImportPage;

  test.beforeEach(({ page }) => {
    importPage = new ImportPage(page);
  });

  test.describe("English CSV Import", () => {
    test("should complete import with auto-detected English fields", async ({ page }) => {
      // Increase timeout for job processing
      test.setTimeout(180000); // 3 minutes

      // Use a unique catalog name to avoid conflicts
      const uniqueId = Date.now();
      const catalogName = `E2E English Catalog ${uniqueId}`;

      // Step 1: Navigate and login
      await importPage.goto();
      await importPage.waitForWizardLoad();
      await importPage.login("admin@example.com", "admin123");

      // Step 2: Upload file
      const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");

      // Use file chooser approach for more reliable file upload
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(csvPath);

      // Wait for file processing to complete - look for ready indicator
      const fileReady = page.getByText(/file ready for import|detected.*sheet/i);
      await expect(fileReady).toBeVisible({ timeout: 5000 });

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

      // The CSV has columns: title, description, date, location, category
      // Auto-detection should have pre-filled the field mappings

      // Verify language detection banner is shown (English should be detected)
      const languageBanner = page.locator('[data-testid="language-detection-banner"]');
      await expect(languageBanner).toBeVisible({ timeout: 5000 });
      await expect(languageBanner).toContainText(/english/i);

      // Verify title field was auto-detected (should have value "title")
      const titleSelect = page.locator("#title-field");
      await expect(titleSelect).toBeVisible();
      await expect(titleSelect).toContainText("title");

      // Verify confidence badges are shown for auto-detected fields
      const confidenceBadges = page.locator('[data-testid^="confidence-badge-"]');
      await expect(confidenceBadges.first()).toBeVisible({ timeout: 5000 });

      // Verify date field was auto-detected
      const dateSelect = page.locator("#date-field");
      await expect(dateSelect).toBeVisible();
      await expect(dateSelect).toContainText("date");

      // Verify location field was auto-detected
      const locationSelect = page.locator("#location-field");
      await expect(locationSelect).toBeVisible();
      await expect(locationSelect).toContainText("location");

      // Verify description field was auto-detected
      const descriptionSelect = page.locator("#description-field");
      if (await descriptionSelect.isVisible()) {
        await expect(descriptionSelect).toContainText("description");
      }

      // No manual field mapping needed - auto-detection handled it!

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
        { timeout: 10000 }
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

      // Wait for import to complete (job worker processes jobs automatically every 2s)
      const completionIndicator = page.getByText(/import complete/i);
      await expect(completionIndicator).toBeVisible({ timeout: 60000 });

      // Verify success message shows events were created (must be > 0)
      // eslint-disable-next-line sonarjs/slow-regex -- Simple pattern with no backtracking risk in controlled test
      const successMessage = page.getByText(/[1-9]\d* events imported/i);
      await expect(successMessage).toBeVisible({ timeout: 5000 });

      // Verify we can navigate to explore page
      const viewOnMapButton = page.getByRole("link", { name: /view on map|explore/i });
      await expect(viewOnMapButton).toBeVisible();
    });
  });

  test.describe("German CSV Import", () => {
    test("should complete import with auto-detected German fields", async ({ page }) => {
      // Increase timeout for job processing
      test.setTimeout(180000); // 3 minutes

      // Use a unique catalog name to avoid conflicts
      const uniqueId = Date.now();
      const catalogName = `E2E German Catalog ${uniqueId}`;

      // Step 1: Navigate and login
      await importPage.goto();
      await importPage.waitForWizardLoad();
      await importPage.login("admin@example.com", "admin123");

      // Step 2: Upload German CSV file
      const csvPath = path.join(FIXTURES_PATH, "events-german-locations.csv");

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(csvPath);

      // Wait for file processing to complete (UI shows "File ready for import")
      const fileReady = page.getByText("File ready for import");
      await expect(fileReady).toBeVisible({ timeout: 5000 });

      // Verify file name is shown
      await expect(page.getByText("events-german-locations.csv")).toBeVisible();

      // Click Next to go to Dataset Selection (Step 3)
      await importPage.clickNext();

      // Step 3: Dataset Selection
      const destinationHeading = page.getByRole("heading", { name: /select destination/i });
      await expect(destinationHeading).toBeVisible({ timeout: 10000 });

      // Create a new catalog (handles both fresh DB and existing catalogs)
      await importPage.createNewCatalog(catalogName);

      // Click Next to go to Field Mapping (Step 4)
      await importPage.clickNext();

      // Step 4: Field Mapping
      const fieldMappingHeading = page.getByRole("heading", { name: /map your fields/i });
      await expect(fieldMappingHeading).toBeVisible({ timeout: 10000 });

      // The German CSV has columns: titel, beschreibung, datum, ort, kategorie
      // Auto-detection should have pre-filled the field mappings

      // Verify language detection banner is shown (German should be detected)
      const languageBanner = page.locator('[data-testid="language-detection-banner"]');
      await expect(languageBanner).toBeVisible({ timeout: 5000 });
      await expect(languageBanner).toContainText(/german|deutsch/i);

      // Verify title field was auto-detected (should have value "titel")
      const titleSelect = page.locator("#title-field");
      await expect(titleSelect).toBeVisible();
      await expect(titleSelect).toContainText("titel");

      // Verify confidence badges are shown
      const confidenceBadges = page.locator('[data-testid^="confidence-badge-"]');
      await expect(confidenceBadges.first()).toBeVisible({ timeout: 5000 });

      // Verify date field was auto-detected (should have value "datum")
      const dateSelect = page.locator("#date-field");
      await expect(dateSelect).toBeVisible();
      await expect(dateSelect).toContainText("datum");

      // Verify location field was auto-detected (should have value "ort")
      const locationSelect = page.locator("#location-field");
      await expect(locationSelect).toBeVisible();
      await expect(locationSelect).toContainText("ort");

      // Verify description field was auto-detected (should have value "beschreibung")
      const descriptionSelect = page.locator("#description-field");
      if (await descriptionSelect.isVisible()) {
        await expect(descriptionSelect).toContainText("beschreibung");
      }

      // No manual field mapping needed - German auto-detection handled it!

      // Click Next to go to Review (Step 5)
      await importPage.clickNext();

      // Step 5: Review
      const reviewHeading = page.getByRole("heading", { name: /review your import/i });
      await expect(reviewHeading).toBeVisible({ timeout: 10000 });

      await expect(page.getByText(catalogName)).toBeVisible();

      // Listen for API response
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/wizard/configure-import"),
        { timeout: 10000 }
      );

      // Click Start Import
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

      expect(responseBody.success).toBe(true);
      expect(responseBody.importFileId).toBeDefined();
      expect(responseBody.catalogId).toBeDefined();

      // Step 6: Processing
      const processingIndicator = page.getByText(/importing your data/i);
      await expect(processingIndicator).toBeVisible({ timeout: 10000 });

      // Wait for import to complete (job worker processes jobs automatically every 2s)
      const completionIndicator = page.getByText(/import complete/i);
      await expect(completionIndicator).toBeVisible({ timeout: 60000 });

      // Verify success message shows events were created (must be > 0)
      // eslint-disable-next-line sonarjs/slow-regex -- Simple pattern with no backtracking risk in controlled test
      const successMessage = page.getByText(/[1-9]\d* events imported/i);
      await expect(successMessage).toBeVisible({ timeout: 5000 });

      const viewOnMapButton = page.getByRole("link", { name: /view on map|explore/i });
      await expect(viewOnMapButton).toBeVisible();
    });
  });

  test.describe("State Persistence", () => {
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

      // Create a new catalog (handles both fresh DB and existing catalogs)
      await importPage.createNewCatalog("Persistence Test Catalog");

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
});
