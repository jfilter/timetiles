/**
 * Integration tests for session-based authentication.
 *
 * Tests that login creates sessions and that payload.auth() can validate
 * JWT tokens with session IDs.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import { beforeAll, describe, expect, it } from "vitest";

import { TEST_CREDENTIALS } from "../../constants/test-credentials";
import { createIntegrationTestEnvironment, withUsers } from "../../setup/integration/environment";

describe("Session Authentication", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
  });

  describe("Login and Session Creation", () => {
    it("should create a session when logging in", async () => {
      const { payload } = testEnv;

      // Create a test user
      const timestamp = Date.now();
      const testEmail = `session-test-${timestamp}@test.com`;
      const testPassword = TEST_CREDENTIALS.basic.strongPassword;

      const { users } = await withUsers(testEnv, {
        sessionTestUser: {
          email: testEmail,
          password: testPassword,
          _verified: true,
        },
      });
      const user = users.sessionTestUser;

      expect(user.id).toBeDefined();

      // Check sessions before login
      const sessionsBefore = (await payload.db.drizzle.execute(
        sql`SELECT COUNT(*) as count FROM payload.users_sessions WHERE _parent_id = ${user.id}`
      )) as { rows: Array<{ count: string }> };
      const countBefore = parseInt(sessionsBefore.rows[0]?.count ?? "0", 10);
      console.log(`Sessions before login: ${countBefore}`);

      // Login
      const loginResult = await payload.login({
        collection: "users",
        data: {
          email: testEmail,
          password: testPassword,
        },
      });

      expect(loginResult.token).toBeDefined();
      expect(loginResult.user).toBeDefined();
      expect(loginResult.user.id).toBe(user.id);

      console.log(`Login successful, token length: ${loginResult.token?.length}`);

      // Check sessions after login
      const sessionsAfter = (await payload.db.drizzle.execute(
        sql`SELECT COUNT(*) as count FROM payload.users_sessions WHERE _parent_id = ${user.id}`
      )) as { rows: Array<{ count: string }> };
      const countAfter = parseInt(sessionsAfter.rows[0]?.count ?? "0", 10);
      console.log(`Sessions after login: ${countAfter}`);

      // Session should have been created
      expect(countAfter).toBeGreaterThan(countBefore);
    });

    it("should validate JWT with session using payload.auth()", async () => {
      const { payload } = testEnv;

      // Create a test user
      const timestamp = Date.now();
      const testEmail = `auth-test-${timestamp}@test.com`;
      const testPassword = TEST_CREDENTIALS.basic.strongPassword;

      await withUsers(testEnv, {
        authTestUser: {
          email: testEmail,
          password: testPassword,
          _verified: true,
        },
      });

      // Login to get token
      const loginResult = await payload.login({
        collection: "users",
        data: {
          email: testEmail,
          password: testPassword,
        },
      });

      expect(loginResult.token).toBeDefined();

      // Decode JWT to see session ID
      const tokenParts = loginResult.token!.split(".");
      const payloadPart = JSON.parse(Buffer.from(tokenParts[1], "base64").toString("utf8"));
      console.log("JWT payload:", JSON.stringify(payloadPart, null, 2));

      // Validate using payload.auth() with Bearer token
      const { user: authUser } = await payload.auth({
        headers: new Headers({
          Authorization: `Bearer ${loginResult.token}`,
        }),
      });

      expect(authUser).toBeDefined();
      expect(authUser?.email).toBe(testEmail);
      console.log(`payload.auth() returned user: ${authUser?.email}`);
    });

    it("should validate JWT with session using Cookie header", async () => {
      const { payload } = testEnv;

      // Create a test user
      const timestamp = Date.now();
      const testEmail = `cookie-test-${timestamp}@test.com`;
      const testPassword = TEST_CREDENTIALS.basic.strongPassword;

      await withUsers(testEnv, {
        cookieTestUser: {
          email: testEmail,
          password: testPassword,
          _verified: true,
        },
      });

      // Login to get token
      const loginResult = await payload.login({
        collection: "users",
        data: {
          email: testEmail,
          password: testPassword,
        },
      });

      expect(loginResult.token).toBeDefined();

      // Validate using payload.auth() with Cookie header (like browser would send)
      const { user: authUser } = await payload.auth({
        headers: new Headers({
          Cookie: `payload-token=${loginResult.token}`,
        }),
      });

      expect(authUser).toBeDefined();
      expect(authUser?.email).toBe(testEmail);
      console.log(`payload.auth() with Cookie returned user: ${authUser?.email}`);
    });

    it("should fail auth when session is deleted", async () => {
      const { payload } = testEnv;

      // Create a test user
      const timestamp = Date.now();
      const testEmail = `session-delete-${timestamp}@test.com`;
      const testPassword = TEST_CREDENTIALS.basic.strongPassword;

      const { users } = await withUsers(testEnv, {
        sessionDeleteUser: {
          email: testEmail,
          password: testPassword,
          _verified: true,
        },
      });
      const user = users.sessionDeleteUser;

      // Login to get token
      const loginResult = await payload.login({
        collection: "users",
        data: {
          email: testEmail,
          password: testPassword,
        },
      });

      expect(loginResult.token).toBeDefined();

      // Verify auth works before deleting session
      const { user: authUserBefore } = await payload.auth({
        headers: new Headers({
          Authorization: `Bearer ${loginResult.token}`,
        }),
      });
      expect(authUserBefore).toBeDefined();
      console.log("Auth before session delete: success");

      // Delete all sessions for this user
      await payload.db.drizzle.execute(sql`DELETE FROM payload.users_sessions WHERE _parent_id = ${user.id}`);
      console.log("Deleted sessions for user");

      // Verify auth fails after deleting session
      const { user: authUserAfter } = await payload.auth({
        headers: new Headers({
          Authorization: `Bearer ${loginResult.token}`,
        }),
      });

      console.log(`Auth after session delete: ${authUserAfter ? "success (unexpected)" : "failed (expected)"}`);
      expect(authUserAfter).toBeNull();
    });

    it("should show what sessions table looks like after login", async () => {
      const { payload } = testEnv;

      // Create and login
      const timestamp = Date.now();
      const testEmail = `inspect-${timestamp}@test.com`;
      const testPassword = TEST_CREDENTIALS.basic.strongPassword;

      const { users } = await withUsers(testEnv, {
        inspectUser: {
          email: testEmail,
          password: testPassword,
          _verified: true,
        },
      });
      const user = users.inspectUser;

      await payload.login({
        collection: "users",
        data: {
          email: testEmail,
          password: testPassword,
        },
      });

      // Query sessions directly
      const sessions = (await payload.db.drizzle.execute(
        sql`SELECT * FROM payload.users_sessions WHERE _parent_id = ${user.id}`
      )) as {
        rows: Array<{
          _order: number;
          _parent_id: number;
          id: string;
          created_at: string;
          expires_at: string;
        }>;
      };

      console.log("Sessions table contents:", JSON.stringify(sessions.rows, null, 2));

      expect(sessions.rows.length).toBeGreaterThan(0);
      const firstSession = sessions.rows[0]!;
      expect(firstSession._parent_id).toBe(user.id);
      expect(firstSession.id).toBeDefined();
    });
  });
});
