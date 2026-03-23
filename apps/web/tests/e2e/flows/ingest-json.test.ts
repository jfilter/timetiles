/**
 * E2E tests for JSON import functionality.
 *
 * Tests the JSON import feature across multiple entry points:
 * - JSON file upload in the import wizard (converted to CSV server-side)
 * - URL input tab UI flow for JSON API endpoints
 * - scheduled ingest JSON API configuration via REST API
 *
 * @module
 * @category E2E Tests
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TEST_CREDENTIALS, TEST_EMAILS } from "../../constants/test-credentials";
import { expect, test } from "../fixtures";
import { IngestPage } from "../pages/ingest.page";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_PATH = path.join(__dirname, "../../fixtures");

// ---------------------------------------------------------------------------
// Test 1: JSON file upload in wizard
// ---------------------------------------------------------------------------

test.describe("Import Wizard - JSON File Upload", () => {
  test.describe.configure({ mode: "serial" });

  let importPage: IngestPage;

  test.beforeEach(({ page }) => {
    importPage = new IngestPage(page);
  });

  test("should import events from uploaded JSON file", async ({ page }) => {
    // Full import flow — increase timeout for job processing
    test.setTimeout(180_000);

    const uniqueId = Date.now();
    const catalogName = `E2E JSON Import ${uniqueId}`;

    // Step 1: Navigate (auth provided by storageState)
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Step 2: Upload JSON file
    // Playwright's setInputFiles bypasses the browser's accept attribute,
    // so .json files reach the server which accepts them.
    const jsonPath = path.join(FIXTURES_PATH, "valid-events.json");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(jsonPath);

    // Wait for server-side JSON-to-CSV conversion and schema detection.
    // The UI shows the file name and row count once processing completes.
    const fileReady = page.getByText(/file ready for import|detected.*sheet/i);
    await expect(fileReady).toBeVisible({ timeout: 20_000 });

    // Verify the file name is displayed
    await expect(page.getByText("valid-events.json")).toBeVisible();

    // Click Next to go to Dataset Selection (Step 3)
    await importPage.clickNext();

    // Step 3: Dataset Selection
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10_000 });

    // Create a new catalog
    await importPage.createNewCatalog(catalogName);

    // Click Next to go to Field Mapping (Step 4)
    await importPage.clickNext();

    // Step 4: Field Mapping
    const fieldMappingHeading = page.getByRole("heading", { name: /map your fields/i });
    await expect(fieldMappingHeading).toBeVisible({ timeout: 10_000 });

    // The JSON had keys: title, date, location, category
    // After JSON-to-CSV conversion, these become CSV columns.
    // The column-centric mapping table shows each source column as a row.
    // Verify auto-detected columns are visible in the mapping table.
    const titleRow = page.locator("tr").filter({ hasText: "title" }).first();
    await expect(titleRow).toBeVisible({ timeout: 10_000 });

    const dateRow = page.locator("tr").filter({ hasText: "date" }).first();
    await expect(dateRow).toBeVisible();

    const locationRow = page.locator("tr").filter({ hasText: "location" }).first();
    await expect(locationRow).toBeVisible();

    // Click Next — Step 5 (Schedule) is auto-skipped for file uploads,
    // so we go directly to Step 6: Review
    await importPage.clickNext();

    // Step 6: Review
    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10_000 });

    // Verify catalog name in summary
    await expect(page.getByText(catalogName)).toBeVisible();

    // Listen for the configure API response
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/ingest/configure"), {
      timeout: 10_000,
    });

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

    expect(typeof responseBody.ingestFileId).toBe("number");
    expect(typeof responseBody.catalogId).toBe("number");

    // Step 7: Processing
    const processingIndicator = page.getByText(/importing your data/i);
    await expect(processingIndicator).toBeVisible({ timeout: 10_000 });

    // Wait for import to complete (job worker processes jobs automatically)
    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 120_000 });

    // Verify events were created (3 records in valid-events.json)
    // eslint-disable-next-line sonarjs/slow-regex -- Simple pattern with no backtracking risk in controlled test
    const successMessage = page.getByText(/[1-9]\d* events imported/i);
    await expect(successMessage).toBeVisible({ timeout: 5_000 });

    // Verify explore link is available
    const viewOnMapButton = page.getByRole("link", { name: /view on map|explore/i });
    await expect(viewOnMapButton).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test 2: URL input tab interaction
// ---------------------------------------------------------------------------

test.describe("Import Wizard - JSON URL Input", () => {
  let importPage: IngestPage;

  test.beforeEach(({ page }) => {
    importPage = new IngestPage(page);
  });

  test("should show URL input tab and accept URL for fetching", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // The upload step should have two tabs: File Upload and From URL
    const urlTab = page.getByRole("tab", { name: /from url|url/i });
    await expect(urlTab).toBeVisible({ timeout: 5_000 });

    // Switch to URL tab
    await urlTab.click();

    // Verify URL input field is visible
    const urlInput = page.locator("#source-url");
    await expect(urlInput).toBeVisible({ timeout: 5_000 });

    // Verify fetch button exists
    const fetchButton = page.getByRole("button", { name: /fetch/i });
    await expect(fetchButton).toBeVisible();

    // Enter a URL pointing to a JSON API endpoint
    await urlInput.fill("https://httpbin.org/json");

    // Fetch button should be enabled now
    await expect(fetchButton).toBeEnabled();

    // Click Fetch — the server will attempt to download from this URL.
    // We intercept the preview-schema/url API response to verify the
    // client sends the request correctly, regardless of whether the
    // remote fetch succeeds.
    const apiResponsePromise = page.waitForResponse((resp) => resp.url().includes("/api/ingest/preview-schema/url"), {
      timeout: 30_000,
    });

    await fetchButton.click();

    // Wait for the API response
    const apiResponse = await apiResponsePromise;
    const status = apiResponse.status();

    // The server tried to fetch the URL. Depending on network
    // availability and SSRF rules, we may get success or an error.
    // The server tried to fetch the URL. Regardless of whether the
    // external URL is reachable, verify that the API responded and
    // the wizard shows either a success preview or an error message.
    if (status === 200) {
      const fileReady = page.getByText(/file ready for import|url data ready|ready|detected/i);
      await expect(fileReady).toBeVisible({ timeout: 10_000 });
    } else {
      // Error: any visible text mentioning the failure is acceptable
      const errorVisible = page.getByText(/failed|error|unsupported|could not/i).first();
      await expect(errorVisible).toBeVisible({ timeout: 5_000 });
    }
  });

  test("should show authentication settings in URL tab", async ({ page }) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    // Switch to URL tab
    const urlTab = page.getByRole("tab", { name: /from url|url/i });
    await urlTab.click();

    // Verify auth settings collapsible exists
    const authTrigger = page.getByText(/auth.*settings/i);
    await expect(authTrigger).toBeVisible({ timeout: 5_000 });

    // Expand auth settings
    await authTrigger.click();

    // Verify auth type selector is visible (id has React useId prefix)
    const authTypeSelect = page.getByLabel(/authentication type/i);
    await expect(authTypeSelect).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Test 3: scheduled ingest JSON API config via REST API
// ---------------------------------------------------------------------------

test.describe("scheduled ingest - JSON API Configuration", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  let token: string;
  let baseUrl: string;
  let scheduledIngestId: number;
  let catalogId: number;
  let datasetId: number;

  test("should login as admin", async ({ request, baseURL }) => {
    baseUrl = baseURL;

    const loginResponse = await request.post(`${baseURL}/api/users/login`, {
      data: { email: TEST_EMAILS.admin, password: TEST_CREDENTIALS.seed.admin },
      headers: { "Content-Type": "application/json" },
      timeout: 10_000,
    });

    expect(loginResponse.status()).toBe(200);

    const body = await loginResponse.json();
    expect(typeof body.token).toBe("string");
    token = body.token;
  });

  test("should create catalog and dataset for scheduled ingest", async ({ request }) => {
    const uniqueId = Date.now();

    // Create a catalog
    const catalogResponse = await request.post(`${baseUrl}/api/catalogs`, {
      data: { name: `JSON API Test Catalog ${uniqueId}` },
      headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
    });

    expect(catalogResponse.status()).toBe(201);
    const catalog = await catalogResponse.json();
    catalogId = catalog.doc.id;

    // Create a dataset (language is required)
    const datasetResponse = await request.post(`${baseUrl}/api/datasets`, {
      data: { name: `JSON API Test Dataset ${uniqueId}`, catalog: catalogId, language: "eng" },
      headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
    });

    expect(datasetResponse.status()).toBe(201);
    const dataset = await datasetResponse.json();
    datasetId = dataset.doc.id;
  });

  test("should create scheduled ingest with JSON API configuration", async ({ request }) => {
    const uniqueId = Date.now();

    const scheduledIngestData = {
      name: `JSON API Import ${uniqueId}`,
      sourceUrl: "https://api.example.com/events",
      // Schedule configuration: scheduleType + frequency (not a single "schedule" field)
      scheduleType: "frequency",
      frequency: "daily",
      // Target: catalog is required, dataset is optional
      catalog: catalogId,
      dataset: datasetId,
      // Disabled so it does not actually run
      enabled: false,
      advancedOptions: {
        responseFormat: "json",
        jsonApiConfig: {
          recordsPath: "data.results",
          pagination: {
            enabled: true,
            type: "offset",
            pageParam: "offset",
            limitParam: "limit",
            limitValue: 50,
            maxPages: 10,
          },
        },
      },
    };

    const response = await request.post(`${baseUrl}/api/scheduled-ingests`, {
      data: scheduledIngestData,
      headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
    });

    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.doc).toBeDefined();
    expect(body.doc.id).toBeDefined();

    scheduledIngestId = body.doc.id;

    // Verify the JSON API config was saved
    expect(body.doc.advancedOptions?.responseFormat).toBe("json");
    expect(body.doc.advancedOptions?.jsonApiConfig?.recordsPath).toBe("data.results");
    expect(body.doc.advancedOptions?.jsonApiConfig?.pagination?.enabled).toBe(true);
    expect(body.doc.advancedOptions?.jsonApiConfig?.pagination?.type).toBe("offset");
    expect(body.doc.advancedOptions?.jsonApiConfig?.pagination?.pageParam).toBe("offset");
    expect(body.doc.advancedOptions?.jsonApiConfig?.pagination?.limitParam).toBe("limit");
    expect(body.doc.advancedOptions?.jsonApiConfig?.pagination?.limitValue).toBe(50);
    expect(body.doc.advancedOptions?.jsonApiConfig?.pagination?.maxPages).toBe(10);
  });

  test("should retrieve scheduled ingest with JSON API config intact", async ({ request }) => {
    const response = await request.get(`${baseUrl}/api/scheduled-ingests/${scheduledIngestId}`, {
      headers: { Authorization: `JWT ${token}` },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.advancedOptions?.responseFormat).toBe("json");
    expect(body.advancedOptions?.jsonApiConfig?.recordsPath).toBe("data.results");
    expect(body.advancedOptions?.jsonApiConfig?.pagination?.enabled).toBe(true);
    expect(body.advancedOptions?.jsonApiConfig?.pagination?.type).toBe("offset");
  });

  test("should update scheduled ingest JSON API config", async ({ request }) => {
    const response = await request.patch(`${baseUrl}/api/scheduled-ingests/${scheduledIngestId}`, {
      data: {
        advancedOptions: {
          responseFormat: "json",
          jsonApiConfig: {
            recordsPath: "items",
            pagination: {
              enabled: true,
              type: "cursor",
              cursorParam: "after",
              nextCursorPath: "meta.next_cursor",
              limitParam: "per_page",
              limitValue: 100,
              maxPages: 20,
            },
          },
        },
      },
      headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.doc.advancedOptions?.jsonApiConfig?.recordsPath).toBe("items");
    expect(body.doc.advancedOptions?.jsonApiConfig?.pagination?.type).toBe("cursor");
    expect(body.doc.advancedOptions?.jsonApiConfig?.pagination?.cursorParam).toBe("after");
    expect(body.doc.advancedOptions?.jsonApiConfig?.pagination?.nextCursorPath).toBe("meta.next_cursor");
  });

  test("should clean up test data", async ({ request }) => {
    // Delete scheduled ingest
    if (scheduledIngestId) {
      const deleteResponse = await request.delete(`${baseUrl}/api/scheduled-ingests/${scheduledIngestId}`, {
        headers: { Authorization: `JWT ${token}` },
      });
      expect(deleteResponse.status()).toBe(200);
    }

    // Delete dataset
    if (datasetId) {
      await request.delete(`${baseUrl}/api/datasets/${datasetId}`, { headers: { Authorization: `JWT ${token}` } });
    }

    // Delete catalog
    if (catalogId) {
      await request.delete(`${baseUrl}/api/catalogs/${catalogId}`, { headers: { Authorization: `JWT ${token}` } });
    }
  });
});
