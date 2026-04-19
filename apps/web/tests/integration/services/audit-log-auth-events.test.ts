// @vitest-environment node
/**
 * Integration tests for ADR 0027 authentication audit events.
 *
 * Verifies that the three previously-stubbed audit actions now fire:
 *   - LOGIN_SUCCESS on a successful login (via `afterLogin` hook)
 *   - LOGIN_FAILED on wrong-password AND non-existent-user attempts
 *     (via `/api/auth/login` wrapper route)
 *   - REGISTERED on a successful self-registration (via `/api/auth/register`)
 *
 * These events are compliance-critical: their absence was flagged in the
 * 60-day review as the single largest gap in ADR 0027 coverage.
 *
 * Login failures are exercised through the HTTP route because Payload's
 * `afterError` hook only fires on the REST dispatch path, and the Local API
 * bypasses it.
 *
 * @module
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { TRUST_LEVELS } from "@/lib/constants/quota-constants";
import { hashEmail } from "@/lib/security/hash";
import { AUDIT_ACTIONS } from "@/lib/services/audit-log-service";
import { resetRateLimitService } from "@/lib/services/rate-limit-service";

import { TEST_CREDENTIALS } from "../../constants/test-credentials";
import { createIntegrationTestEnvironment } from "../../setup/integration/environment";

describe.sequential("Audit log — authentication events", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  let ipCounter = 1;
  const getUniqueIp = () => `192.168.${Math.floor(ipCounter / 256)}.${ipCounter++ % 256}`;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(["users", "user-usage", "audit-log"]);
    resetRateLimitService();
  });

  const buildLoginRequest = (email: string, password: string) =>
    new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": getUniqueIp() },
      body: JSON.stringify({ email, password }),
    });

  const findAuditEntries = async (action: string) => {
    const result = await payload.find({
      collection: "audit-log",
      where: { action: { equals: action } },
      sort: "-timestamp",
      limit: 50,
      overrideAccess: true,
    });
    return result.docs;
  };

  it("records LOGIN_SUCCESS on a verified user's login", async () => {
    const testEmail = `login-success-${Date.now()}@test.com`;
    const password = TEST_CREDENTIALS.auth.secure;

    const user = await payload.create({
      collection: "users",
      data: { email: testEmail, password, trustLevel: `${TRUST_LEVELS.BASIC}` },
      disableVerificationEmail: true,
    });

    const userWithToken = await payload.findByID({ collection: "users", id: user.id, showHiddenFields: true });
    if (userWithToken._verificationToken) {
      await payload.verifyEmail({ collection: "users", token: userWithToken._verificationToken });
    }

    await payload.login({ collection: "users", data: { email: testEmail, password } });

    const entries = await findAuditEntries(AUDIT_ACTIONS.LOGIN_SUCCESS);
    const match = entries.find((e) => e.userId === user.id);
    expect(match).toBeDefined();
    expect(match?.userEmailHash).toBe(hashEmail(testEmail));
  });

  it("sets the session cookie on successful wrapper logins", async () => {
    const testEmail = `login-cookie-${Date.now()}@test.com`;
    const password = TEST_CREDENTIALS.auth.secure;

    const user = await payload.create({
      collection: "users",
      data: { email: testEmail, password, trustLevel: `${TRUST_LEVELS.BASIC}` },
      disableVerificationEmail: true,
    });

    const userWithToken = await payload.findByID({ collection: "users", id: user.id, showHiddenFields: true });
    if (userWithToken._verificationToken) {
      await payload.verifyEmail({ collection: "users", token: userWithToken._verificationToken });
    }

    const response = await loginPOST(buildLoginRequest(testEmail, password), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);

    const loginBody = (await response.json()) as { exp?: number; token?: string; user?: { id: number } };
    const setCookie = response.headers.get("set-cookie");
    const sessionCookie = setCookie?.split(";")[0];
    const authResult = await payload.auth({
      headers: new Headers({ Cookie: sessionCookie ?? "" }),
    });

    expect(loginBody.user?.id).toBe(user.id);
    expect(loginBody.exp).toBeDefined();
    expect(setCookie).toContain("payload-token=");
    expect(authResult.user?.id).toBe(user.id);
  });

  it("records LOGIN_FAILED on wrong password", async () => {
    const testEmail = `login-failed-pwd-${Date.now()}@test.com`;

    const user = await payload.create({
      collection: "users",
      data: { email: testEmail, password: TEST_CREDENTIALS.auth.correct, trustLevel: `${TRUST_LEVELS.BASIC}` },
      disableVerificationEmail: true,
    });
    // Verify email so the failure below is "wrong password", not "unverified".
    const userWithToken = await payload.findByID({ collection: "users", id: user.id, showHiddenFields: true });
    if (userWithToken._verificationToken) {
      await payload.verifyEmail({ collection: "users", token: userWithToken._verificationToken });
    }

    const response = await loginPOST(buildLoginRequest(testEmail, TEST_CREDENTIALS.auth.wrong), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);

    const entries = await findAuditEntries(AUDIT_ACTIONS.LOGIN_FAILED);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.userEmailHash === hashEmail(testEmail))).toBe(true);
  });

  it("records LOGIN_FAILED on non-existent user (no enumeration leak)", async () => {
    const nonexistent = `never-existed-${Date.now()}@test.com`;

    const response = await loginPOST(buildLoginRequest(nonexistent, TEST_CREDENTIALS.auth.any), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);

    const entries = await findAuditEntries(AUDIT_ACTIONS.LOGIN_FAILED);
    // userId is 0 for all failed logins, so the audit record on its own
    // can't be used to enumerate users.
    expect(entries.filter((e) => e.userId === 0).length).toBeGreaterThan(0);
  });

  it("records REGISTERED on successful self-registration", async () => {
    const newEmail = `registered-${Date.now()}@test.com`;

    const request = new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": getUniqueIp() },
      body: JSON.stringify({ email: newEmail, password: TEST_CREDENTIALS.basic.strongPassword }),
    });

    const response = await registerPOST(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(200);

    const entries = await findAuditEntries(AUDIT_ACTIONS.REGISTERED);
    expect(entries.some((e) => e.userEmailHash === hashEmail(newEmail))).toBe(true);
  });
});
