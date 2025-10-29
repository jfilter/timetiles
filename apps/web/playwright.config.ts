/**
 * Playwright E2E test configuration.
 *
 * Configures Playwright for end-to-end testing with dedicated test database,
 * browser settings, and test environment variables.
 *
 * @module
 */
import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

import { deriveTestDatabaseUrl, getDatabaseUrl } from "./lib/utils/database-url";

// Load environment variables from .env.local before accessing DATABASE_URL
loadEnv({ path: ".env.local" });

// Get DATABASE_URL from environment - required
const DATABASE_URL = getDatabaseUrl(true)!;

// Derive test database URL from base URL (no worker ID for E2E tests)
const TEST_DATABASE_URL = deriveTestDatabaseUrl(DATABASE_URL);

// Common environment variables for all E2E tests
const TEST_ENV = {
  DATABASE_URL: TEST_DATABASE_URL,
  // Note: This is a test-only secret, not a real credential.
  // Kept inline as Playwright config needs to be self-contained and loads before test setup
  PAYLOAD_SECRET: process.env.PAYLOAD_SECRET || "test-secret-key",
  NEXT_PUBLIC_PAYLOAD_URL: process.env.NEXT_PUBLIC_PAYLOAD_URL || "http://localhost:3002",
  NODE_ENV: "test",
};

// Set environment variables for Playwright process
Object.assign(process.env, TEST_ENV);

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: process.env.CI != null && process.env.CI !== "",
  /* Retry on CI only */
  retries: process.env.CI != null && process.env.CI !== "" ? 2 : 0,
  /* Limit workers to prevent resource contention */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "list",
  /* Test timeout - 60 seconds locally, 120 seconds in CI */
  timeout: process.env.CI != null && process.env.CI !== "" ? 120000 : 60000,
  /* Expect timeout - shorter expect assertions timeout */
  expect: {
    timeout: process.env.CI != null && process.env.CI !== "" ? 10000 : 5000,
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3002",
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    /* Take screenshot on failure */
    screenshot: "only-on-failure",
    /* Record video on failure */
    video: "retain-on-failure",
    /* Navigation timeout */
    navigationTimeout: process.env.CI != null && process.env.CI !== "" ? 15000 : 8000,
    /* Action timeout - for click, fill, etc */
    actionTimeout: process.env.CI != null && process.env.CI !== "" ? 8000 : 5000,
    /* Run tests in headless mode */
    headless: true,
  },

  /* Global environment variables for all tests and setup */
  globalSetup: undefined, // Using project dependencies instead
  globalTeardown: undefined,

  /* Configure projects for major browsers */
  projects:
    process.env.TEST_ALL_BROWSERS != null && process.env.TEST_ALL_BROWSERS !== ""
      ? [
          // Global setup project - runs first
          {
            name: "setup db",
            testMatch: /global\.setup\.ts/,
            use: {},
          },
          // Test all browsers when TEST_ALL_BROWSERS is set
          {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
            dependencies: ["setup db"],
          },
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
            dependencies: ["setup db"],
          },
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
            dependencies: ["setup db"],
          },
          /* Test against mobile viewports. */
          {
            name: "Mobile Chrome",
            use: { ...devices["Pixel 5"] },
            dependencies: ["setup db"],
          },
          {
            name: "Mobile Safari",
            use: { ...devices["iPhone 12"] },
            dependencies: ["setup db"],
          },
        ]
      : [
          // Global setup project - runs first
          {
            name: "setup db",
            testMatch: /global\.setup\.ts/,
            use: {},
          },
          // Default: only Chromium for speed and efficiency
          {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
            dependencies: ["setup db"],
          },
        ],

  /* Run your local dev server before starting the tests */
  webServer:
    process.env.CI != null && process.env.CI !== ""
      ? undefined // In CI, the server is already running
      : {
          command: "pnpm dev --port 3002",
          url: "http://localhost:3002/explore", // Test against the explore page
          reuseExistingServer: true,
          timeout: 60 * 1000, // Give more time for database setup and migrations
          env: {
            ...process.env, // Inherit all current environment variables
            ...TEST_ENV, // Override with test environment variables
          },
        },
});
