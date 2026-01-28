/**
 * E2E test fixtures for parallel test execution.
 *
 * Provides test fixtures with baseURL pointing to the shared server
 * started by global-setup.ts.
 *
 * @module
 * @category E2E Fixtures
 */

/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture `use()` is not a React hook */

import { expect, test as base } from "@playwright/test";

import { getWorktreeBasePort } from "../utils/worktree-id";

/**
 * Extended Playwright test with shared server baseURL.
 *
 * The server is started once in global-setup.ts and shared by all workers.
 * Tests use unique IDs to avoid conflicts when running in parallel.
 */
export const test = base.extend<{ baseURL: string }>({
  // Set baseURL from environment or compute from worktree
  baseURL: async ({}, use) => {
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E test-only env var
    const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${getWorktreeBasePort()}`;
    await use(baseURL);
  },

  // Override context to use the shared baseURL
  context: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext({
      baseURL,
    });
    await use(context);
    await context.close();
  },

  // Override page to use the context with baseURL
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },

  // Override request to use the shared baseURL
  request: async ({ playwright, baseURL }, use) => {
    const request = await playwright.request.newContext({
      baseURL,
    });
    await use(request);
    await request.dispose();
  },
});

export { expect };
