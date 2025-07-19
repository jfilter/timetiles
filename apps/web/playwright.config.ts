import { defineConfig, devices } from "@playwright/test";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Global setup to seed database before tests */
  globalSetup: "./e2e/global-setup.ts",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Limit workers to prevent resource contention */
  workers: process.env.CI ? 1 : 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? "list" : "list",
  /* Test timeout - 15 seconds locally, 30 seconds in CI */
  timeout: process.env.CI ? 30000 : 15000,
  /* Expect timeout - shorter expect assertions timeout */
  expect: {
    timeout: process.env.CI ? 10000 : 5000,
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    /* Take screenshot on failure */
    screenshot: "only-on-failure",
    /* Record video on failure */
    video: "retain-on-failure",
    /* Navigation timeout */
    navigationTimeout: process.env.CI ? 15000 : 8000,
    /* Action timeout - for click, fill, etc */
    actionTimeout: process.env.CI ? 8000 : 5000,
    /* Run tests in headless mode */
    headless: true,
  },

  /* Configure projects for major browsers */
  projects: process.env.TEST_ALL_BROWSERS
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
  webServer: process.env.CI
    ? undefined // In CI, the server is already running
    : {
        command: "next dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120 * 1000,
      },
});
