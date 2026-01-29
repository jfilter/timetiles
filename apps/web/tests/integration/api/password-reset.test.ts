/**
 * Integration tests for the password reset flow.
 *
 * Tests Payload's built-in forgot-password and reset-password endpoints
 * work correctly in our configuration.
 *
 * @module
 * @category Integration Tests
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createIntegrationTestEnvironment } from "../../setup/integration/environment";

describe.sequential("Password Reset Flow", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate();
  });

  it("forgot-password returns success for existing user", async () => {
    const { payload } = testEnv;
    const timestamp = Date.now();
    const testEmail = `reset-existing-${timestamp}@test.com`;

    await payload.create({
      collection: "users",
      data: {
        email: testEmail,
        password: "SecurePassword123!",
      },
      disableVerificationEmail: true,
    });

    const token = await payload.forgotPassword({
      collection: "users",
      data: {
        email: testEmail,
      },
      disableEmail: true,
    });

    expect(token).toBeDefined();
  });

  it("forgot-password does not throw for non-existent email", async () => {
    const { payload } = testEnv;

    // Payload's forgotPassword should not throw for unknown emails
    // to prevent user enumeration
    await expect(
      payload.forgotPassword({
        collection: "users",
        data: {
          email: "nonexistent@test.com",
        },
        disableEmail: true,
      })
    ).resolves.not.toThrow();
  });

  it("reset-password rejects invalid token", async () => {
    const { payload } = testEnv;

    await expect(
      payload.resetPassword({
        collection: "users",
        data: {
          token: "invalid-token-12345",
          password: "NewSecurePassword123!",
        },
        overrideAccess: true,
      })
    ).rejects.toThrow();
  });
});
