/**
 * Per-worker test database URL.
 *
 * @module
 * @category Test Setup
 */
import { deriveDatabaseUrl, getDatabaseUrl } from "@/lib/database/url";

/** Test database URL for the current Vitest worker. */
export const getTestDatabaseUrl = (): string => {
  const baseUrl = getDatabaseUrl(true)!;
  const workerId = process.env.VITEST_WORKER_ID;

  return deriveDatabaseUrl(baseUrl, { workerId });
};
