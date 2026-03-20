/**
 * E2E tests for real user interactions with transforms in the import wizard.
 *
 * These tests verify the full flow of adding a transform via the inline
 * TransformList UI (no localStorage injection), round-tripping through
 * the visual flow editor, and submitting to the import API.
 *
 * @module
 * @category E2E Tests
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { ImportPage } from "../pages/import.page";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_PATH = path.join(__dirname, "../../fixtures");

test.describe("Flow Editor Real Transform Interactions", () => {
  test.describe.configure({ mode: "serial" });

  let importPage: ImportPage;

  test.beforeEach(({ page }) => {
    importPage = new ImportPage(page);
  });

  /**
   * Helper: Navigate through upload (step 2) and dataset selection (step 3)
   * to reach the field mapping step (step 4).
   */
  async function navigateToFieldMapping(page: Page, catalogName: string) {
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
  }

  /**
   * Helper: Add a string-op (uppercase) transform via the inline TransformList UI.
   * Clicks "Add Transform" dropdown, selects "String Operation", then configures
   * the source field and operation using real Radix UI Select interactions.
   */
  async function addUppercaseTransformViaUI(page: Page) {
    // Click the "Add Transform" dropdown button
    const addTransformButton = page.getByRole("button", { name: /add transform/i });
    await expect(addTransformButton).toBeVisible({ timeout: 5000 });
    await addTransformButton.click();

    // Select "String Operation" from the dropdown menu
    const stringOpItem = page.getByRole("menuitem", { name: /string operation/i });
    await expect(stringOpItem).toBeVisible({ timeout: 5000 });
    await stringOpItem.click();

    // The transform should now appear in the list with "Incomplete" badge
    // Wait for dropdown to close, then find "String Operation" in the transform card (not the menu)
    await expect(page.locator(".rounded-lg.border.p-3").getByText("String Operation")).toBeVisible({ timeout: 5000 });

    // The editor should open automatically (editingId is set to the new transform)
    // Configure: select "title" as the source field via the "Source Field" Radix Select
    const sourceFieldTrigger = page.locator("#from");
    await expect(sourceFieldTrigger).toBeVisible({ timeout: 5000 });
    await sourceFieldTrigger.click();

    // Select "title" from the source field dropdown
    const titleOption = page.getByRole("option", { name: "title", exact: true });
    await expect(titleOption).toBeVisible({ timeout: 5000 });
    await titleOption.click();

    // Configure: select "uppercase" as the operation
    const operationTrigger = page.locator("#operation");
    await expect(operationTrigger).toBeVisible({ timeout: 5000 });
    await operationTrigger.click();

    const uppercaseOption = page.getByRole("option", { name: /uppercase/i });
    await expect(uppercaseOption).toBeVisible({ timeout: 5000 });
    await uppercaseOption.click();

    // Verify the summary line updated (shows the configured state)
    await expect(page.getByText(/apply uppercase to title/i)).toBeVisible({ timeout: 5000 });
  }

  test("inline transform should persist through flow editor round-trip", async ({ page }) => {
    test.setTimeout(180000);

    const uniqueId = Date.now();
    const catalogName = `E2E Real Transform RT ${uniqueId}`;

    // Navigate to step 4
    await navigateToFieldMapping(page, catalogName);

    // Verify no transforms initially
    await expect(page.getByText("No transforms configured")).toBeVisible({ timeout: 5000 });

    // Add an uppercase transform via real UI interactions
    await addUppercaseTransformViaUI(page);

    // Open the visual editor
    const visualEditorButton = page.getByRole("button", { name: /open visual editor/i });
    await expect(visualEditorButton).toBeVisible({ timeout: 10000 });
    await visualEditorButton.click();

    // Wait for the flow editor to fully load
    await expect(page.getByText("Visual Field Mapping")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Source Column").first()).toBeVisible({ timeout: 10000 });

    // Verify the transform node appears in the flow editor canvas
    const transformNode = page.locator(".react-flow__node-transform");
    await expect(transformNode).toBeVisible({ timeout: 10000 });

    // The transform node should show "uppercase" as the summary text
    await expect(transformNode.getByText("uppercase")).toBeVisible({ timeout: 5000 });

    // Verify the transform node is wired with edges (source -> transform -> target)
    const edges = page.locator(".react-flow__edge");
    await expect(edges.first()).toBeVisible({ timeout: 5000 });
    const edgeCount = await edges.count();
    // At minimum: source->transform edge + transform->target edge + other auto-detected edges
    expect(edgeCount).toBeGreaterThanOrEqual(2);

    // Click "Apply & Return" to go back to the wizard
    const saveButton = page.getByRole("button", { name: /apply.*return/i });
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await saveButton.click();

    // Should be back on the field mapping step
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });

    // Verify the transform is still present in the inline TransformList after the round-trip
    // Wait for dropdown to close, then find "String Operation" in the transform card (not the menu)
    await expect(page.locator(".rounded-lg.border.p-3").getByText("String Operation")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/apply uppercase to title/i)).toBeVisible({ timeout: 5000 });
  });

  test("inline transform should reach the import API", async ({ page }) => {
    test.setTimeout(180000);

    const uniqueId = Date.now();
    const catalogName = `E2E Real Transform API ${uniqueId}`;

    // Navigate to step 4
    await navigateToFieldMapping(page, catalogName);

    // Add an uppercase transform via real UI interactions
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
      if (request.url().includes("/api/import/configure") && request.method() === "POST") {
        capturedRequestBody = request.postDataJSON() as Record<string, unknown>;
      }
    });

    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/import/configure"), {
      timeout: 15000,
    });

    // Click "Start Import"
    const startImportButton = page.getByRole("button", { name: /start import/i });
    await expect(startImportButton).toBeVisible({ timeout: 5000 });
    await startImportButton.click();

    // Wait for the configure API response
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Verify the transforms payload was sent in the API request
    expect(capturedRequestBody).not.toBeNull();
    const transforms = capturedRequestBody!.transforms as Array<{
      sheetIndex: number;
      transforms: Array<Record<string, unknown>>;
    }>;
    expect(transforms).toBeDefined();
    expect(transforms).toHaveLength(1);
    expect(transforms[0]!.sheetIndex).toBe(0);
    expect(transforms[0]!.transforms).toHaveLength(1);

    // Verify the transform details match what we configured via the UI
    const transform = transforms[0]!.transforms[0]!;
    expect(transform.type).toBe("string-op");
    expect(transform.operation).toBe("uppercase");
    expect(transform.from).toBe("title");
    expect(transform.active).toBe(true);

    // Wait for import to complete
    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 120000 });

    // Verify events were created with uppercased titles
    const eventsResponse = await page.request.get("/api/events", { params: { limit: "10", sort: "-createdAt" } });
    expect(eventsResponse.ok()).toBe(true);

    const eventsData = await eventsResponse.json();
    const events = eventsData.docs as Array<{ data: Record<string, unknown> }>;

    // All imported events should have uppercase titles
    const uppercasedEvents = events.filter(
      (e) => typeof e.data?.title === "string" && e.data.title === (e.data.title as string).toUpperCase()
    );
    expect(uppercasedEvents.length).toBeGreaterThan(0);

    // Verify a specific title is uppercased (from valid-events.csv)
    const techEvent = events.find(
      (e) => typeof e.data?.title === "string" && (e.data.title as string).includes("TECH CONFERENCE")
    );
    expect(techEvent).toBeDefined();
  });
});
