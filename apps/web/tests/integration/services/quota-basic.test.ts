/**
 * Basic test to verify quota system is working.
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { QUOTA_TYPES, USAGE_TYPES } from "@/lib/constants/permission-constants";
import { getPermissionService } from "@/lib/services/permission-service";

import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

// Force sequential execution to avoid database state conflicts
describe.sequential("Basic Quota Test", () => {
  let payload: any;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should block operations when quota is exceeded", async () => {
    // Create an admin user to perform updates
    const adminUser = await payload.create({
      collection: "users",
      data: {
        email: "admin@quota.test",
        password: "password123",
        role: "admin",
        trustLevel: "5",
      },
    });

    // Create a limited user
    const user = await payload.create({
      collection: "users",
      data: {
        email: "limited@quota.test",
        password: "password123",
        role: "user",
        trustLevel: "1", // Basic trust level
      },
    });

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

    const permissionService = getPermissionService(payload);

    // First check - should be allowed
    const check1 = await permissionService.checkQuota(updatedUser, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 1);

    console.log("First check:", check1);
    expect(check1.allowed).toBe(true);
    expect(check1.limit).toBe(1);
    expect(check1.current).toBe(0);

    // Track usage
    await permissionService.incrementUsage(user.id, USAGE_TYPES.FILE_UPLOADS_TODAY, 1);

    // Get fresh user
    const freshUser = await payload.findByID({
      collection: "users",
      id: user.id,
    });

    console.log("User quotas:", freshUser.quotas);
    console.log("User usage:", freshUser.usage);

    // Second check - should be blocked
    const check2 = await permissionService.checkQuota(freshUser, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 1);

    console.log("Second check:", check2);
    expect(check2.allowed).toBe(false);
    expect(check2.current).toBe(1);
    expect(check2.limit).toBe(1);
  });
});
