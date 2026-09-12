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

import { createAccountDeletionService } from "@/lib/account/deletion-service";
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

  it("preserves the revocation error and rolls back deactivation when revoking a key fails", async () => {
    const { payload } = testEnv;
    const user = await createLoggedInUser();
    await payload.update({
      collection: "users",
      id: user.id,
      data: { enableAPIKey: true, apiKey: `${TEST_CREDENTIALS.apiKey.key}-${user.id}` },
      overrideAccess: true,
    });
    const sessionsBefore = await countSessions(user.id);
    const db = payload.db.drizzle;
    await db.execute(sql`
      CREATE FUNCTION payload.test_fail_key_revocation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'credential revocation regression';
      END;
      $$ LANGUAGE plpgsql
    `);
    try {
      await db.execute(sql`
        CREATE TRIGGER test_fail_key_revocation BEFORE UPDATE ON payload.users
        FOR EACH ROW WHEN (OLD.enable_a_p_i_key = true AND NEW.enable_a_p_i_key = false)
        EXECUTE FUNCTION payload.test_fail_key_revocation()
      `);
      let failure: unknown;
      try {
        await payload.update({ collection: "users", id: user.id, data: { isActive: false }, overrideAccess: true });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      const messages: string[] = [];
      for (let error = failure; error instanceof Error; error = error.cause) messages.push(error.message);
      expect(messages).toContain("credential revocation regression");

      const unchanged = await payload.findByID({ collection: "users", id: user.id, overrideAccess: true });
      expect(unchanged.isActive).toBe(true);
      expect(unchanged.enableAPIKey).toBe(true);
      expect(unchanged.apiKey).toBeTruthy();
      expect(await countSessions(user.id)).toBe(sessionsBefore);
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS test_fail_key_revocation ON payload.users`);
      await db.execute(sql`DROP FUNCTION payload.test_fail_key_revocation()`);
    }
  });

  it("preserves session cleanup failures when deleting an already inactive account", async () => {
    const { payload } = testEnv;
    const user = await createLoggedInUser();
    await payload.update({ collection: "users", id: user.id, data: { isActive: false }, overrideAccess: true });
    const db = payload.db.drizzle;
    // Let Payload's own array writes finish; fail only the deletion service's
    // explicit cleanup, after anonymization and the deactivation hook.
    await db.execute(sql`
      CREATE FUNCTION payload.test_fail_session_cleanup() RETURNS trigger AS $$
      BEGIN
        IF current_query() LIKE '%DELETE FROM payload.users_sessions WHERE _parent_id%' THEN
          RAISE EXCEPTION 'session cleanup regression';
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    try {
      await db.execute(sql`
        CREATE TRIGGER test_fail_session_cleanup BEFORE DELETE ON payload.users_sessions
        FOR EACH STATEMENT EXECUTE FUNCTION payload.test_fail_session_cleanup()
      `);
      let failure: unknown;
      try {
        await createAccountDeletionService(payload).executeDeletion(user.id, { deletionType: "self" });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      const messages: string[] = [];
      for (let error = failure; error instanceof Error; error = error.cause) messages.push(error.message);
      expect(messages).toContain("session cleanup regression");
      const unchanged = await payload.findByID({ collection: "users", id: user.id, overrideAccess: true });
      expect(unchanged.email).toBe(user.email);
      expect(unchanged.deletionStatus).not.toBe("deleted");
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS test_fail_session_cleanup ON payload.users_sessions`);
      await db.execute(sql`DROP FUNCTION payload.test_fail_session_cleanup()`);
    }
  });
});
