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
import { Client } from "pg";

import { withDatabaseName } from "@/lib/database/url";

import { TEST_CREDENTIALS, TEST_EMAILS } from "../../constants/test-credentials";
import { getWorktreeBasePort } from "../utils/worktree-id";

/** An admin account created for one test and deleted after it. */
interface OwnUser {
  email: string;
  password: string;
  /** The display name the header shows for the account */
  name: string;
}

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
    connectionString: withDatabaseName(baseUrl, databaseName),
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
  ownUser: OwnUser;
}>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures require destructured first arg
  setScraperRunStatus: async ({}, use) => {
    await use(setScraperRunStatusFixture);
  },

  // Payload's logout rewrites the account's whole session list and can drop the session of a
  // concurrent login, so a test that logs out must not share its account with other tests.
  ownUser: async ({ playwright, baseURL }, use) => {
    const admin = await playwright.request.newContext({ baseURL, storageState: "test-results/.auth/admin.json" });
    const user = {
      email: TEST_EMAILS.admin.replace("@", `+own-${crypto.randomUUID()}@`),
      password: `${TEST_CREDENTIALS.basic.strongPassword}-${crypto.randomUUID()}`,
      name: "Own User",
    };
    let userId: number | undefined;
    try {
      const created = await admin.post("/api/users", {
        data: {
          email: user.email,
          password: user.password,
          firstName: "Own",
          lastName: "User",
          role: "admin",
          _verified: true,
        },
      });
      expect(created.status()).toBe(201);
      userId = ((await created.json()) as { doc: { id: number } }).doc.id;
      await use(user);
    } finally {
      const deleted = userId == null ? null : await admin.delete(`/api/users/${userId}`);
      await admin.dispose();
      if (deleted != null) expect(deleted.ok()).toBe(true);
    }
  },

  // Set baseURL from environment or compute from worktree
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures require destructured first arg
  baseURL: async ({}, use) => {
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E test-only env var
    const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${getWorktreeBasePort()}`;
    await use(baseURL);
  },

  // context, page and request stay built-in: they apply baseURL/storageState and record video, and
  // close pages via the context — page.close() can hang racing a navigation (crbug.com/536385539).
});

export { expect } from "@playwright/test";
