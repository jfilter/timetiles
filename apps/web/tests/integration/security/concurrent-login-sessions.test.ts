// @vitest-environment node
/**
 * Regression test for sessions lost to concurrent logins.
 *
 * Payload stores sessions as an array on the user and used to write the whole array back on
 * every login. Two logins of the same account that overlapped both read the old array, and the
 * later write dropped the session the earlier one had just added: that browser held a valid
 * JWT whose session no longer existed and was treated as logged out.
 *
 * @module
 */

import { sql } from "@payloadcms/db-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Concurrent login sessions", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
  }, 60000);

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("keeps the session of every login that overlaps another", async () => {
    const { payload } = testEnv;
    const password = TEST_CREDENTIALS.basic.strongPassword;
    const email = `concurrent-login-${Date.now()}@example.test`;
    const { users } = await withUsers(testEnv, { target: { email, password, role: "user", _verified: true } });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => payload.login({ collection: "users", data: { email, password } }))
    );
    const issuedSessionIds = results.map((result) => {
      const [, claims = ""] = (result.token ?? "").split(".");
      return (JSON.parse(Buffer.from(claims, "base64url").toString()) as { sid: string }).sid;
    });

    const stored = await payload.db.drizzle.execute(
      sql`SELECT id FROM payload.users_sessions WHERE _parent_id = ${users.target.id}`
    );
    const storedSessionIds = stored.rows.map((row) => String(row.id));

    expect(new Set(issuedSessionIds).size).toBe(8);
    expect(storedSessionIds).toEqual(expect.arrayContaining(issuedSessionIds));
  });

  it("removes the user's expired sessions on login", async () => {
    const { payload } = testEnv;
    const password = TEST_CREDENTIALS.basic.strongPassword;
    const email = `expired-session-${Date.now()}@example.test`;
    const { users } = await withUsers(testEnv, { target: { email, password, role: "user", _verified: true } });
    await payload.db.drizzle.execute(
      sql`INSERT INTO payload.users_sessions (_order, _parent_id, id, created_at, expires_at)
          VALUES (1, ${users.target.id}, 'expired-session', now() - interval '3 hours', now() - interval '1 hour')`
    );

    await payload.login({ collection: "users", data: { email, password } });

    const stored = await payload.db.drizzle.execute(
      sql`SELECT id, expires_at < now() AS expired FROM payload.users_sessions WHERE _parent_id = ${users.target.id}`
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]?.expired).toBe(false);
  });
});
