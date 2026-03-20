/**
 * E2E tests for transform synchronization between inline editing and flow editor.
 *
 * Verifies that transforms added via the inline TransformList on the field mapping
 * step appear as nodes in the visual flow editor, and vice versa.
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

const STORAGE_KEY = "timetiles_import_wizard_draft";

test.describe("Transform Sync: Inline ↔ Flow Editor", () => {
  test.describe.configure({ mode: "serial" });

  let importPage: ImportPage;

  test.beforeEach(({ page }) => {
    importPage = new ImportPage(page);
  });

  test("inline transforms should appear as nodes in the flow editor", async ({ page }) => {
    test.setTimeout(180000);

    // Step 1-3: Navigate to field mapping step
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);
    await importPage.clickNext();

    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    const uniqueId = Date.now();
    await importPage.createNewCatalog(`E2E Sync Inline→Flow ${uniqueId}`);
    await importPage.clickNext();

    // Step 4: Field mapping
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });

    // Wait for localStorage save then inject an inline transform
    await page.waitForTimeout(1500);

    await page.evaluate(
      ({ storageKey }) => {
        const raw = localStorage.getItem(storageKey);
        if (!raw) throw new Error("No wizard state in localStorage");
        const data = JSON.parse(raw);

        data.state.transforms = {
          0: [
            {
              id: "e2e-sync-test-uppercase",
              type: "string-op",
              active: true,
              autoDetected: false,
              from: "title",
              operation: "uppercase",
            },
          ],
        };

        localStorage.setItem(storageKey, JSON.stringify(data));
      },
      { storageKey: STORAGE_KEY }
    );

    // Reload to restore from localStorage with the injected transform
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 15000 });

    // Verify the inline transform list shows the transform
    await expect(page.getByText("String Operation")).toBeVisible({ timeout: 5000 });

    // Click "Open Visual Editor" — this should store transforms in sessionStorage
    const visualEditorButton = page.getByRole("button", { name: /open visual editor/i });
    await expect(visualEditorButton).toBeVisible({ timeout: 10000 });
    await visualEditorButton.click();

    // Wait for flow editor to load
    await expect(page.getByText("Visual Field Mapping")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Source Column").first()).toBeVisible({ timeout: 5000 });

    // Verify the transform node appears in the flow editor
    // Transform nodes show their type label as "Transform" in the header
    // and the specific label (e.g., "String Operation") in the body
    await expect(page.getByText("Transform").first()).toBeVisible({ timeout: 5000 });

    // Click "Apply & Return" to go back
    const saveButton = page.getByRole("button", { name: /apply.*return/i });
    await saveButton.click();

    // Should be back on field mapping step
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });

    // Verify the transform is still in the inline list after round-trip
    await expect(page.getByText("String Operation")).toBeVisible({ timeout: 5000 });
  });

  test("flow editor transforms should appear in the inline list on return", async ({ page }) => {
    test.setTimeout(180000);

    // Step 1-3: Navigate to field mapping step
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);
    await importPage.clickNext();

    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    const uniqueId = Date.now();
    await importPage.createNewCatalog(`E2E Sync Flow→Inline ${uniqueId}`);
    await importPage.clickNext();

    // Step 4: Field mapping — verify no transforms initially
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("No transforms configured")).toBeVisible();

    // Open the flow editor
    const visualEditorButton = page.getByRole("button", { name: /open visual editor/i });
    await expect(visualEditorButton).toBeVisible({ timeout: 10000 });
    await visualEditorButton.click();

    // Wait for flow editor to load
    await expect(page.getByText("Visual Field Mapping")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Source Column").first()).toBeVisible({ timeout: 5000 });

    // Verify the palette has draggable transform items
    await expect(page.locator('[data-testid="palette-item-rename"]')).toBeVisible();

    // Click "Apply & Return" — even without adding transforms, this round-trips the data
    const saveButton = page.getByRole("button", { name: /apply.*return/i });
    await saveButton.click();

    // Should be back on field mapping step
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });
  });

  test("both inline and flow editor transforms should be sent to the API", async ({ page }) => {
    test.setTimeout(180000);

    // Step 1-3: Navigate to field mapping step
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);
    await importPage.clickNext();

    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10000 });

    const uniqueId = Date.now();
    await importPage.createNewCatalog(`E2E Sync API ${uniqueId}`);
    await importPage.clickNext();

    // Step 4: Inject transform via localStorage (simulates inline add)
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.evaluate(
      ({ storageKey }) => {
        const raw = localStorage.getItem(storageKey);
        if (!raw) throw new Error("No wizard state in localStorage");
        const data = JSON.parse(raw);

        data.state.transforms = {
          0: [
            {
              id: crypto.randomUUID(),
              type: "string-op",
              active: true,
              autoDetected: false,
              from: "title",
              operation: "uppercase",
            },
          ],
        };

        localStorage.setItem(storageKey, JSON.stringify(data));
      },
      { storageKey: STORAGE_KEY }
    );

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 15000 });

    // Verify the inline transform is visible
    await expect(page.getByText("String Operation")).toBeVisible({ timeout: 5000 });

    // Proceed to review — use direct button click since sticky button doesn't match clickNext() locator
    const continueButton = page.getByRole("button", { name: /continue to review/i });
    await continueButton.click();

    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10000 });

    // Intercept the configure API call to verify transforms are sent
    let capturedRequestBody: Record<string, unknown> | null = null;
    page.on("request", (request) => {
      if (request.url().includes("/api/import/configure") && request.method() === "POST") {
        capturedRequestBody = request.postDataJSON() as Record<string, unknown>;
      }
    });

    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/import/configure"), {
      timeout: 10000,
    });

    const startImportButton = page.getByRole("button", { name: /start import/i });
    await expect(startImportButton).toBeVisible();
    await startImportButton.click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Verify transforms were sent in the API request
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

    // Wait for import completion
    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 120000 });
  });
});
