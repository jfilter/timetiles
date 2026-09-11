/**
 * Verify identical database query behavior locally and in CI.
 *
 * @module
 * @category Tests
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { resetAppConfig } from "@/lib/config/app-config";
import { getEnv, resetEnv } from "@/lib/config/env";
import { executeDatabaseQuery } from "@/lib/database/operations";
import { createIntegrationTestEnvironment } from "@/tests/setup/integration/environment";

describe.sequential("Database query execution", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let connectionString: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    const url = new URL(getEnv().DATABASE_URL);
    // The explicit database argument, not the URL pathname, chooses the target.
    url.pathname = "/postgres";
    url.searchParams.set("application_name", "timetiles-query-regression");
    connectionString = url.toString();
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("preserves connection options from the current environment", async () => {
    try {
      for (const application of ["timetiles-query-first", "timetiles-query-second"]) {
        const url = new URL(connectionString);
        url.searchParams.set("application_name", application);
        vi.stubEnv("DATABASE_URL", url.toString());
        resetEnv();
        resetAppConfig();
        const result = await executeDatabaseQuery(
          testEnv.dbName,
          "SELECT current_database() AS db, current_setting('application_name') AS application"
        );
        expect(JSON.parse(result)).toEqual([{ db: testEnv.dbName, application }]);
      }
    } finally {
      vi.unstubAllEnvs();
      resetEnv();
      resetAppConfig();
    }
  });

  it.each(["local", "CI", "GITHUB_ACTIONS"])("uses the same connection and result format in %s", async (mode) => {
    vi.stubEnv("CI", mode === "CI" ? "true" : "false");
    vi.stubEnv("GITHUB_ACTIONS", mode === "GITHUB_ACTIONS" ? "true" : "false");
    resetEnv();
    resetAppConfig();
    try {
      const result = await executeDatabaseQuery(
        testEnv.dbName,
        "SELECT current_database() AS db, current_setting('application_name') AS application",
        { connectionString }
      );
      expect(JSON.parse(result)).toEqual([{ db: testEnv.dbName, application: "timetiles-query-regression" }]);
    } finally {
      vi.unstubAllEnvs();
      resetEnv();
      resetAppConfig();
    }
  });
});
