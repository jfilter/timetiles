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
import { ImportPage } from "./pages/import.page";

const AUTH_FILE = "test-results/.auth/admin.json";

setup("authenticate as admin", async ({ page }) => {
  const importPage = new ImportPage(page);
  await importPage.goto();
  await importPage.waitForWizardLoad();
  await importPage.login("admin@example.com", "admin123");

  // Verify we're authenticated by checking for upload heading
  const uploadHeading = page.getByRole("heading", { name: /upload your data/i });
  await expect(uploadHeading).toBeVisible({ timeout: 5000 });

  // Save signed-in state (cookies + localStorage)
  await page.context().storageState({ path: AUTH_FILE });
});
