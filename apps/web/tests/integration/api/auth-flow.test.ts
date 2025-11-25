/**
 * Integration tests for the registration → verification → login flow.
 *
 * Tests the complete authentication journey including:
 * - Self-registration with forced safe defaults
 * - Email verification process
 * - Login with credentials
 * - Access control for protected endpoints
 *
 * @module
 * @category Integration Tests
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TRUST_LEVELS } from "@/lib/constants/quota-constants";

import { createIntegrationTestEnvironment } from "../../setup/integration/environment";

describe.sequential("Authentication Flow", () => {
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

  describe("Self-Registration", () => {
    it("REST API self-registration enforces safe defaults", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();
      const testEmail = `selfregister-${timestamp}@test.com`;

      // Simulate a REST API request (self-registration through public endpoint)
      // by passing a mock req object with payloadAPI: "REST"
      const user = await payload.create({
        collection: "users",
        data: {
          email: testEmail,
          password: "SecurePassword123!",
          firstName: "Test",
          lastName: "User",
          // Try to set admin role (should be forced to user)
          role: "admin",
          // Try to set high trust level (should be forced to BASIC)
          trustLevel: String(TRUST_LEVELS.TRUSTED),
        },
        req: {
          payloadAPI: "REST",
          user: undefined,
          payload,
        } as any,
      });

      expect(user).toBeDefined();
      expect(user.email).toBe(testEmail);
      // Security: Should be forced to 'user' role
      expect(user.role).toBe("user");
      // Security: Should be forced to BASIC trust level
      expect(user.trustLevel).toBe(String(TRUST_LEVELS.BASIC));
      // Should be marked as self-registered
      expect(user.registrationSource).toBe("self");
      // Should be active
      expect(user.isActive).toBe(true);
    });

    it("local API allows any role (for tests/seeding)", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();
      const testEmail = `localapi-${timestamp}@test.com`;

      // Local API (no req or req.payloadAPI !== "REST") should allow any role
      const user = await payload.create({
        collection: "users",
        data: {
          email: testEmail,
          password: "SecurePassword123!",
          firstName: "Test",
          lastName: "User",
          role: "admin",
          trustLevel: String(TRUST_LEVELS.TRUSTED),
        },
      });

      expect(user).toBeDefined();
      expect(user.email).toBe(testEmail);
      // Local API preserves the requested role and trust level
      expect(user.role).toBe("admin");
      expect(user.trustLevel).toBe(String(TRUST_LEVELS.TRUSTED));
    });

    it("initializes quotas based on trust level", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();
      const testEmail = `quotas-${timestamp}@test.com`;

      const user = await payload.create({
        collection: "users",
        data: {
          email: testEmail,
          password: "SecurePassword123!",
        },
      });

      // BASIC trust level should have quotas set
      expect(user.quotas).toBeDefined();
      expect(typeof user.quotas?.maxFileUploadsPerDay).toBe("number");
      expect(typeof user.quotas?.maxEventsPerImport).toBe("number");
    });

    it("creates usage tracking on first quota check (lazy initialization)", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();
      const testEmail = `usage-${timestamp}@test.com`;

      const user = await payload.create({
        collection: "users",
        data: {
          email: testEmail,
          password: "SecurePassword123!",
        },
      });

      // User-usage records are created lazily via QuotaService.getOrCreateUsageRecord()
      // They are NOT created immediately on user creation to avoid FK constraint issues
      // (the user transaction hasn't committed yet when afterChange hooks run)

      // Verify no usage record exists yet
      const initialResult = await payload.find({
        collection: "user-usage",
        where: { user: { equals: user.id } },
        limit: 1,
        overrideAccess: true,
      });
      expect(initialResult.docs.length).toBe(0);

      // Trigger lazy creation via quota service
      const { getQuotaService } = await import("@/lib/services/quota-service");
      const quotaService = getQuotaService(payload);
      const usageRecord = await quotaService.getOrCreateUsageRecord(user.id);

      expect(usageRecord).toBeDefined();
      expect(usageRecord.currentActiveSchedules).toBe(0);
      expect(usageRecord.urlFetchesToday).toBe(0);
      expect(usageRecord.fileUploadsToday).toBe(0);
      expect(usageRecord.importJobsToday).toBe(0);
      expect(usageRecord.totalEventsCreated).toBe(0);

      // Verify record now exists in collection
      const afterResult = await payload.find({
        collection: "user-usage",
        where: { user: { equals: user.id } },
        limit: 1,
        overrideAccess: true,
      });
      expect(afterResult.docs.length).toBe(1);
    });

    it("starts as unverified when email verification is enabled", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();
      const testEmail = `unverified-${timestamp}@test.com`;

      const user = await payload.create({
        collection: "users",
        data: {
          email: testEmail,
          password: "SecurePassword123!",
        },
      });

      // Payload auto-adds _verified field when auth.verify is configured
      // New users should start as unverified
      expect(user._verified).toBe(false);
    });
  });

  describe("Login Flow", () => {
    it("blocks login for unverified users", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();
      const testEmail = `unverified-login-${timestamp}@test.com`;
      const testPassword = "SecurePassword123!";

      // Create user (starts unverified)
      await payload.create({
        collection: "users",
        data: {
          email: testEmail,
          password: testPassword,
        },
      });

      // Attempt login should fail because email is not verified
      await expect(
        payload.login({
          collection: "users",
          data: {
            email: testEmail,
            password: testPassword,
          },
        })
      ).rejects.toThrow("Please verify your email before logging in");
    });

    it("allows login after email verification", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();
      const testEmail = `verified-login-${timestamp}@test.com`;
      const testPassword = "SecurePassword123!";

      // Create user
      const user = await payload.create({
        collection: "users",
        data: {
          email: testEmail,
          password: testPassword,
        },
      });

      // Get verification token and verify email
      const userWithToken = await payload.findByID({
        collection: "users",
        id: user.id,
        showHiddenFields: true,
      });

      if (userWithToken._verificationToken) {
        await payload.verifyEmail({
          collection: "users",
          token: userWithToken._verificationToken,
        });
      }

      // Now login should work
      const loginResult = await payload.login({
        collection: "users",
        data: {
          email: testEmail,
          password: testPassword,
        },
      });

      expect(loginResult).toBeDefined();
      expect(loginResult.user).toBeDefined();
      expect(loginResult.user.email).toBe(testEmail);
      expect(loginResult.token).toBeDefined();
    });

    it("rejects login with incorrect password", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();
      const testEmail = `wrongpass-${timestamp}@test.com`;

      // Create user
      await payload.create({
        collection: "users",
        data: {
          email: testEmail,
          password: "CorrectPassword123!",
        },
      });

      // Attempt login with wrong password
      await expect(
        payload.login({
          collection: "users",
          data: {
            email: testEmail,
            password: "WrongPassword123!",
          },
        })
      ).rejects.toThrow();
    });

    it("rejects login for non-existent user", async () => {
      const { payload } = testEnv;

      await expect(
        payload.login({
          collection: "users",
          data: {
            email: "nonexistent@test.com",
            password: "AnyPassword123!",
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("Email Verification", () => {
    it("sets _verified to true after verification", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();
      const testEmail = `verify-${timestamp}@test.com`;

      // Create user (starts unverified)
      const user = await payload.create({
        collection: "users",
        data: {
          email: testEmail,
          password: "SecurePassword123!",
        },
      });

      expect(user._verified).toBe(false);

      // Get the verification token (normally sent via email)
      const userWithToken = await payload.findByID({
        collection: "users",
        id: user.id,
        showHiddenFields: true,
      });

      // Verify the user using the token
      if (userWithToken._verificationToken) {
        const verifiedUser = await payload.verifyEmail({
          collection: "users",
          token: userWithToken._verificationToken,
        });

        expect(verifiedUser).toBe(true);

        // Check user is now verified
        const updatedUser = await payload.findByID({
          collection: "users",
          id: user.id,
        });

        expect(updatedUser._verified).toBe(true);
      }
    });

    it("rejects invalid verification token", async () => {
      const { payload } = testEnv;

      await expect(
        payload.verifyEmail({
          collection: "users",
          token: "invalid-token-12345",
        })
      ).rejects.toThrow();
    });
  });

  describe("Admin User Creation", () => {
    it("allows admin to create users with any role", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();

      // First create an admin user
      const adminUser = await payload.create({
        collection: "users",
        data: {
          email: `admin-${timestamp}@test.com`,
          password: "AdminPassword123!",
          role: "admin",
        },
        overrideAccess: true, // Bypass access control for test setup
      });

      // Now use admin context to create another user
      const newUser = await payload.create({
        collection: "users",
        data: {
          email: `newuser-${timestamp}@test.com`,
          password: "UserPassword123!",
          role: "editor",
          trustLevel: String(TRUST_LEVELS.TRUSTED),
        },
        user: adminUser,
      });

      // Admin-created user should retain the specified role
      expect(newUser.role).toBe("editor");
      expect(newUser.trustLevel).toBe(String(TRUST_LEVELS.TRUSTED));
      // Admin-created users should be marked as admin-created
      expect(newUser.registrationSource).toBe("admin");
    });
  });

  describe("Access Control", () => {
    it("allows user to read their own profile", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();
      const testEmail = `readown-${timestamp}@test.com`;

      // Create user
      const user = await payload.create({
        collection: "users",
        data: {
          email: testEmail,
          password: "SecurePassword123!",
        },
      });

      // Read own profile with user context
      const ownProfile = await payload.findByID({
        collection: "users",
        id: user.id,
        user: user,
      });

      expect(ownProfile.email).toBe(testEmail);
    });

    it("filters query results based on user context", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();

      // Create two users
      const user1 = await payload.create({
        collection: "users",
        data: {
          email: `user1-${timestamp}@test.com`,
          password: "SecurePassword123!",
        },
      });

      await payload.create({
        collection: "users",
        data: {
          email: `user2-${timestamp}@test.com`,
          password: "SecurePassword123!",
        },
      });

      // When user1 queries users with overrideAccess: false
      // they should only see their own profile (access control: id.equals user.id)
      const result = await payload.find({
        collection: "users",
        user: user1,
        overrideAccess: false,
      });

      // User1 should only see their own profile
      expect(result.docs.length).toBe(1);
      expect(result.docs[0].id).toBe(user1.id);
    });

    it("prevents non-admin from updating their role with access control", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();

      const user = await payload.create({
        collection: "users",
        data: {
          email: `rolechange-${timestamp}@test.com`,
          password: "SecurePassword123!",
        },
      });

      // User trying to change their own role should be blocked
      // Must use overrideAccess: false to test access control with local API
      await expect(
        payload.update({
          collection: "users",
          id: user.id,
          data: {
            role: "admin",
          },
          user: user,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });

    it("allows admin to read all profiles", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();

      // Create admin
      const admin = await payload.create({
        collection: "users",
        data: {
          email: `admin-${timestamp}@test.com`,
          password: "AdminPassword123!",
          role: "admin",
        },
        overrideAccess: true,
      });

      // Create regular user
      const regularUser = await payload.create({
        collection: "users",
        data: {
          email: `regular-${timestamp}@test.com`,
          password: "SecurePassword123!",
        },
      });

      // Admin should be able to read regular user's profile
      const result = await payload.find({
        collection: "users",
        where: {
          id: { equals: regularUser.id },
        },
        user: admin,
      });

      expect(result.docs.length).toBe(1);
      expect(result.docs[0].email).toBe(regularUser.email);
    });

    it("blocks unauthenticated access with access control enforced", async () => {
      const { payload } = testEnv;
      const timestamp = Date.now();

      // Create user
      await payload.create({
        collection: "users",
        data: {
          email: `noauth-${timestamp}@test.com`,
          password: "SecurePassword123!",
        },
      });

      // Unauthenticated request with access control enforced should throw Forbidden
      // Must use overrideAccess: false to test access control with local API
      await expect(
        payload.find({
          collection: "users",
          overrideAccess: false,
          // No user context = unauthenticated
        })
      ).rejects.toThrow("You are not allowed to perform this action");
    });
  });
});
