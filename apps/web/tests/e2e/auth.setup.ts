/**
 * Playwright auth setup - logs in once and saves storage state for reuse.
 *
 * This runs before all test files that depend on the "setup" project,
 * so authenticated tests skip the login UI flow entirely.
 *
 * @module
 * @category E2E Setup
 */
import { test as setup } from "./fixtures";

const AUTH_FILE = "test-results/.auth/admin.json";

setup("authenticate as admin", async ({ page, baseURL }) => {
  // Log in via the API and capture cookies directly into the browser context.
  // This avoids the UI flow entirely — no `page.goto`, no i18n-middleware
  // round-trip, no form-fill timing. Using `page.context().request` (rather
  // than `page.request`) means the Set-Cookie response lands on the browser
  // context's cookie jar, which is what `storageState()` serializes.
  const apiLogin = await page
    .context()
    .request.post(`${baseURL}/api/users/login`, {
      data: { email: "admin@example.com", password: "admin123" },
      headers: { "Content-Type": "application/json" },
    });
  if (apiLogin.status() !== 200) {
    const body = await apiLogin.text();
    throw new Error(`Auth setup: API login failed (${apiLogin.status()}): ${body}`);
  }

  // Save cookies to the storageState file so project-level `storageState`
  // can load them for every authenticated test.
  await page.context().storageState({ path: AUTH_FILE });
});
