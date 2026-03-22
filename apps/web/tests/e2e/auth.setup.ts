/**
 * Playwright auth setup - logs in once and saves storage state for reuse.
 *
 * This runs before all test files that depend on the "setup" project,
 * so authenticated tests skip the login UI flow entirely.
 *
 * @module
 * @category E2E Setup
 */
import { expect, test as setup } from "./fixtures";
import { IngestPage } from "./pages/ingest.page";

const AUTH_FILE = "test-results/.auth/admin.json";

setup("authenticate as admin", async ({ page, baseURL }) => {
  // Verify login works via API first (faster feedback than UI)
  const apiLogin = await page.request.post(`${baseURL}/api/users/login`, {
    data: { email: "admin@example.com", password: "admin123" },
    headers: { "Content-Type": "application/json" },
  });
  if (apiLogin.status() !== 200) {
    const body = await apiLogin.text();
    throw new Error(`Auth setup: API login failed (${apiLogin.status()}): ${body}`);
  }

  const ingestPage = new IngestPage(page);
  await ingestPage.goto();
  await ingestPage.waitForWizardLoad();
  await ingestPage.login("admin@example.com", "admin123");

  // Verify we're authenticated by checking for upload heading
  const uploadHeading = page.getByRole("heading", { name: /upload your data/i });
  await expect(uploadHeading).toBeVisible({ timeout: 5000 });

  // Save signed-in state (cookies + localStorage)
  await page.context().storageState({ path: AUTH_FILE });
});
