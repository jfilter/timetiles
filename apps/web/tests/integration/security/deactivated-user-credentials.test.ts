// @vitest-environment node
/**
 * Regression tests for credential revocation on account deactivation.
 *
 * `isActive: false` used to be enforced ONLY in the `beforeLogin` hook, which runs in the
 * login operation and nowhere else. Everything already issued kept working:
 *
 * - an existing session still authenticated every route, and `POST /api/users/refresh-token`
 *   (which does not run `beforeLogin`) re-stamped it and minted a fresh JWT indefinitely, so
 *   deactivation never actually took effect;
 * - an API key was worse — Payload's API-key strategy consults neither `isActive` nor
 *   sessions nor `beforeLogin`, so the key kept granting access under the account's original
 *   role even after a full account deletion.
 *
 * @module
 */

import { sql } from "@payloadcms/db-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Deactivated user credential revocation", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  const countSessions = async (userId: number): Promise<number> => {
    const result = await testEnv.payload.db.drizzle.execute(
      sql`SELECT COUNT(*)::integer AS count FROM payload.users_sessions WHERE _parent_id = ${userId}`
    );
    return Number(result.rows[0]?.count ?? 0);
  };

  /** A verified, active user carrying one real logged-in session. */
  const createLoggedInUser = async () => {
    const password = TEST_CREDENTIALS.basic.strongPassword;
    const email = `deactivation-${Date.now()}-${counter++}@example.test`;

    // Via the shared helper: it owns the verified-user shape, so this test does not have to
    // hand-build `data` (and trip the create overload on `_verified`).
    const { users } = await withUsers(testEnv, { target: { email, password, role: "user", _verified: true } });
    const user = users.target;

    await testEnv.payload.login({ collection: "users", data: { email, password } });
    return user;
  };

  let counter = 0;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
  }, 60000);

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("deletes every session when the account is deactivated", async () => {
    const user = await createLoggedInUser();
    expect(await countSessions(user.id)).toBeGreaterThan(0);

    await testEnv.payload.update({ collection: "users", id: user.id, data: { isActive: false }, overrideAccess: true });

    // Without this the already-issued token kept authenticating every route, and
    // /api/users/refresh-token renewed it indefinitely.
    expect(await countSessions(user.id)).toBe(0);
  });

  it("revokes an issued API key when the account is deactivated", async () => {
    const { payload } = testEnv;
    const user = await createLoggedInUser();

    // Payload does not mint a key from `enableAPIKey` alone — the value is supplied (the
    // admin UI's "generate" button does the same thing client-side).
    await payload.update({
      collection: "users",
      id: user.id,
      data: { enableAPIKey: true, apiKey: `${TEST_CREDENTIALS.apiKey.key}-${user.id}` },
      overrideAccess: true,
    });
    const issued = await payload.findByID({ collection: "users", id: user.id, overrideAccess: true });
    expect(issued.enableAPIKey).toBe(true);
    expect(issued.apiKey).toBeTruthy();

    await payload.update({ collection: "users", id: user.id, data: { isActive: false }, overrideAccess: true });

    const revoked = await payload.findByID({ collection: "users", id: user.id, overrideAccess: true });
    expect(revoked.enableAPIKey).toBe(false);
    expect(revoked.apiKey ?? null).toBeNull();
  });

  it("leaves an active account's sessions and key alone on an unrelated update", async () => {
    const { payload } = testEnv;
    const user = await createLoggedInUser();
    const before = await countSessions(user.id);
    expect(before).toBeGreaterThan(0);

    // Only the true -> false transition revokes.
    await payload.update({ collection: "users", id: user.id, data: { firstName: "Still Here" }, overrideAccess: true });

    expect(await countSessions(user.id)).toBe(before);
  });
});
