/**
 * Integration tests for the password reset flow.
 *
 * Tests Payload's forgot-password token mechanics and the app-managed
 * queued password reset email route work correctly in our configuration.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as forgotPasswordPOST } from "@/app/api/auth/forgot-password/route";
import { EMAIL_CONTEXTS } from "@/lib/email/send";

import { TRUST_LEVELS } from "../../../lib/constants/quota-constants.js";
import { TEST_CREDENTIALS } from "../../constants/test-credentials.js";
import { createIntegrationTestEnvironment } from "../../setup/integration/environment.js";

describe.sequential("Password Reset Flow", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(["users", "payload-jobs"]);
  });

  it("queues a password reset email through the shared send-email job", async () => {
    const { payload } = testEnv;
    const timestamp = Date.now();
    const testEmail = `reset-route-${timestamp}@test.com`;

    await payload.create({
      collection: "users",
      data: { email: testEmail, password: TEST_CREDENTIALS.auth.secure, trustLevel: `${TRUST_LEVELS.BASIC}` },
      disableVerificationEmail: true,
    });

    const request = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });

    const response = await forgotPasswordPOST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain("If an account exists");

    const jobs = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "send-email" }, completedAt: { exists: false } },
      overrideAccess: true,
    });

    expect(
      jobs.docs.some((job: any) => job.input?.to === testEmail && job.input?.context === EMAIL_CONTEXTS.PASSWORD_RESET)
    ).toBe(true);
  });

  it("returns the same forgot-password response for unknown emails without queueing a job", async () => {
    const { payload } = testEnv;
    const request = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `missing-${Date.now()}@test.com` }),
    });

    const response = await forgotPasswordPOST(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);

    const jobs = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "send-email" }, completedAt: { exists: false } },
      overrideAccess: true,
    });

    expect(jobs.docs).toHaveLength(0);
  });

  it("forgot-password returns a token for existing user", async () => {
    const { payload } = testEnv;
    const timestamp = Date.now();
    const testEmail = `reset-existing-${timestamp}@test.com`;

    await payload.create({
      collection: "users",
      data: { email: testEmail, password: TEST_CREDENTIALS.auth.secure, trustLevel: `${TRUST_LEVELS.BASIC}` },
      disableVerificationEmail: true,
    });

    const token = await payload.forgotPassword({ collection: "users", data: { email: testEmail }, disableEmail: true });

    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("reset-password with valid token changes the password", async () => {
    const { payload } = testEnv;
    const timestamp = Date.now();
    const testEmail = `reset-happy-${timestamp}@test.com`;
    const oldPassword = TEST_CREDENTIALS.auth.secure;
    const newPassword = TEST_CREDENTIALS.auth.newSecure;

    await payload.create({
      collection: "users",
      data: { email: testEmail, password: oldPassword, trustLevel: `${TRUST_LEVELS.BASIC}`, _verified: true },
      disableVerificationEmail: true,
    });

    // Get a valid reset token
    const token = await payload.forgotPassword({ collection: "users", data: { email: testEmail }, disableEmail: true });

    // Reset the password
    await payload.resetPassword({ collection: "users", data: { token, password: newPassword }, overrideAccess: true });

    // Verify new password works
    const loginResult = await payload.login({ collection: "users", data: { email: testEmail, password: newPassword } });
    expect(loginResult.user).toBeDefined();
    expect(loginResult.user!.email).toBe(testEmail);
  });

  it("old password no longer works after reset", async () => {
    const { payload } = testEnv;
    const timestamp = Date.now();
    const testEmail = `reset-old-${timestamp}@test.com`;
    const oldPassword = TEST_CREDENTIALS.auth.secure;
    const newPassword = TEST_CREDENTIALS.auth.newSecure;

    await payload.create({
      collection: "users",
      data: { email: testEmail, password: oldPassword, trustLevel: `${TRUST_LEVELS.BASIC}` },
      disableVerificationEmail: true,
    });

    const token = await payload.forgotPassword({ collection: "users", data: { email: testEmail }, disableEmail: true });
    await payload.resetPassword({ collection: "users", data: { token, password: newPassword }, overrideAccess: true });

    // Old password should no longer work
    await expect(
      payload.login({ collection: "users", data: { email: testEmail, password: oldPassword } })
    ).rejects.toThrow();
  });

  it("forgot-password does not throw for non-existent email", async () => {
    const { payload } = testEnv;

    // Payload returns null for unknown emails to prevent user enumeration.
    const token = await payload.forgotPassword({
      collection: "users",
      data: { email: "nonexistent@test.com" },
      disableEmail: true,
    });

    expect(token).toBeNull();
  });

  it("reset-password rejects invalid token", async () => {
    const { payload } = testEnv;

    await expect(
      payload.resetPassword({
        collection: "users",
        data: { token: "invalid-token-12345", password: TEST_CREDENTIALS.auth.newSecure },
        overrideAccess: true,
      })
    ).rejects.toThrow();
  });
});
