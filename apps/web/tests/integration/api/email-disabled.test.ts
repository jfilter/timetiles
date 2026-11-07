// @vitest-environment node
/**
 * Integration tests for EMAIL_DISABLED: flows whose only outcome is an email refuse
 * with 503 instead of pretending to send.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as forgotPasswordPOST } from "@/app/api/auth/forgot-password/route";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as changeEmailPOST } from "@/app/api/users/change-email/route";
import { resetEnv } from "@/lib/config/env";
import { resetRateLimitService } from "@/lib/services/rate-limit-service";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

const routeContext = { params: Promise.resolve({}) };

const jsonRequest = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("EMAIL_DISABLED", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(["users", "payload-jobs"]);
    resetRateLimitService();
    vi.stubEnv("EMAIL_DISABLED", "true");
    resetEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnv();
  });

  const queuedEmailCount = async () =>
    (
      await testEnv.payload.find({
        collection: "payload-jobs",
        where: { taskSlug: { equals: "send-email" } },
        overrideAccess: true,
      })
    ).totalDocs;

  const expectEmailDisabled = async (response: Response) => {
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "EMAIL_DISABLED" });
    expect(await queuedEmailCount()).toBe(0);
  };

  it("refuses registration and creates no user", async () => {
    const email = `disabled-register-${Date.now()}@test.com`;

    const response = await registerPOST(
      jsonRequest("/api/auth/register", { email, password: TEST_CREDENTIALS.basic.strongPassword }),
      routeContext
    );

    await expectEmailDisabled(response);
    const users = await testEnv.payload.find({ collection: "users", where: { email: { equals: email } } });
    expect(users.totalDocs).toBe(0);
  });

  it("refuses a password reset request", async () => {
    const { users } = await withUsers(testEnv, { member: { role: "user" } });

    const response = await forgotPasswordPOST(
      jsonRequest("/api/auth/forgot-password", { email: users.member.email }),
      routeContext
    );

    await expectEmailDisabled(response);
  });

  it("refuses Payload's own forgot-password operation", async () => {
    const { users } = await withUsers(testEnv, { member: { role: "user" } });

    await expect(
      testEnv.payload.forgotPassword({ collection: "users", data: { email: users.member.email } })
    ).rejects.toMatchObject({ status: 503 });
  });

  it("refuses an email change and keeps the address", async () => {
    const password = TEST_CREDENTIALS.basic.strongPassword;
    const { users } = await withUsers(testEnv, { member: { role: "user", password, _verified: true } });
    const { token } = await testEnv.payload.login({
      collection: "users",
      data: { email: users.member.email, password },
    });

    const response = await changeEmailPOST(
      jsonRequest(
        "/api/users/change-email",
        { newEmail: `changed-${Date.now()}@test.com`, password },
        { Authorization: `JWT ${token}` }
      ),
      routeContext
    );

    await expectEmailDisabled(response);
    const user = await testEnv.payload.findByID({ collection: "users", id: users.member.id, overrideAccess: true });
    expect(user.email).toBe(users.member.email);
  });
});
