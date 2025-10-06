/**
 * Integration tests for the quota system.
 *
 * These tests verify that quotas are properly enforced, usage is tracked,
 * and operations are blocked when limits are exceeded.
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { QUOTA_TYPES, TRUST_LEVELS, USAGE_TYPES } from "@/lib/constants/quota-constants";
import { getQuotaService, QuotaExceededError } from "@/lib/services/quota-service";
import type { User } from "@/payload-types";

import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

// Force sequential execution for this test file to avoid database state conflicts
// All tests in this file share the same database within a worker
describe.sequential("Quota System", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testUser: User;
  let adminUser: User;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;

    // Create test users with different trust levels
    testUser = await payload.create({
      collection: "users",
      data: {
        email: "limited@test.com",
        password: "password123",
        role: "user",
        trustLevel: String(TRUST_LEVELS.BASIC), // Limited quotas
        quotas: {
          maxFileUploadsPerDay: 2,
          maxUrlFetchesPerDay: 3,
          maxActiveSchedules: 1,
          maxEventsPerImport: 100,
          maxTotalEvents: 500,
          maxImportJobsPerDay: 2,
          maxFileSizeMB: 5,
        },
        usage: {
          fileUploadsToday: 0,
          urlFetchesToday: 0,
          currentActiveSchedules: 0,
          importJobsToday: 0,
          totalEventsCreated: 0,
          lastResetDate: new Date().toISOString(),
        },
      },
    });

    adminUser = await payload.create({
      collection: "users",
      data: {
        email: "admin@test.com",
        password: "password123",
        role: "admin",
        trustLevel: String(TRUST_LEVELS.UNLIMITED), // Convert to string
        // Don't provide quotas - let the hook set them based on trust level
      },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe("Quota Checking", () => {
    it("should allow operations within quota limits", async () => {
      const quotaService = getQuotaService(payload);

      // Get fresh user after reset
      const user = await payload.findByID({
        collection: "users",
        id: testUser.id,
      });

      const result = await quotaService.checkQuota(user, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 1);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(2);
      expect(result.remaining).toBe(2);
    });

    it("should block operations that exceed quota limits", async () => {
      const quotaService = getQuotaService(payload);

      // Get fresh user after reset
      const user = await payload.findByID({
        collection: "users",
        id: testUser.id,
      });

      // Try to use 3 uploads when limit is 2
      const result = await quotaService.checkQuota(user, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 3);

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(2);
    });

    it("should allow unlimited operations for admin users", async () => {
      const quotaService = getQuotaService(payload);

      // Get fresh admin user to ensure quotas are loaded
      const admin = await payload.findByID({
        collection: "users",
        id: adminUser.id,
      });

      console.log("Admin user quotas:", admin.quotas);
      console.log("Admin user trust level:", admin.trustLevel);

      // Admin user created with trust level 5 should have unlimited quotas
      const result = await quotaService.checkQuota(admin, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 1000000);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1); // Unlimited
    });
  });

  describe("Usage Tracking", () => {
    it("should increment usage counters", async () => {
      const quotaService = getQuotaService(payload);

      // Ensure clean state for this test
      await payload.update({
        collection: "users",
        id: testUser.id,
        data: {
          usage: {
            currentActiveSchedules: 0,
            urlFetchesToday: 0,
            fileUploadsToday: 0,
            importJobsToday: 0,
            totalEventsCreated: 0,
            lastResetDate: new Date().toISOString(),
          },
        },
      });

      // Track a file upload
      await quotaService.incrementUsage(testUser.id, USAGE_TYPES.FILE_UPLOADS_TODAY, 1);

      // Check the usage was recorded
      const updatedUser = await payload.findByID({
        collection: "users",
        id: testUser.id,
      });

      expect(updatedUser.usage.fileUploadsToday).toBe(1);
    });

    it("should enforce quotas after usage increments", async () => {
      const quotaService = getQuotaService(payload);

      // Ensure clean state
      await payload.update({
        collection: "users",
        id: testUser.id,
        data: {
          usage: {
            currentActiveSchedules: 0,
            urlFetchesToday: 0,
            fileUploadsToday: 0,
            importJobsToday: 0,
            totalEventsCreated: 0,
            lastResetDate: new Date().toISOString(),
          },
        },
      });

      // Use up the quota (increment to reach limit of 2)
      await quotaService.incrementUsage(
        testUser.id,
        USAGE_TYPES.FILE_UPLOADS_TODAY,
        2 // Increment by 2 to reach the limit
      );

      // Get fresh user data after increment
      const updatedUser = await payload.findByID({
        collection: "users",
        id: testUser.id,
      });

      // Now check if further uploads are blocked
      const result = await quotaService.checkQuota(updatedUser, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 1);

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(2);
      expect(result.limit).toBe(2);
      expect(result.remaining).toBe(0);
    });

    it("should throw QuotaExceededError when validateQuota fails", async () => {
      const quotaService = getQuotaService(payload);

      // Ensure clean state
      await payload.update({
        collection: "users",
        id: testUser.id,
        data: {
          usage: {
            currentActiveSchedules: 0,
            urlFetchesToday: 0,
            fileUploadsToday: 0,
            importJobsToday: 0,
            totalEventsCreated: 0,
            lastResetDate: new Date().toISOString(),
          },
        },
      });

      // Max out the quota
      await quotaService.incrementUsage(
        testUser.id,
        USAGE_TYPES.FILE_UPLOADS_TODAY,
        2 // Max out the limit of 2
      );

      // Get fresh user with updated usage
      const user = await payload.findByID({
        collection: "users",
        id: testUser.id,
      });

      // This should throw since we're at the limit
      await expect(quotaService.validateQuota(user, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 1)).rejects.toThrow(
        QuotaExceededError
      );
    });
  });

  describe("Daily Reset", () => {
    it("should reset daily counters", async () => {
      const quotaService = getQuotaService(payload);

      // First add some usage to reset
      await quotaService.incrementUsage(testUser.id, USAGE_TYPES.FILE_UPLOADS_TODAY, 3);
      await quotaService.incrementUsage(testUser.id, USAGE_TYPES.URL_FETCHES_TODAY, 5);

      // Reset the daily counters
      await quotaService.resetDailyCounters(testUser.id);

      // Check counters were reset
      const updatedUser = await payload.findByID({
        collection: "users",
        id: testUser.id,
      });

      expect(updatedUser.usage.fileUploadsToday).toBe(0);
      expect(updatedUser.usage.urlFetchesToday).toBe(0);
      expect(updatedUser.usage.importJobsToday).toBe(0);
      // Total events should NOT be reset
      expect(updatedUser.usage.totalEventsCreated).toBeGreaterThanOrEqual(0);
    });

    it("should allow operations after daily reset", async () => {
      const quotaService = getQuotaService(payload);

      // Get fresh user after reset
      const user = await payload.findByID({
        collection: "users",
        id: testUser.id,
      });

      const result = await quotaService.checkQuota(user, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 1);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.remaining).toBe(2);
    });
  });

  describe("File Upload Quota Checking", () => {
    it("should block operations when file upload quota exceeded", async () => {
      // Max out the file upload quota for testUser
      const quotaService = getQuotaService(payload);
      await quotaService.incrementUsage(testUser.id, USAGE_TYPES.FILE_UPLOADS_TODAY, 2);

      // Get fresh user
      const user = await payload.findByID({
        collection: "users",
        id: testUser.id,
      });

      // Check if another upload would be blocked
      const result = await quotaService.checkQuota(user, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 1);

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(2);
      expect(result.limit).toBe(2);
    });

    it("should allow unlimited file uploads for admin users", async () => {
      const quotaService = getQuotaService(payload);

      // Get fresh admin user to ensure we have latest data
      const admin = await payload.findByID({
        collection: "users",
        id: adminUser.id,
      });

      // Admin should have unlimited uploads
      const result = await quotaService.checkQuota(admin, QUOTA_TYPES.FILE_UPLOADS_PER_DAY, 100);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1); // Unlimited
    });
  });

  describe("Scheduled Import Quotas", () => {
    it("should enforce active schedule limits", async () => {
      const quotaService = getQuotaService(payload);

      // Get fresh user after reset
      const user = await payload.findByID({
        collection: "users",
        id: testUser.id,
      });

      // Check if user can create a schedule (limit is 1)
      const result = await quotaService.checkQuota(user, QUOTA_TYPES.ACTIVE_SCHEDULES, 1);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(1);

      // Simulate having an active schedule
      await quotaService.incrementUsage(testUser.id, USAGE_TYPES.CURRENT_ACTIVE_SCHEDULES, 1);

      // Check if another schedule would be blocked
      const updatedUser = await payload.findByID({
        collection: "users",
        id: testUser.id,
      });

      const result2 = await quotaService.checkQuota(updatedUser, QUOTA_TYPES.ACTIVE_SCHEDULES, 1);

      expect(result2.allowed).toBe(false);
      expect(result2.current).toBe(1);
      expect(result2.limit).toBe(1);
    });
  });

  describe("URL Fetch Quotas", () => {
    it("should track and limit URL fetches", async () => {
      const quotaService = getQuotaService(payload);

      // Reset daily counters first
      await quotaService.resetDailyCounters(testUser.id);

      // Track URL fetches
      for (let i = 0; i < 3; i++) {
        await quotaService.incrementUsage(testUser.id, USAGE_TYPES.URL_FETCHES_TODAY, 1);
      }

      // Get updated user
      const user = await payload.findByID({
        collection: "users",
        id: testUser.id,
      });

      // Check if next fetch would be blocked (limit is 3)
      const result = await quotaService.checkQuota(user, QUOTA_TYPES.URL_FETCHES_PER_DAY, 1);

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(3);
      expect(result.limit).toBe(3);
      expect(result.remaining).toBe(0);
    });
  });

  describe("Event Creation Quotas", () => {
    it("should enforce total event limits", async () => {
      const quotaService = getQuotaService(payload);

      // Set user near their total event limit
      await payload.update({
        collection: "users",
        id: testUser.id,
        data: {
          usage: {
            totalEventsCreated: 499, // Limit is 500
          },
        },
      });

      // Get updated user
      const user = await payload.findByID({
        collection: "users",
        id: testUser.id,
      });

      // Check if creating 2 events would exceed limit
      const result = await quotaService.checkQuota(user, QUOTA_TYPES.TOTAL_EVENTS, 2);

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(499);
      expect(result.limit).toBe(500);
      expect(result.remaining).toBe(1);
    });
  });
});
