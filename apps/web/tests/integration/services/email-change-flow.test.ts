/**
 * Integration tests for the staged email-change flow.
 *
 * Regression: change-email used to overwrite `email` and set
 * `_verified: false` in one step — the user was instantly logged out
 * everywhere, and a mistyped/undeliverable new address was an unrecoverable
 * lockout (login demands _verified, the old email no longer existed, and
 * password reset does not re-verify). The new address must be STAGED in
 * `pendingEmail` and only swapped in when its verification token is
 * confirmed.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_CREDENTIALS } from "../../constants/test-credentials";
import type { TestEnvironment } from "../../setup/integration/environment";

interface HiddenUserFields {
  email: string;
  _verified?: boolean | null;
  pendingEmail?: string | null;
}

describe.sequential("staged email change", () => {
  let testEnv: TestEnvironment;
  let payload: Payload;
  let makeUser: (name: string, email: string) => Promise<{ id: number }>;

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withUsers } = await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    makeUser = async (name: string, email: string) => {
      const { users } = await withUsers(testEnv, {
        [name]: { email, password: TEST_CREDENTIALS.basic.password, _verified: true },
      });
      return users[name] as { id: number };
    };
  }, 60_000);

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  const stageEmailChange = async (userId: number, newEmail: string, token: string) => {
    await payload.update({
      collection: "users",
      id: userId,
      overrideAccess: true,
      data: { pendingEmail: newEmail, _verificationToken: token },
    });
  };

  const confirmToken = async (token: string) => {
    const { POST } = await import("../../../app/api/users/verify/[token]/route");
    return POST(new NextRequest(`http://localhost:3000/api/users/verify/${token}`, { method: "POST" }), {
      params: Promise.resolve({ token }),
    });
  };

  const reloadUser = async (id: number): Promise<HiddenUserFields> =>
    payload.findByID({ collection: "users", id, overrideAccess: true, showHiddenFields: true });

  it("keeps the current email verified and logged in while the change is pending", async () => {
    const user = await makeUser("stageKeep", "stage-keep@example.com");
    await stageEmailChange(user.id, "stage-keep-new@example.com", "a".repeat(40));

    const reloaded = await reloadUser(user.id);

    // The login credential is untouched and still verified.
    expect(reloaded.email).toBe("stage-keep@example.com");
    expect(reloaded._verified).toBe(true);
    expect(reloaded.pendingEmail).toBe("stage-keep-new@example.com");

    const login = await payload.login({
      collection: "users",
      data: { email: "stage-keep@example.com", password: TEST_CREDENTIALS.basic.password },
    });
    expect(login.user?.id).toBe(user.id);
  });

  it("swaps the email in when the verification token is confirmed", async () => {
    const token = "b".repeat(40);
    const user = await makeUser("stageSwap", "stage-swap@example.com");
    await stageEmailChange(user.id, "stage-swap-new@example.com", token);

    const response = await confirmToken(token);
    expect(response.status).toBe(200);

    const reloaded = await reloadUser(user.id);
    expect(reloaded.email).toBe("stage-swap-new@example.com");
    expect(reloaded._verified).toBe(true);
    expect(reloaded.pendingEmail).toBeNull();
  });

  it("rejects confirmation when the address was claimed in the meantime", async () => {
    const token = "c".repeat(40);
    const user = await makeUser("stageConflict", "stage-conflict@example.com");
    await stageEmailChange(user.id, "stage-claimed@example.com", token);

    // Another account claims the address before the link is clicked.
    await makeUser("stageClaimer", "stage-claimed@example.com");

    const response = await confirmToken(token);
    expect(response.status).toBe(409);

    // The original account still works under its old address.
    const reloaded = await reloadUser(user.id);
    expect(reloaded.email).toBe("stage-conflict@example.com");
    expect(reloaded._verified).toBe(true);
  });
});
