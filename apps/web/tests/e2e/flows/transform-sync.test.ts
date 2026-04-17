/**
 * E2E tests for transform synchronization between inline editing and flow editor.
 *
 * Verifies that transforms added via the column-centric table on the field mapping
 * step appear as nodes in the visual flow editor, and vice versa.
 * Uses only real UI interactions — no localStorage injection.
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

test.describe("Transform Sync: Inline ↔ Flow Editor", () => {
  test.describe.configure({ mode: "serial" });

  let importPage: IngestPage;

  test.beforeEach(({ page }) => {
    importPage = new IngestPage(page);
  });

  /** Navigate through upload + dataset selection to reach step 4. */
  const navigateToFieldMapping = async (page: Page, catalogName: string) => {
    await importPage.goto();
    await importPage.waitForWizardLoad();

    const csvPath = path.join(FIXTURES_PATH, "valid-events.csv");
    await importPage.uploadFile(csvPath);
    await importPage.clickNext();

    await expect(page.getByRole("heading", { name: /select destination/i })).toBeVisible({ timeout: 10000 });
    await importPage.createNewCatalog(catalogName);
    await importPage.clickNext();

    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });
  };

  /** Add an uppercase transform on the "title" column via the column table UI. */
  const addUppercaseTransformViaUI = async (page: Page) => {
    const titleRow = page.locator("tr").filter({ hasText: "title" }).first();
    const addButton = titleRow.getByRole("button", { name: /add transform/i });
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    const stringOpItem = page.getByRole("menuitem", { name: /string operation/i });
    await expect(stringOpItem).toBeVisible({ timeout: 5000 });
    await stringOpItem.click();

    // Default operation is "uppercase" — verify chip shows
    await expect(titleRow.getByText("Uppercase")).toBeVisible({ timeout: 5000 });
  };

  test("inline transforms should appear as nodes in the flow editor", async ({ page }) => {
    test.setTimeout(180000);

    const uniqueId = Date.now();
    await navigateToFieldMapping(page, `E2E Sync Inline→Flow ${uniqueId}`);

    // Add uppercase transform on title column via real UI
    await addUppercaseTransformViaUI(page);

    // Open visual editor
    const visualEditorButton = page.getByRole("button", { name: /open visual editor/i });
    await expect(visualEditorButton).toBeVisible({ timeout: 10000 });
    await visualEditorButton.click();

    // Wait for flow editor to fully load
    await expect(page.getByText("Visual Field Mapping")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Source Column").first()).toBeVisible({ timeout: 10000 });

    // Verify the transform node appears with correct content
    await expect(page.locator(".react-flow__node-transform")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".react-flow__node-transform").getByText("uppercase")).toBeVisible({ timeout: 5000 });

    // Verify edges are connected
    const edges = page.locator(".react-flow__edge");
    await expect(edges.first()).toBeVisible({ timeout: 5000 });
    const edgeCount = await edges.count();
    expect(edgeCount).toBeGreaterThanOrEqual(2);

    // Click "Apply & Return"
    const saveButton = page.getByRole("button", { name: /apply.*return/i });
    await saveButton.click();

    // Back on step 4 — verify transform chip persists
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });
    const titleRowAfterRT = page.locator("tr").filter({ hasText: "title" }).first();
    await expect(titleRowAfterRT.getByText("Uppercase")).toBeVisible({ timeout: 5000 });
  });

  test("inline transforms should be sent to the import API", async ({ page }) => {
    test.setTimeout(180000);

    const uniqueId = Date.now();
    await navigateToFieldMapping(page, `E2E Sync API ${uniqueId}`);

    // Add uppercase transform via real UI
    await addUppercaseTransformViaUI(page);

    // Proceed to review
    const continueButton = page.getByRole("button", { name: /continue to review/i });
    await continueButton.click();

    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10000 });

    // Intercept the configure API call
    let capturedRequestBody: Record<string, unknown> | null = null;
    page.on("request", (request) => {
      if (request.url().includes("/api/ingest/configure") && request.method() === "POST") {
        capturedRequestBody = request.postDataJSON() as Record<string, unknown>;
      }
    });

    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/ingest/configure"), {
      timeout: 10000,
    });

    const startImportButton = page.getByRole("button", { name: /start import/i });
    await expect(startImportButton).toBeVisible();
    await startImportButton.click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Capture dataset ID from the configure response for scoped queries
    const responseBody = await response.json();
    const datasetId = responseBody.datasets?.["0"] as number | undefined;
    expect(datasetId).toBeDefined();

    // Verify transforms were sent
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

    // Verify the transform was actually applied to imported events — scoped to this dataset
    const eventsResponse = await page.request.get("/api/events", {
      params: { limit: "10", sort: "-createdAt", "where[dataset][equals]": String(datasetId) },
    });
    expect(eventsResponse.ok()).toBe(true);

    const eventsData = await eventsResponse.json();
    const events = eventsData.docs as Array<{ transformedData: Record<string, unknown> }>;
    expect(events.length).toBeGreaterThan(0);

    // All events should have uppercase titles (transform was applied)
    const uppercasedEvents = events.filter(
      (e) =>
        typeof e.transformedData?.title === "string" &&
        e.transformedData.title === e.transformedData.title.toUpperCase()
    );
    expect(uppercasedEvents.length).toBe(events.length);
  });
});
