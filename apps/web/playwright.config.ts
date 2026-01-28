/**
 * Playwright E2E test configuration for parallel test execution.
 *
 * Configures Playwright for end-to-end testing with:
 * - Per-worker isolated databases (via fixtures)
 * - Per-worker Next.js servers (via fixtures)
 * - Global setup for template database creation
 * - Worktree isolation for simultaneous test runs
 *
 * @module
 */
import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Load environment variables from .env.local
loadEnv({ path: ".env.local" });

const isCI = process.env.CI != null && process.env.CI !== "";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests/e2e",

  /* Run test files in parallel, but tests within a file run sequentially on same worker */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: isCI,

  /* Retry on CI only */
  retries: isCI ? 2 : 0,

  /* Enable parallel workers: 4 in CI, 2 locally */
  workers: isCI ? 4 : 2,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],

  /* Explicit output directory for test artifacts */
  outputDir: "./test-results",

  /* Test timeout - 60 seconds locally, 120 seconds in CI */
  timeout: isCI ? 120000 : 60000,

  /* Expect timeout - shorter expect assertions timeout */
  expect: {
    timeout: isCI ? 10000 : 5000,
  },

  /* Global setup creates template database with migrations and seed data */
  globalSetup: "./tests/e2e/global-setup.ts",

  /* Global teardown cleans up template and worker databases */
  globalTeardown: "./tests/e2e/global-teardown.ts",

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* baseURL is set per-worker via fixture - don't set here */

    /* Collect trace on failure for better debugging. See https://playwright.dev/docs/trace-viewer */
    trace: "retain-on-failure",

    /* Take screenshot on failure */
    screenshot: "only-on-failure",

    /* Record video on failure */
    video: "retain-on-failure",

    /* Navigation timeout */
    navigationTimeout: isCI ? 30000 : 15000,

    /* Action timeout - for click, fill, etc */
    actionTimeout: isCI ? 8000 : 5000,

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

  /* webServer is managed per-worker via fixtures - don't configure here */
});
