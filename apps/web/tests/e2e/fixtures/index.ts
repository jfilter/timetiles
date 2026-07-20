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

import { test as base } from "@playwright/test";
import { Client } from "pg";

import { constructDatabaseUrl, parseDatabaseUrl } from "@/lib/database/url";

import { getWorktreeBasePort } from "../utils/worktree-id";

/** Run-status values the scrapers collection accepts. */
type ScraperRunStatus = "success" | "failed" | "timeout" | "running";

/**
 * Set a scraper's `lastRunStatus` directly in the database.
 *
 * There is no API path for this on purpose: the field is server-managed and
 * denies both create and update at field level, and the internal writers reach
 * it via drizzle SQL or `asSystem`. A test that needs a specific run status as
 * a *precondition* therefore has to write it the same way.
 *
 * This exists because the status is not a stable postcondition of any request.
 * Triggering a run leaves the scraper "running" only until the execution job
 * picks it up — which in CI fails within milliseconds, since no
 * SCRAPER_RUNNER_URL is configured. Tests that inferred "running" from a
 * previous trigger were racing the job worker's 50ms poll.
 */
const setScraperRunStatusFixture = async (
  scraperId: number,
  status: ScraperRunStatus,
): Promise<void> => {
  // global-setup only exports the database *name* to workers; the base
  // DATABASE_URL still points at the developer's own database.
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E-only env vars
  const { DATABASE_URL: baseUrl, E2E_DATABASE_NAME: databaseName } = process.env;
  if (baseUrl == null || databaseName == null) {
    throw new Error("setScraperRunStatus requires DATABASE_URL and E2E_DATABASE_NAME");
  }

  const client = new Client({
    connectionString: constructDatabaseUrl({ ...parseDatabaseUrl(baseUrl), database: databaseName }),
  });
  await client.connect();
  try {
    const result = await client.query(`UPDATE payload.scrapers SET last_run_status = $1 WHERE id = $2`, [
      status,
      scraperId,
    ]);
    // A silent no-op here would surface later as a confusing assertion failure
    // on the status code, so fail where the cause actually is.
    if (result.rowCount !== 1) {
      throw new Error(`Expected to update 1 scraper (id ${scraperId}), updated ${result.rowCount}`);
    }
  } finally {
    await client.end();
  }
};

/**
 * Extended Playwright test with shared server baseURL.
 *
 * The server is started once in global-setup.ts and shared by all workers.
 * Tests use unique IDs to avoid conflicts when running in parallel.
 */
export const test = base.extend<{
  baseURL: string;
  setScraperRunStatus: (scraperId: number, status: ScraperRunStatus) => Promise<void>;
}>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures require destructured first arg
  setScraperRunStatus: async ({}, use) => {
    await use(setScraperRunStatusFixture);
  },

  // Set baseURL from environment or compute from worktree
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures require destructured first arg
  baseURL: async ({}, use) => {
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E test-only env var
    const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${getWorktreeBasePort()}`;
    await use(baseURL);
  },

  // Override context to use the shared baseURL. Forward storageState so
  // auth state from the setup project (a file path in the project config)
  // reaches the browser — without this, custom-fixture contexts replace
  // Playwright's default context creation and silently lose auth.
  // Only forward string paths; tests that opt out with
  // `test.use({ storageState: { cookies: [], origins: [] } })` (inline
  // object) go through Playwright's own merge logic and don't need this.
  context: async ({ browser, baseURL, storageState }, use) => {
    const context = await browser.newContext({
      baseURL,
      storageState: typeof storageState === "string" ? storageState : undefined,
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

  // Override request to use the shared baseURL. Same storageState
  // forwarding as the context fixture.
  request: async ({ playwright, baseURL, storageState }, use) => {
    const request = await playwright.request.newContext({
      baseURL,
      storageState: typeof storageState === "string" ? storageState : undefined,
    });
    await use(request);
    await request.dispose();
  },
});

export { expect } from "@playwright/test";
