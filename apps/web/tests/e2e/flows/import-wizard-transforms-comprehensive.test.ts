/**
 * Comprehensive E2E test for transform interactions in the import wizard.
 *
 * One test, many actions — verifies the full transform lifecycle:
 * 1. Add uppercase transform via inline editor
 * 2. Verify transform chip appears
 * 3. Verify preview table reflects the transform
 * 4. Add a rename transform
 * 5. Verify both transforms show in the column
 * 6. Open visual flow editor — verify transforms appear as nodes
 * 7. Return to wizard — verify transforms survived round-trip
 * 8. Remove a transform via confirmation dialog
 * 9. Verify preview updates after removal
 * 10. Submit import and verify transforms reach the API
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

test.describe("Import Wizard - Comprehensive Transform Test", () => {
  test.describe.configure({ mode: "serial" });

  let importPage: ImportPage;

  test.beforeEach(({ page }) => {
    importPage = new ImportPage(page);
  });

  /** Navigate through upload + dataset selection to reach field mapping (Step 4). */
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

  test("full transform lifecycle: add, preview, flow editor, remove, submit", async ({ page }) => {
    test.setTimeout(180000);

    const uniqueId = Date.now();
    const catalogName = `E2E Transforms ${uniqueId}`;

    // ── Step 4: Field Mapping ──
    await navigateToFieldMapping(page, catalogName);

    // Find the "title" column row
    const titleRow = page.locator("tr").filter({ hasText: "title" }).first();

    // ── 1. Verify no transforms initially ──
    await expect(titleRow.getByText("Uppercase")).not.toBeVisible();

    // ── 2. Add uppercase transform via UI ──
    const addButton = titleRow.getByRole("button", { name: /add transform/i });
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    const stringOpItem = page.getByRole("menuitem", { name: /string operation/i });
    await expect(stringOpItem).toBeVisible({ timeout: 5000 });
    await stringOpItem.click();

    // Transform chip should appear (default operation is "uppercase")
    await expect(titleRow.getByText("Uppercase")).toBeVisible({ timeout: 5000 });

    // ── 3. Expand editor, verify Save/Cancel buttons ──
    await titleRow.getByText("Uppercase").click();
    const saveButton = page.getByRole("button", { name: /save/i }).first();
    const cancelButton = page.getByRole("button", { name: /cancel/i }).first();
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await expect(cancelButton).toBeVisible({ timeout: 5000 });

    // Save and collapse
    await saveButton.click();

    // ── 4. Verify preview table shows uppercased values ──
    // Take a full-page screenshot to see the current state
    await page.screenshot({ path: "test-results/preview-after-transform.png", fullPage: true });

    // The preview table at the bottom should show transformed (uppercased) data
    const fullPageContent = await page.content();
    expect(fullPageContent).toContain("TECH CONFERENCE 2024");

    // ── 5. Add a rename transform to "description" column ──
    const descRow = page.locator("tr").filter({ hasText: "description" }).first();
    const descAddButton = descRow.getByRole("button", { name: /add transform/i });
    await expect(descAddButton).toBeVisible({ timeout: 5000 });
    await descAddButton.click();

    const renameItem = page.getByRole("menuitem", { name: /rename field/i });
    await expect(renameItem).toBeVisible({ timeout: 5000 });
    await renameItem.click();

    // Rename chip should appear
    await expect(descRow.getByText(/rename/i)).toBeVisible({ timeout: 5000 });

    // ── 6. Open visual flow editor ──
    const visualEditorButton = page.getByRole("button", { name: /open visual editor/i });
    await expect(visualEditorButton).toBeVisible({ timeout: 10000 });
    await visualEditorButton.click();

    // Wait for flow editor to load
    await expect(page.getByText("Visual Field Mapping")).toBeVisible({ timeout: 15000 });

    // Verify transform nodes exist in the flow editor
    const transformNodes = page.locator(".react-flow__node-transform");
    await expect(transformNodes.first()).toBeVisible({ timeout: 10000 });
    const nodeCount = await transformNodes.count();
    expect(nodeCount).toBeGreaterThanOrEqual(1);

    // ── 7. Return to wizard ──
    const applyButton = page.getByRole("button", { name: /apply.*return/i });
    await expect(applyButton).toBeVisible({ timeout: 5000 });
    await applyButton.click();

    // Back on field mapping step
    await expect(page.getByRole("heading", { name: /map your fields/i })).toBeVisible({ timeout: 10000 });

    // ── 8. Verify transforms survived the round-trip ──
    const titleRowAfter = page.locator("tr").filter({ hasText: "title" }).first();
    await expect(titleRowAfter.getByText("Uppercase")).toBeVisible({ timeout: 5000 });

    // ── 9. Remove the rename transform via confirmation dialog ──
    const descRowAfter = page.locator("tr").filter({ hasText: "description" }).first();
    const renameChip = descRowAfter.getByText(/rename/i).first();
    if (await renameChip.isVisible()) {
      // Click the × button on the rename chip
      const removeButton = descRowAfter.getByRole("button", { name: /remove transform/i });
      await removeButton.click();

      // Confirmation dialog should appear
      const confirmButton = page.getByRole("button", { name: /confirm/i });
      await expect(confirmButton).toBeVisible({ timeout: 5000 });
      await confirmButton.click();

      // Rename chip should be gone
      await expect(descRowAfter.getByText(/rename/i)).not.toBeVisible({ timeout: 5000 });
    }

    // ── 10. Verify preview still shows uppercase (only rename was removed) ──
    await expect(page.getByText("TECH CONFERENCE 2024").first()).toBeVisible({ timeout: 5000 });

    // ── 11. Verify ID preview column exists ──
    const idHeader = page.getByRole("columnheader", { name: "ID" });
    await expect(idHeader).toBeVisible({ timeout: 5000 });

    // ── 12. Submit and verify transforms reach the API ──
    const continueButton = page.getByRole("button", { name: /continue to review/i });
    await expect(continueButton).toBeVisible({ timeout: 5000 });
    await continueButton.click();

    // Step 5: Review
    await expect(page.getByRole("heading", { name: /review your import/i })).toBeVisible({ timeout: 10000 });

    // Intercept the configure API call
    let capturedTransforms: Array<Record<string, unknown>> | null = null;
    page.on("request", (request) => {
      if (request.url().includes("/api/import/configure") && request.method() === "POST") {
        const body = request.postDataJSON() as Record<string, unknown>;
        const transforms = body.transforms as Array<{ transforms: Array<Record<string, unknown>> }>;
        capturedTransforms = transforms?.[0]?.transforms ?? null;
      }
    });

    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/import/configure"), {
      timeout: 15000,
    });

    // Start import
    const startImportButton = page.getByRole("button", { name: /start import/i });
    await expect(startImportButton).toBeVisible({ timeout: 5000 });
    await startImportButton.click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Capture dataset ID from the configure response for scoped queries
    const responseBody = await response.json();
    const datasetId = responseBody.datasets?.["0"] as number | undefined;
    expect(datasetId).toBeDefined();

    // Verify only the uppercase transform was sent (rename was removed)
    expect(capturedTransforms).not.toBeNull();
    expect(capturedTransforms).toHaveLength(1);
    expect(capturedTransforms![0]!.type).toBe("string-op");
    expect(capturedTransforms![0]!.operation).toBe("uppercase");
    expect(capturedTransforms![0]!.from).toBe("title");

    // ── 13. Wait for import to complete ──
    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 120000 });

    // ── 14. Verify stage timeline is visible on completion ──
    const stageTimeline = page.getByText(/creating events/i);
    await expect(stageTimeline).toBeVisible({ timeout: 5000 });

    // ── 15. Verify events have uppercased titles — scoped to this import's dataset ──
    const eventsResponse = await page.request.get("/api/events", {
      params: { limit: "10", sort: "-createdAt", "where[dataset][equals]": String(datasetId) },
    });
    expect(eventsResponse.ok()).toBe(true);

    const eventsData = await eventsResponse.json();
    const events = eventsData.docs as Array<{ data: Record<string, unknown> }>;

    const uppercasedEvents = events.filter(
      (e) => typeof e.data?.title === "string" && e.data.title === e.data.title.toUpperCase()
    );
    expect(uppercasedEvents.length).toBeGreaterThan(0);
  });
});
