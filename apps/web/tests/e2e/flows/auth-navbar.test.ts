/**
 * E2E tests for navbar authentication flow.
 *
 * Tests login flow from the main navbar:
 * - Click Sign In button in navbar
 * - Navigate to /login page
 * - Enter credentials and sign in
 * - Verify navbar shows user menu after login
 *
 * @module
 * @category E2E Tests
 */
import { expect, test } from "../fixtures";

test.describe("Navbar Authentication", () => {
  test.describe("Sign In Flow", () => {
    test("should show Sign In button for unauthenticated users", async ({ page }) => {
      // Go to home page
      await page.goto("/", { timeout: 10000 });
      await page.waitForLoadState("domcontentloaded");

      // Should see Sign In button in navbar
      const signInButton = page.getByRole("link", { name: /sign in/i });
      await expect(signInButton).toBeVisible({ timeout: 5000 });
    });

    test("should navigate to login page when clicking Sign In", async ({ page }) => {
      // Go to home page
      await page.goto("/", { timeout: 10000 });
      await page.waitForLoadState("domcontentloaded");

      // Click Sign In button
      const signInButton = page.getByRole("link", { name: /sign in/i });
      await expect(signInButton).toBeVisible({ timeout: 10000 });
      await signInButton.click();

      // Should navigate to /login
      await page.waitForURL(/\/login/);
      expect(page.url()).toContain("/login");

      // Should see the login page content
      const welcomeHeading = page.getByRole("heading", { name: /welcome back/i });
      await expect(welcomeHeading).toBeVisible({ timeout: 5000 });

      // Should see Sign In and Sign Up tabs
      const signInTab = page.getByRole("tab", { name: /sign in/i });
      const signUpTab = page.getByRole("tab", { name: /sign up/i });
      await expect(signInTab).toBeVisible();
      await expect(signUpTab).toBeVisible();
    });

    test("should complete login from navbar and show user menu", async ({ page }) => {
      // Go to home page
      await page.goto("/", { timeout: 10000 });
      await page.waitForLoadState("domcontentloaded");

      // Click Sign In button
      const signInButton = page.getByRole("link", { name: /sign in/i });
      await expect(signInButton).toBeVisible({ timeout: 10000 });
      await signInButton.click();

      // Wait for login page
      await page.waitForURL(/\/login/);

      // Fill in login form
      const emailInput = page.locator("#login-email");
      const passwordInput = page.locator("#login-password");

      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();

      await emailInput.fill("admin@example.com");
      await passwordInput.fill("admin123");

      // Click Sign In button in form
      const submitButton = page.getByRole("button", { name: /sign in/i });
      await submitButton.click();

      // Wait for the sign in button to show loading state
      await expect(page.getByRole("button", { name: /signing in/i })).toBeVisible({ timeout: 5000 });

      // Wait for redirect away from /login page (this confirms successful login)
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 5000 });

      // Navigate to home page explicitly and reload to update server components
      await page.goto("/", { timeout: 10000 });
      await page.waitForLoadState("domcontentloaded");

      // Should NOT see Sign In button anymore
      const signInAfterLogin = page.getByRole("link", { name: /sign in/i });
      await expect(signInAfterLogin).not.toBeVisible({ timeout: 5000 });

      // Should see user menu button with user name
      const userMenuButton = page.getByRole("button", { name: /admin user/i });
      await expect(userMenuButton).toBeVisible({ timeout: 5000 });
    });

    test("should show user dropdown menu when clicking user avatar", async ({ page }) => {
      // Go to home page
      await page.goto("/", { timeout: 10000 });
      await page.waitForLoadState("domcontentloaded");

      // Login first
      const signInButton = page.getByRole("link", { name: /sign in/i });
      await signInButton.click();
      await page.waitForURL(/\/login/);

      await page.locator("#login-email").fill("admin@example.com");
      await page.locator("#login-password").fill("admin123");
      await page.getByRole("button", { name: /sign in/i }).click();

      await page.waitForURL("/", { timeout: 10000 });

      // Reload to update server components with new auth state
      await page.reload();
      await page.waitForLoadState("domcontentloaded");

      // Click on user menu button
      const userMenuButton = page.getByRole("button", { name: /admin user/i });
      await expect(userMenuButton).toBeVisible({ timeout: 5000 });
      await userMenuButton.click();

      // Should see dropdown menu items
      const importDataItem = page.getByRole("menuitem", { name: /import data/i });
      const dashboardItem = page.getByRole("menuitem", { name: /dashboard/i });
      const signOutItem = page.getByRole("menuitem", { name: /sign out/i });

      await expect(importDataItem).toBeVisible();
      await expect(dashboardItem).toBeVisible();
      await expect(signOutItem).toBeVisible();
    });

    test("should sign out user when clicking Sign Out", async ({ page }) => {
      // Go to home page and login
      await page.goto("/", { timeout: 10000 });
      await page.waitForLoadState("domcontentloaded");

      const signInButton = page.getByRole("link", { name: /sign in/i });
      await signInButton.click();
      await page.waitForURL(/\/login/);

      await page.locator("#login-email").fill("admin@example.com");
      await page.locator("#login-password").fill("admin123");
      await page.getByRole("button", { name: /sign in/i }).click();

      await page.waitForURL("/", { timeout: 10000 });

      // Reload to update server components with new auth state
      await page.reload();
      await page.waitForLoadState("domcontentloaded");

      // Open user menu
      const userMenuButton = page.getByRole("button", { name: /admin user/i });
      await userMenuButton.click();

      // Click Sign Out
      const signOutItem = page.getByRole("menuitem", { name: /sign out/i });
      await signOutItem.click();

      // Wait for logout to process and reload page to update server components
      await page.waitForTimeout(1000);
      await page.reload();
      await page.waitForLoadState("domcontentloaded");

      // Should see Sign In button again
      const signInButtonAfterLogout = page.getByRole("link", { name: /sign in/i });
      await expect(signInButtonAfterLogout).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Login Errors", () => {
    test("should show error for invalid credentials", async ({ page }) => {
      await page.goto("/login", { timeout: 10000 });
      await page.waitForLoadState("domcontentloaded");

      const emailInput = page.locator("#login-email");
      const passwordInput = page.locator("#login-password");

      await emailInput.fill("admin@example.com");
      await passwordInput.fill("wrongpassword");

      const submitButton = page.getByRole("button", { name: /sign in/i });
      await submitButton.click();

      // Should show error message
      const errorMessage = page.getByRole("alert");
      await expect(errorMessage).toBeVisible({ timeout: 5000 });

      // Should still be on login page
      expect(page.url()).toContain("/login");
    });

    test("should require email and password fields", async ({ page }) => {
      await page.goto("/login", { timeout: 10000 });
      await page.waitForLoadState("domcontentloaded");

      // Both inputs should have required attribute
      const emailInput = page.locator("#login-email");
      const passwordInput = page.locator("#login-password");

      await expect(emailInput).toHaveAttribute("required");
      await expect(passwordInput).toHaveAttribute("required");
    });
  });

  test.describe("Redirect After Login", () => {
    test("should redirect to specified page after login", async ({ page }) => {
      // Go to login with redirect parameter
      await page.goto("/login?redirect=/explore", { timeout: 10000 });
      await page.waitForLoadState("domcontentloaded");

      // Login
      await page.locator("#login-email").fill("admin@example.com");
      await page.locator("#login-password").fill("admin123");
      await page.getByRole("button", { name: /sign in/i }).click();

      // Should redirect to /explore
      await page.waitForURL(/\/explore/, { timeout: 10000 });
      expect(page.url()).toContain("/explore");
    });
  });
});
