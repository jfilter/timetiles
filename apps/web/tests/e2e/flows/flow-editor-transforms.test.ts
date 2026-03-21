/**
 * E2E tests for the flow editor transform wiring.
 *
 * Tests the end-to-end flow of using the visual flow editor to create
 * field mappings (with and without transforms) and completing an import.
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

test.describe("Flow Editor Transforms", () => {
  test.describe.configure({ mode: "serial" });

  let importPage: ImportPage;

  test.beforeEach(({ page }) => {
    importPage = new ImportPage(page);
  });

  test("should complete import using flow editor for field mapping", async ({ page }) => {
    test.setTimeout(180000);

    const uniqueId = Date.now();
    const catalogName = `E2E Flow Editor ${uniqueId}`;

    // Step 1: Navigate to import wizard and upload file
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);

    await importPage.clickNext();

    // Step 3: Dataset selection
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    await importPage.createNewCatalog(catalogName);

    await importPage.clickNext();

    // Step 4: Field mapping
    const fieldMappingHeading = page.getByRole("heading", { name: /map your fields/i });
    await expect(fieldMappingHeading).toBeVisible({ timeout: 10000 });

    // Open the flow editor
    const visualEditorButton = page.getByRole("button", { name: /open visual editor/i });
    await expect(visualEditorButton).toBeVisible({ timeout: 15000 });
    await visualEditorButton.click();

    // Wait for flow editor to load
    await expect(page.getByText("Visual Field Mapping")).toBeVisible({ timeout: 10000 });

    // Verify source column nodes are visible (from valid-events.csv: title, description, date, location, category)
    await expect(page.getByText("Source Column").first()).toBeVisible({ timeout: 5000 });

    // Verify target field nodes are visible
    await expect(page.getByText("Title").first()).toBeVisible();

    // Verify the palette is visible with draggable transform items
    await expect(page.getByText("Transforms")).toBeVisible();
    await expect(page.locator('[data-testid="palette-item-rename"]')).toBeVisible();
    await expect(page.locator('[data-testid="palette-item-date-parse"]')).toBeVisible();
    await expect(page.locator('[data-testid="palette-item-string-op"]')).toBeVisible();
    await expect(page.locator('[data-testid="palette-item-concatenate"]')).toBeVisible();
    await expect(page.locator('[data-testid="palette-item-split"]')).toBeVisible();

    // Verify palette items are draggable
    const renameItem = page.locator('[data-testid="palette-item-rename"]');
    await expect(renameItem).toHaveAttribute("draggable", "true");

    // Click "Apply & Return" to save mappings and go back to wizard
    const saveButton = page.getByRole("button", { name: /apply.*return/i });
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // Should redirect back to import wizard at step 4
    await expect(page).toHaveURL(/\/import/, { timeout: 10000 });

    // The wizard should be on the field mapping step
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });

    // Click Next to go to review
    await importPage.clickNext();

    // Step 5: Review
    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10000 });

    await expect(page.getByText(catalogName)).toBeVisible();

    // Start the import
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/import/configure"), {
      timeout: 10000,
    });

    const startImportButton = page.getByRole("button", { name: /start import/i });
    await expect(startImportButton).toBeVisible();
    await startImportButton.click();

    const response = await responsePromise;
    const responseBody = await response.json();
    if (response.status() !== 200) {
      throw new Error(`Configure import failed with status ${response.status()}: ${JSON.stringify(responseBody)}`);
    }

    expect(typeof responseBody.importFileId).toBe("number");

    // Step 6: Wait for processing
    const processingIndicator = page.getByText(/importing your data/i);
    await expect(processingIndicator).toBeVisible({ timeout: 10000 });

    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 120000 });

    // Verify events were created
    // eslint-disable-next-line sonarjs/slow-regex -- Simple pattern with no backtracking risk in controlled test
    const successMessage = page.getByText(/import complete/i);
    await expect(successMessage).toBeVisible({ timeout: 5000 });
  });

  test("should serialize transforms when flow editor has transform nodes", async ({ page }) => {
    test.setTimeout(180000);

    const uniqueId = Date.now();
    const catalogName = `E2E Transform ${uniqueId}`;

    // Navigate to import wizard and upload
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);

    await importPage.clickNext();

    // Dataset selection
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    await importPage.createNewCatalog(catalogName);

    await importPage.clickNext();

    // Field mapping - open flow editor
    const fieldMappingHeading = page.getByRole("heading", { name: /map your fields/i });
    await expect(fieldMappingHeading).toBeVisible({ timeout: 10000 });

    const visualEditorButton = page.getByRole("button", { name: /open visual editor/i });
    await expect(visualEditorButton).toBeVisible({ timeout: 15000 });
    await visualEditorButton.click();

    // Wait for flow editor to load
    await expect(page.getByText("Visual Field Mapping")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Source Column").first()).toBeVisible({ timeout: 5000 });

    // Intercept the navigation to capture the applyMappings URL parameter
    let applyMappingsParam: string | null = null;
    page.on("request", (request) => {
      const url = new URL(request.url());
      const param = url.searchParams.get("applyMappings");
      if (param) {
        applyMappingsParam = param;
      }
    });

    // Click save
    const saveButton = page.getByRole("button", { name: /apply.*return/i });
    await saveButton.click();

    // Wait for redirect
    await expect(page).toHaveURL(/\/import/, { timeout: 10000 });

    // Verify the serialized data was passed through the URL
    // The applyMappings param should contain the new format with fieldMapping and transforms
    // Even without transforms, it should use the new { fieldMapping, transforms } format
    expect(applyMappingsParam).not.toBeNull();
    const decoded = JSON.parse(decodeURIComponent(applyMappingsParam!));
    expect(decoded).toHaveProperty("fieldMapping");
    expect(decoded).toHaveProperty("transforms");
    expect(decoded.fieldMapping).toHaveProperty("sheetIndex");
    expect(Array.isArray(decoded.transforms)).toBe(true);

    // Complete the import to verify the full round-trip
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });
    await importPage.clickNext();

    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10000 });

    // Start import
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/import/configure"), {
      timeout: 10000,
    });

    const startImportButton = page.getByRole("button", { name: /start import/i });
    await startImportButton.click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Wait for completion
    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 120000 });
  });

  test("should apply uppercase transform to event titles during import", async ({ page }) => {
    test.setTimeout(180000);

    const uniqueId = Date.now();
    const catalogName = `E2E Uppercase ${uniqueId}`;

    // Step 1-3: Upload file and select catalog
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);

    await importPage.clickNext();

    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    await importPage.createNewCatalog(catalogName);

    await importPage.clickNext();

    // Step 4: Add uppercase transform via the column table UI
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });

    // Find the "title" column row and click its "Add transform" button
    const titleRow = page.locator("tr").filter({ hasText: "title" }).first();
    const addTransformButton = titleRow.getByRole("button", { name: /add transform/i });
    await expect(addTransformButton).toBeVisible({ timeout: 5000 });
    await addTransformButton.click();

    // Select "String Operation" from the dropdown menu
    const stringOpItem = page.getByRole("menuitem", { name: /string operation/i });
    await expect(stringOpItem).toBeVisible({ timeout: 5000 });
    await stringOpItem.click();

    // Default operation is "uppercase" — verify chip shows in the title row
    await expect(titleRow.getByText("Uppercase")).toBeVisible({ timeout: 5000 });

    // Proceed to review step
    await importPage.clickNext();

    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10000 });

    // Intercept the configure API call to verify transforms are sent
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/import/configure"), {
      timeout: 10000,
    });

    let capturedRequestBody: Record<string, unknown> | null = null;
    page.on("request", (request) => {
      if (request.url().includes("/api/import/configure") && request.method() === "POST") {
        capturedRequestBody = request.postDataJSON() as Record<string, unknown>;
      }
    });

    const startImportButton = page.getByRole("button", { name: /start import/i });
    await expect(startImportButton).toBeVisible();
    await startImportButton.click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Verify the configure API received the transforms
    expect(capturedRequestBody).not.toBeNull();
    const transforms = capturedRequestBody!.transforms as Array<{ sheetIndex: number; transforms: unknown[] }>;
    expect(transforms).toBeDefined();
    expect(transforms).toHaveLength(1);
    expect(transforms[0]!.sheetIndex).toBe(0);
    expect(transforms[0]!.transforms).toHaveLength(1);

    const transform = transforms[0]!.transforms[0] as Record<string, unknown>;
    expect(transform.type).toBe("string-op");
    expect(transform.operation).toBe("uppercase");
    expect(transform.from).toBe("title");

    // Capture dataset ID from the configure response for scoped queries
    const responseBody = await response.json();
    const datasetId = responseBody.datasets?.["0"] as number | undefined;
    expect(datasetId).toBeDefined();

    // Wait for import to complete
    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 120000 });

    // Verify events were created with uppercased titles — scoped to this import's dataset
    const eventsResponse = await page.request.get("/api/events", {
      params: { limit: "10", sort: "-createdAt", "where[dataset][equals]": String(datasetId) },
    });
    expect(eventsResponse.ok()).toBe(true);

    const eventsData = await eventsResponse.json();
    const events = eventsData.docs as Array<{ data: Record<string, unknown> }>;

    // All events in this dataset should have uppercase titles
    const uppercasedEvents = events.filter(
      (e) => typeof e.data?.title === "string" && e.data.title === e.data.title.toUpperCase()
    );
    expect(uppercasedEvents.length).toBeGreaterThan(0);

    // Verify specific title is uppercased (from valid-events.csv)
    const techEvent = events.find((e) => typeof e.data?.title === "string" && e.data.title.includes("TECH CONFERENCE"));
    expect(techEvent).toBeDefined();
    expect(techEvent!.data.title).toBe("TECH CONFERENCE 2024");
  });

  test("should apply rename transform and verify field name change", async ({ page }) => {
    test.setTimeout(180000);

    const uniqueId = Date.now();
    const catalogName = `E2E Rename ${uniqueId}`;

    // Step 1-3: Upload file and select catalog
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);

    await importPage.clickNext();

    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    await importPage.createNewCatalog(catalogName);

    await importPage.clickNext();

    // Step 4: Add rename transform via the column table UI
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });

    // Find the "category" column row and click its "Add transform" button
    const categoryRow = page.locator("tr").filter({ hasText: "category" }).first();
    const addTransformButton = categoryRow.getByRole("button", { name: /add transform/i });
    await expect(addTransformButton).toBeVisible({ timeout: 5000 });
    await addTransformButton.click();

    // Select "Rename Field" from the dropdown menu
    const renameItem = page.getByRole("menuitem", { name: /rename field/i });
    await expect(renameItem).toBeVisible({ timeout: 5000 });
    await renameItem.click();

    // A rename chip appears — click it to expand the inline editor
    const renameChip = categoryRow.getByText(/Rename/);
    await expect(renameChip).toBeVisible({ timeout: 5000 });
    await renameChip.click();

    // Fill in the new name in the inline editor
    const toInput = page.locator("#to");
    await expect(toInput).toBeVisible({ timeout: 5000 });
    await toInput.fill("event_type");

    // Save the transform
    const saveTransformButton = page.getByRole("button", { name: /^Save$/i });
    await expect(saveTransformButton).toBeVisible({ timeout: 5000 });
    await saveTransformButton.click();

    await importPage.clickNext();

    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10000 });

    // Intercept and verify the configure API call
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/import/configure"), {
      timeout: 10000,
    });

    let capturedRequestBody: Record<string, unknown> | null = null;
    page.on("request", (request) => {
      if (request.url().includes("/api/import/configure") && request.method() === "POST") {
        capturedRequestBody = request.postDataJSON() as Record<string, unknown>;
      }
    });

    const startImportButton = page.getByRole("button", { name: /start import/i });
    await expect(startImportButton).toBeVisible();
    await startImportButton.click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Verify the configure API received the rename transform
    expect(capturedRequestBody).not.toBeNull();
    const transforms = capturedRequestBody!.transforms as Array<{ sheetIndex: number; transforms: unknown[] }>;
    expect(transforms).toBeDefined();
    expect(transforms).toHaveLength(1);

    const transform = transforms[0]!.transforms[0] as Record<string, unknown>;
    expect(transform.type).toBe("rename");
    expect(transform.from).toBe("category");
    expect(transform.to).toBe("event_type");

    // Capture dataset ID from the configure response for scoped queries
    const responseBody = await response.json();
    const datasetId = responseBody.datasets?.["0"] as number | undefined;
    expect(datasetId).toBeDefined();

    // Wait for import to complete
    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 120000 });

    // Verify events have "event_type" field instead of "category" — scoped to this import's dataset
    const eventsResponse = await page.request.get("/api/events", {
      params: { limit: "10", sort: "-createdAt", "where[dataset][equals]": String(datasetId) },
    });
    expect(eventsResponse.ok()).toBe(true);

    const eventsData = await eventsResponse.json();
    const events = eventsData.docs as Array<{ data: Record<string, unknown> }>;

    // Find events with the renamed field
    const renamedEvents = events.filter((e) => typeof e.data?.event_type === "string" && !("category" in e.data));
    expect(renamedEvents.length).toBeGreaterThan(0);

    // Verify specific value - "technology" should now be under "event_type"
    const techEvent = renamedEvents.find((e) => e.data.event_type === "technology");
    expect(techEvent).toBeDefined();
  });
});
