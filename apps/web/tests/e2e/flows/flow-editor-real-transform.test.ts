/**
 * E2E tests for real user interactions with transforms in the import wizard.
 *
 * These tests verify the full flow of adding a transform via the inline
 * per-row transform editor (no localStorage injection), round-tripping through
 * the visual flow editor, and submitting to the import API.
 *
 * @module
 * @category E2E Tests
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { IngestPage } from "../pages/ingest.page";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_PATH = path.join(__dirname, "../../fixtures");

test.describe("Flow Editor Real Transform Interactions", () => {
  test.describe.configure({ mode: "serial" });

  let importPage: IngestPage;

  test.beforeEach(({ page }) => {
    importPage = new IngestPage(page);
  });

  /**
   * Helper: Navigate through upload (step 2) and dataset selection (step 3)
   * to reach the field mapping step (step 4).
   */
  const navigateToFieldMapping = async (page: Page, catalogName: string) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);
    await importPage.clickNext();

    // Step 3: Dataset selection
    await expect(page.getByRole("heading", { name: /select destination/i })).toBeVisible({ timeout: 10000 });
    await importPage.createNewCatalog(catalogName);
    await importPage.clickNext();

    // Step 4: Field mapping
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });
  };

  /**
   * Helper: Add a string-op (uppercase) transform via the column-centric table UI.
   * Finds the "title" column row, clicks its per-row [+ Add transform] button,
   * selects "String Operation", then configures the operation (source field is
   * pre-filled with the column name).
   */
  const addUppercaseTransformViaUI = async (page: Page) => {
    const titleRow = page.locator("tr").filter({ hasText: "title" }).first();
    const addButton = titleRow.getByRole("button", { name: /add transform/i });
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    const stringOpItem = page.getByRole("menuitem", { name: /string operation/i });
    await expect(stringOpItem).toBeVisible({ timeout: 5000 });
    await stringOpItem.click();

    // Default operation is "uppercase"; clicking the chip expands the inline editor
    const transformChip = titleRow.getByText("Uppercase");
    await expect(transformChip).toBeVisible({ timeout: 5000 });
    await transformChip.click();

    // Source field is preset to "title"; the operation defaults to "uppercase"
    const operationTrigger = page.locator("#operation");
    await expect(operationTrigger).toBeVisible({ timeout: 5000 });

    await expect(titleRow.getByText("Uppercase")).toBeVisible({ timeout: 5000 });
  };

  test("inline transform should persist through flow editor round-trip", async ({ page }) => {
    test.setTimeout(180000);

    const uniqueId = Date.now();
    const catalogName = `E2E Real Transform RT ${uniqueId}`;

    await navigateToFieldMapping(page, catalogName);

    const titleRow = page.locator("tr").filter({ hasText: "title" }).first();
    await expect(titleRow.getByText("Uppercase")).not.toBeVisible();

    await addUppercaseTransformViaUI(page);

    const visualEditorButton = page.getByRole("button", { name: /open visual editor/i });
    await expect(visualEditorButton).toBeVisible({ timeout: 10000 });
    await visualEditorButton.click();

    await expect(page.getByText("Visual Field Mapping")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Source Column").first()).toBeVisible({ timeout: 10000 });

    const transformNode = page.locator(".react-flow__node-transform");
    await expect(transformNode).toBeVisible({ timeout: 10000 });

    await expect(transformNode.getByText("uppercase")).toBeVisible({ timeout: 5000 });

    // Verify the transform node is wired with edges (source -> transform -> target)
    const edges = page.locator(".react-flow__edge");
    await expect(edges.first()).toBeVisible({ timeout: 5000 });
    const edgeCount = await edges.count();
    // At minimum: source->transform edge + transform->target edge + other auto-detected edges
    expect(edgeCount).toBeGreaterThanOrEqual(2);

    const saveButton = page.getByRole("button", { name: /apply.*return/i });
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await saveButton.click();

    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });

    const titleRowAfterRT = page.locator("tr").filter({ hasText: "title" }).first();
    await expect(titleRowAfterRT.getByText("Uppercase")).toBeVisible({ timeout: 5000 });
  });

  test("inline transform should reach the import API", async ({ page }) => {
    test.setTimeout(180000);

    const uniqueId = Date.now();
    const catalogName = `E2E Real Transform API ${uniqueId}`;

    await navigateToFieldMapping(page, catalogName);

    await addUppercaseTransformViaUI(page);

    // Proceed to review step — use the sticky "Continue to Review" button
    const continueButton = page.getByRole("button", { name: /continue to review/i });
    await expect(continueButton).toBeVisible({ timeout: 5000 });
    await continueButton.click();

    // Step 5: Review
    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10000 });

    // Set up request interception BEFORE clicking "Start Import"
    let capturedRequestBody: Record<string, unknown> | null = null;
    page.on("request", (request) => {
      if (request.url().includes("/api/ingest/configure") && request.method() === "POST") {
        capturedRequestBody = request.postDataJSON() as Record<string, unknown>;
      }
    });

    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/ingest/configure"), {
      timeout: 15000,
    });

    const startImportButton = page.getByRole("button", { name: /start import/i });
    await expect(startImportButton).toBeVisible({ timeout: 5000 });
    await startImportButton.click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    expect(capturedRequestBody).not.toBeNull();
    const transforms = capturedRequestBody!.transforms as Array<{
      sheetIndex: number;
      transforms: Array<Record<string, unknown>>;
    }>;
    expect(transforms).toBeDefined();
    expect(transforms).toHaveLength(1);
    expect(transforms[0]!.sheetIndex).toBe(0);
    expect(transforms[0]!.transforms).toHaveLength(1);

    const transform = transforms[0]!.transforms[0]!;
    expect(transform.type).toBe("string-op");
    expect(transform.operation).toBe("uppercase");
    expect(transform.from).toBe("title");
    expect(transform.active).toBe(true);

    // Capture dataset ID from the configure response for scoped queries
    const responseBody = await response.json();
    const datasetId = responseBody.datasets?.["0"] as number | undefined;
    expect(datasetId).toBeDefined();

    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 120000 });

    // Verify events were created with uppercased titles — scoped to this import's dataset
    const eventsResponse = await page.request.get("/api/events", {
      params: { limit: "10", sort: "-createdAt", "where[dataset][equals]": String(datasetId) },
    });
    expect(eventsResponse.ok()).toBe(true);

    const eventsData = await eventsResponse.json();
    const events = eventsData.docs as Array<{ transformedData: Record<string, unknown> }>;

    const uppercasedEvents = events.filter(
      (e) =>
        typeof e.transformedData?.title === "string" &&
        e.transformedData.title === e.transformedData.title.toUpperCase()
    );
    expect(uppercasedEvents.length).toBeGreaterThan(0);

    // Verify a specific title is uppercased (from valid-events.csv)
    const techEvent = events.find(
      (e) => typeof e.transformedData?.title === "string" && e.transformedData.title.includes("TECH CONFERENCE")
    );
    expect(techEvent).toBeDefined();
  });
});
