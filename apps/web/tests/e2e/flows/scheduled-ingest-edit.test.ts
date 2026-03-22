/**
 * E2E test for the scheduled ingest create → trigger → edit → trigger flow.
 *
 * Creates a scheduled ingest via the wizard (URL source), triggers it twice,
 * then edits via the wizard and triggers once more.
 *
 * ## TODO — Known issues preventing full E2E pass (2026-03-22)
 *
 * This test is structurally correct — all 9 steps have individually passed across
 * different runs (7/9 in best single run). Three pre-existing infrastructure issues
 * prevent a reliable full pass:
 *
 * ### 1. Import pipeline stalls in multi-process E2E setup
 * The import pipeline (dataset-detection → analyze-duplicates → schema-detection → ...)
 * works correctly in single-process integration tests (see analyze-duplicates-pipeline.test.ts)
 * but stalls in the E2E setup where the Next.js server and job worker are separate processes.
 * The analyze-duplicates job sometimes fails with `hasError: true` in the worker process,
 * likely due to:
 * - File path resolution differences between server and worker processes
 * - Transaction isolation: the worker's `payload.jobs.run()` may not see data committed
 *   by the server's request transaction
 * - The `StageTransitionService.processStageTransition()` at `lib/import/stage-transition.ts:109`
 *   calls `payload.jobs.queue()` without passing `req`, which may affect transaction visibility
 *
 * ### 2. Auth setup flake (intermittent 401)
 * The auth.setup.ts sometimes gets 401 "incorrect email/password" even though seed data is
 * correct. Root cause: `next build` (called before seed in the original code) connects to the
 * DB and can wipe seeded data. PARTIALLY FIXED: seed now runs after build. But timing issues
 * between seed commit and server readiness can still cause 401 on cold starts.
 *
 * ### 3. Slow job pipeline (~30s per pipeline step)
 * Each chained job in the import pipeline takes ~30s to be picked up by the worker.
 * With 7 pipeline steps, total time is ~3.5 minutes for a 3-row CSV. The 300s timeout
 * is borderline. This is caused by Payload's job transaction handling where chained jobs
 * queued inside `afterChange` hooks aren't immediately visible to the next `jobs.run()` call.
 *
 * ### Recommended fixes (in priority order):
 * 1. Investigate why `analyze-duplicates` fails in the worker process but not in integration
 *    tests. Compare file access patterns and transaction isolation between single-process
 *    and multi-process setups.
 * 2. Add a mock geocoding provider to the E2E seed so imports with location columns work.
 * 3. Consider passing `req` through the stage transition service to keep chained jobs in
 *    the same transaction context.
 * 4. Add retry logic to the worker for failed jobs (Payload's `retries` config on job tasks).
 *
 * @module
 * @category E2E Tests
 */
import type { APIRequestContext } from "@playwright/test";

import { TEST_CREDENTIALS, TEST_EMAILS } from "../../constants/test-credentials";
import { expect, test } from "../fixtures";
import { IngestPage } from "../pages/ingest.page";

