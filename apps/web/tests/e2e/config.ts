/**
 * E2E Test Configuration
 *
 * @module
 * @category E2E
 */

/**
 * E2E test database name — fixed, so the suite always targets its own database.
 */
export const E2E_DATABASE_NAME = "timetiles_test_e2e";

/** Connection used when `DATABASE_URL` is absent (CI, where Postgres is at 5432). */
const DEFAULT_E2E_DATABASE_URL = `postgresql://timetiles_user:timetiles_password@localhost:5432/${E2E_DATABASE_NAME}`;

/**
 * E2E test database URL.
 *
 * Host, port and credentials come from `DATABASE_URL`; only the database NAME is
 * fixed. Hardcoding the whole URL pinned the port to 5432, so under `PG_MODE=local`
 * (Homebrew Postgres on 5433) the E2E database could never be created — every run
 * failed with "database does not exist" against a server that was not the one in use.
 */
export const E2E_DATABASE_URL = ((): string => {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) return DEFAULT_E2E_DATABASE_URL;

  try {
    const url = new URL(baseUrl);
    url.pathname = `/${E2E_DATABASE_NAME}`;
    return url.toString();
  } catch {
    return DEFAULT_E2E_DATABASE_URL;
  }
})();
