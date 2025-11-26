/**
 * Basic test to verify quota system is working.
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { QUOTA_TYPES, USAGE_TYPES } from "@/lib/constants/quota-constants";
import { getQuotaService } from "@/lib/services/quota-service";
import type { UserUsage } from "@/payload-types";

import { createIntegrationTestEnvironment, withUsers } from "../../setup/integration/environment";

// Helper to get user usage record
const getUserUsage = async (payload: any, userId: number): Promise<UserUsage | null> => {
  const result = await payload.find({
    collection: "user-usage",
    where: { user: { equals: userId } },
    limit: 1,
  });
  return result.docs[0] ?? null;
};

// Force sequential execution to avoid database state conflicts
describe.sequential("Basic Quota Test", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should block operations when quota is exceeded", async () => {
    // Create an admin user to perform updates and a limited user
    const { users } = await withUsers(testEnv, {
      adminUser: { role: "admin", email: "admin@quota.test", trustLevel: "5" },
      user: { role: "user", email: "limited@quota.test", trustLevel: "1" },
    });
    const adminUser = users.adminUser;
    const user = users.user;

    // Update with specific quota using admin context - must set ALL fields
    const updatedUser = await payload.update({
      collection: "users",
      id: user.id,
      data: {
        quotas: {
          maxActiveSchedules: 1,
          maxUrlFetchesPerDay: 5,
          maxFileUploadsPerDay: 1, // Only 1 file upload allowed
          maxEventsPerImport: 1000,
          maxTotalEvents: 5000,
          maxImportJobsPerDay: 5,
          maxFileSizeMB: 10,
        },
      },
      user: adminUser, // Use admin context for the update
    });

    console.log("Updated user quotas field:", updatedUser.quotas);

    const quotaService = getQuotaService(payload);

    // First check - should be allowed
    const check1 = await quotaService.checkQuota(updatedUser, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 1);

    console.log("First check:", check1);
    expect(check1.allowed).toBe(true);
    expect(check1.limit).toBe(1);
    expect(check1.current).toBe(0);

    // Track usage
    await quotaService.incrementUsage(user.id, USAGE_TYPES.FILE_UPLOADS_TODAY, 1);

    // Get fresh user and usage
    const freshUser = await payload.findByID({
      collection: "users",
      id: user.id,
    });
    const usage = await getUserUsage(payload, user.id);

    console.log("User quotas:", freshUser.quotas);
    console.log("User usage (from user-usage collection):", usage);

    // Second check - should be blocked
    const check2 = await quotaService.checkQuota(freshUser, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 1);

    console.log("Second check:", check2);
    expect(check2.allowed).toBe(false);
    expect(check2.current).toBe(1);
    expect(check2.limit).toBe(1);
  });
});