test.describe("scheduled ingest - Create, Run, Edit, Run", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  let token: string;
  let baseUrl: string;
  let scheduledIngestId: number;
  let ingestPage: IngestPage;

  // CSV served by the Next.js server via public/test-fixtures/
  const csvPath = "/api/test-fixtures";

  test("setup: login and get auth token", async ({ request, baseURL }) => {
    baseUrl = baseURL;

    const loginResponse = await request.post(`${baseURL}/api/users/login`, {
      data: { email: TEST_EMAILS.admin, password: TEST_CREDENTIALS.seed.admin },
      headers: { "Content-Type": "application/json" },
    });
    expect(loginResponse.status()).toBe(200);

    const body = await loginResponse.json();
    token = body.token;
  });

  test("step 1: create scheduled ingest via wizard", async ({ page }) => {
    test.setTimeout(180_000);
    ingestPage = new IngestPage(page);

    const uniqueId = Date.now();
    const catalogName = `E2E Schedule ${uniqueId}`;
    const csvUrl = `${baseUrl}${csvPath}`;

    // Navigate to wizard
    await ingestPage.goto();
    await ingestPage.waitForWizardLoad();

    // Switch to URL tab
    const urlTab = page.getByRole("tab", { name: /from url|url/i });
    await urlTab.click();

    // Enter URL and fetch
    const urlInput = page.locator("#source-url");
    await urlInput.fill(csvUrl);
    const fetchButton = page.getByRole("button", { name: /fetch/i });
    await fetchButton.click();

    // Wait for preview
    const fileReady = page.getByText(/url data ready|ready|detected/i).first();
    await expect(fileReady).toBeVisible({ timeout: 20_000 });

    // Continue to dataset selection
    await ingestPage.clickNext();
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10_000 });

    // Create new catalog
    await ingestPage.createNewCatalog(catalogName);

    // Continue to field mapping
    await ingestPage.clickNext();
    const fieldMappingHeading = page.getByRole("heading", { name: /map your fields/i });
    await expect(fieldMappingHeading).toBeVisible({ timeout: 10_000 });

    // Continue to schedule step (step 5 — shown for URL imports)
    await ingestPage.clickNext();
    const scheduleHeading = page.getByRole("heading", { name: /schedule import/i });
    await expect(scheduleHeading).toBeVisible({ timeout: 10_000 });

    // Enable scheduling — click "One-time" button to toggle to scheduled mode
    // The button has aria-label for accessibility, so match by visible text
    const scheduleToggle = page.locator("button", { hasText: /^One-time$/ });
    await expect(scheduleToggle).toBeVisible({ timeout: 5_000 });
    await scheduleToggle.click();

    // Fill schedule name
    const scheduleName = page.locator("#schedule-name");
    await scheduleName.clear();
    await scheduleName.fill(`Test Schedule ${uniqueId}`);

    // Continue to review
    await ingestPage.clickNext();
    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10_000 });

    // Scroll down to see schedule summary and start button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Intercept configure response
    const responsePromise = page.waitForResponse((resp) => resp.url().includes("/api/ingest/configure"), {
      timeout: 15_000,
    });

    // Start import
    const startButton = page.getByRole("button", { name: /start import/i });
    await startButton.click();

    const response = await responsePromise;
    const responseBody = await response.json();
    expect(response.status()).toBe(200);
    expect(responseBody.scheduledIngestId).toBeDefined();
    scheduledIngestId = responseBody.scheduledIngestId;

    // Wait for import to complete — pipeline processes jobs sequentially with gaps
    const completionIndicator = page.getByText(/import complete/i);
    await expect(completionIndicator).toBeVisible({ timeout: 300_000 });
  });

  test("step 2: trigger first manual run", async ({ request }) => {
    expect(scheduledIngestId).toBeDefined();

    const triggerResponse = await request.post(`${baseUrl}/api/scheduled-ingests/${scheduledIngestId}/trigger`, {
      headers: { Authorization: `JWT ${token}` },
    });
    expect(triggerResponse.status()).toBe(200);

    // Wait for the job to complete by polling lastStatus
    await expectScheduleStatus(request, "success", 60_000);
  });

  test("step 3: trigger second manual run", async ({ request }) => {
    expect(scheduledIngestId).toBeDefined();

    const triggerResponse = await request.post(`${baseUrl}/api/scheduled-ingests/${scheduledIngestId}/trigger`, {
      headers: { Authorization: `JWT ${token}` },
    });
    expect(triggerResponse.status()).toBe(200);

    await expectScheduleStatus(request, "success", 60_000);
  });

  test("step 4: verify schedule ran successfully", async ({ request }) => {
    const response = await request.get(`${baseUrl}/api/scheduled-ingests/${scheduledIngestId}`, {
      headers: { Authorization: `JWT ${token}` },
    });
    expect(response.status()).toBe(200);

    const schedule = await response.json();
    // Should have run at least 2 times (trigger 1 + trigger 2, plus the initial wizard import)
    expect(schedule.statistics?.successfulRuns).toBeGreaterThanOrEqual(2);
  });

  test("step 5: edit scheduled ingest via wizard", async ({ page }) => {
    test.setTimeout(180_000);
    ingestPage = new IngestPage(page);

    // Navigate to schedules page
    await page.goto("/account/schedules", { waitUntil: "domcontentloaded" });

    // Find and click the Edit button
    const editButton = page.getByTitle(/edit schedule/i).first();
    await expect(editButton).toBeVisible({ timeout: 10_000 });
    await editButton.click();

    // Should navigate to wizard in edit mode
    await page.waitForURL(/\/import\?edit=\d+/, { timeout: 10_000 });

    // Wizard should show edit mode indicator
    const editIndicator = page.getByText(/editing/i);
    await expect(editIndicator).toBeVisible({ timeout: 15_000 });

    // Upload step: URL should be pre-filled, need to re-fetch
    const urlInput = page.locator("#source-url");
    await expect(urlInput).toBeVisible({ timeout: 10_000 });
    const urlValue = await urlInput.inputValue();
    expect(urlValue).toContain(csvPath);

    // Click Fetch to regenerate preview
    const fetchButton = page.getByRole("button", { name: /fetch/i });
    await fetchButton.click();

    const fileReady = page.getByText(/url data ready|ready|detected/i).first();
    await expect(fileReady).toBeVisible({ timeout: 20_000 });

    // Continue through steps (all should be pre-filled)
    // Step 3: Dataset selection
    await ingestPage.clickNext();
    const destinationHeading = page.getByRole("heading", { name: /select destination/i });
    await expect(destinationHeading).toBeVisible({ timeout: 10_000 });

    // Step 4: Field mapping
    await ingestPage.clickNext();
    const fieldMappingHeading = page.getByRole("heading", { name: /map your fields/i });
    await expect(fieldMappingHeading).toBeVisible({ timeout: 10_000 });

    // Step 5: Schedule (should be pre-filled, no one-time toggle in edit mode)
    await ingestPage.clickNext();
    const scheduleHeading = page.getByRole("heading", { name: /schedule import/i });
    await expect(scheduleHeading).toBeVisible({ timeout: 10_000 });

    // One-time toggle should NOT be visible in edit mode
    const oneTimeButton = page.getByRole("button", { name: /one-time/i });
    await expect(oneTimeButton).not.toBeVisible();

    // Change schedule name
    const scheduleName = page.locator("#schedule-name");
    await scheduleName.clear();
    await scheduleName.fill(`Updated Schedule ${Date.now()}`);

    // Continue to review
    await ingestPage.clickNext();
    const reviewHeading = page.getByRole("heading", { name: /review your import/i });
    await expect(reviewHeading).toBeVisible({ timeout: 10_000 });

    // Should show Update Schedule button (not Start Import)
    const updateButton = page.getByRole("button", { name: /update schedule/i });
    await expect(updateButton).toBeVisible();

    // Should NOT show Start Import
    const startButton = page.getByRole("button", { name: /start import/i });
    await expect(startButton).not.toBeVisible();

    // Intercept the update API call
    const updateResponsePromise = page.waitForResponse((resp) => resp.url().includes("/api/ingest/update-schedule"), {
      timeout: 15_000,
    });

    // Click Update Schedule
    await updateButton.click();

    const updateResponse = await updateResponsePromise;
    expect(updateResponse.status()).toBe(200);

    // Should redirect to schedules page
    await page.waitForURL(/\/account\/schedules/, { timeout: 15_000 });
  });

  test("step 6: trigger post-edit run", async ({ request }) => {
    expect(scheduledIngestId).toBeDefined();

    const triggerResponse = await request.post(`${baseUrl}/api/scheduled-ingests/${scheduledIngestId}/trigger`, {
      headers: { Authorization: `JWT ${token}` },
    });
    expect(triggerResponse.status()).toBe(200);

    await expectScheduleStatus(request, "success", 60_000);
  });

  test("step 7: verify updated schedule name and successful runs", async ({ request }) => {
    const response = await request.get(`${baseUrl}/api/scheduled-ingests/${scheduledIngestId}`, {
      headers: { Authorization: `JWT ${token}` },
    });
    expect(response.status()).toBe(200);

    const schedule = await response.json();
    expect(schedule.name).toMatch(/Updated Schedule/);
    // At least 3 successful runs: trigger 1, trigger 2, post-edit trigger
    expect(schedule.statistics?.successfulRuns).toBeGreaterThanOrEqual(3);
  });

  test("cleanup: delete scheduled ingest", async ({ request }) => {
    if (scheduledIngestId) {
      await request.delete(`${baseUrl}/api/scheduled-ingests/${scheduledIngestId}`, {
        headers: { Authorization: `JWT ${token}` },
      });
    }
  });

  // Helper: poll lastStatus until it matches expected value or timeout
  const expectScheduleStatus = async (apiRequest: APIRequestContext, expectedStatus: string, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const resp = await apiRequest.get(`${baseUrl}/api/scheduled-ingests/${scheduledIngestId}`, {
        headers: { Authorization: `JWT ${token}` },
      });
      const data = await resp.json();
      if (data.lastStatus === expectedStatus) return;
      if (data.lastStatus === "failed") {
        throw new Error(`Schedule run failed: ${data.lastError}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error(`Schedule did not reach status "${expectedStatus}" within ${timeoutMs}ms`);
  };
});
