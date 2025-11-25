/**
 * Playwright E2E test configuration.
 *
 * Configures Playwright for end-to-end testing with dedicated test database,
 * browser settings, and test environment variables.
 *
 * @module
 */
import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

import { E2E_DATABASE_URL } from "./tests/e2e/config";

// Load environment variables from .env.local before accessing DATABASE_URL
loadEnv({ path: ".env.local" });

// Common environment variables for all E2E tests
const TEST_ENV = {
  DATABASE_URL: E2E_DATABASE_URL,
  // Note: This is a test-only secret, not a real credential.
  // Kept inline as Playwright config needs to be self-contained and loads before test setup
  PAYLOAD_SECRET: process.env.PAYLOAD_SECRET || "test-secret-key",
  NEXT_PUBLIC_PAYLOAD_URL: "http://localhost:3002",
  NODE_ENV: "test",
  // Ensure database setup errors are visible even in test mode
  LOG_LEVEL: "info",
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
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  /* Explicit output directory for test artifacts */
  outputDir: "./test-results",
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
    /* Collect trace on failure for better debugging. See https://playwright.dev/docs/trace-viewer */
    trace: "retain-on-failure",
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

  /* Configure projects for major browsers */
  projects:
    process.env.TEST_ALL_BROWSERS != null && process.env.TEST_ALL_BROWSERS !== ""
      ? [
          // Test all browsers when TEST_ALL_BROWSERS is set
          {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
          },
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
          },
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
          },
          /* Test against mobile viewports. */
          {
            name: "Mobile Chrome",
            use: { ...devices["Pixel 5"] },
          },
          {
            name: "Mobile Safari",
            use: { ...devices["iPhone 12"] },
          },
        ]
      : [
          // Default: only Chromium for speed and efficiency
          {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
          },
        ],

  /* Run your local dev server before starting the tests */
  webServer:
    process.env.CI != null && process.env.CI !== ""
      ? undefined // In CI, the server is already running
      : {
          command: "pnpm setup:e2e-db && pnpm dev --port 3002",
          url: "http://localhost:3002/explore", // Test against the explore page
          reuseExistingServer: true,
          timeout: 120 * 1000, // 2 minutes for database setup, migrations, and server start
          env: {
            ...process.env, // Inherit all current environment variables
            ...TEST_ENV, // Override with test environment variables
          },
        },
});
