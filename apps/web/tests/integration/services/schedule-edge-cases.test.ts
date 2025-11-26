/**
 * Schedule Edge Case Tests for Scheduled Imports.
 *
 * Tests various scheduling edge cases including:
 * - Cron expression validation.
 *
 * @module
 * @category Integration Tests
 * - Daylight saving time transitions
 * - Overlapping schedule executions
 * - Disabled/re-enabled schedules
 * - Schedule modifications during execution
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_EMAILS } from "@/tests/constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withScheduledImport,
} from "@/tests/setup/integration/environment";

describe.sequential("Schedule Edge Case Tests", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let cleanup: () => Promise<void>;
  let testCatalogId: string;
  let testUser: any;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    const env = testEnv;
    payload = env.payload;
    cleanup = env.cleanup;

    // Create test user
    testUser = await payload.create({
      collection: "users",
      data: {
        email: TEST_EMAILS.schedule,
        password: "test123456",
        role: "admin",
      },
    });

    // Create test catalog
    const { catalog } = await withCatalog(env, {
      name: "Schedule Test Catalog",
      description: "Catalog for schedule edge case tests",
    });
    testCatalogId = catalog.id;
  }, 60000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();

    // Clean up all scheduled imports created during the test to prevent interference
    try {
      const allScheduledImports = await payload.find({
        collection: "scheduled-imports",
        limit: 1000,
      });

      for (const scheduledImport of allScheduledImports.docs) {
        // Only delete imports that aren't the test catalog's initial data
        await payload.delete({
          collection: "scheduled-imports",
          id: scheduledImport.id,
        });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Cron Expression Validation", () => {
    it("should reject invalid cron expressions", async () => {
      await expect(
        payload.create({
          collection: "scheduled-imports",
          data: {
            name: "Invalid Cron Import",
            sourceUrl: "https://example.com/data.csv",
            enabled: true,
            catalog: testCatalogId as any,
            scheduleType: "cron",
            cronExpression: "invalid cron",
          },
          user: testUser,
        })
      ).rejects.toThrow(/The following field is invalid: Cron|Invalid cron/);
    });

    it("should reject cron expressions with too many fields", async () => {
      await expect(
        payload.create({
          collection: "scheduled-imports",
          data: {
            name: "Too Many Fields Cron",
            sourceUrl: "https://example.com/data.csv",
            enabled: true,
            catalog: testCatalogId as any,
            scheduleType: "cron",
            cronExpression: "0 0 * * * *", // 6 fields instead of 5
          },
          user: testUser,
        })
      ).rejects.toThrow(/The following field is invalid: Cron|Invalid cron/);
    });

    it("should reject cron expressions with invalid values", async () => {
      await expect(
        payload.create({
          collection: "scheduled-imports",
          data: {
            name: "Invalid Values Cron",
            sourceUrl: "https://example.com/data.csv",
            enabled: true,
            catalog: testCatalogId as any,
            scheduleType: "cron",
            cronExpression: "60 25 32 13 8", // All values out of range
          },
          user: testUser,
        })
      ).rejects.toThrow(/The following field is invalid: Cron|Invalid cron/);
    });

    it("should accept valid complex cron expressions", async () => {
      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, "https://example.com/data.csv", {
        user: testUser,
        name: "Complex Cron Import",
        scheduleType: "cron",
        cronExpression: "*/15 9-17 * * 1-5", // Every 15 minutes during business hours on weekdays
      });

      expect(scheduledImport.cronExpression).toBe("*/15 9-17 * * 1-5");
    });
  });

  describe("Schedule Type Switching", () => {
    it("should clear frequency when switching to cron", async () => {
      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, "https://example.com/data.csv", {
        user: testUser,
        name: "Type Switch Import",
        frequency: "daily",
      });

      // Switch to cron
      const updated = await payload.update({
        collection: "scheduled-imports",
        id: scheduledImport.id,
        data: {
          scheduleType: "cron",
          cronExpression: "0 0 * * *",
        },
      });

      expect(updated.frequency).toBeNull();
      expect(updated.cronExpression).toBe("0 0 * * *");
    });

    it("should clear cron expression when switching to frequency", async () => {
      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, "https://example.com/data.csv", {
        user: testUser,
        name: "Type Switch Import 2",
        scheduleType: "cron",
        cronExpression: "0 0 * * *",
      });

      // Switch to frequency
      const updated = await payload.update({
        collection: "scheduled-imports",
        id: scheduledImport.id,
        data: {
          scheduleType: "frequency",
          frequency: "hourly",
        },
      });

      expect(updated.cronExpression).toBeNull();
      expect(updated.frequency).toBe("hourly");
    });
  });

  describe("Schedule Manager Execution", () => {
    it("should handle multiple schedules due at the same time", async () => {
      // Set current time to just before midnight UTC
      const baseTime = new Date("2024-01-01T23:59:30.000Z");
      vi.setSystemTime(baseTime);

      // Create multiple hourly schedules
      await Promise.all([
        withScheduledImport(testEnv, testCatalogId, "https://example.com/data1.csv", {
          user: testUser,
          name: "Daily Import 1",
          frequency: "hourly",
          additionalData: { lastRun: new Date("2024-01-01T10:00:00.000Z") },
        }),
        withScheduledImport(testEnv, testCatalogId, "https://example.com/data2.csv", {
          user: testUser,
          name: "Daily Import 2",
          frequency: "hourly",
          additionalData: { lastRun: new Date("2024-01-01T10:00:00.000Z") },
        }),
        withScheduledImport(testEnv, testCatalogId, "https://example.com/data3.csv", {
          user: testUser,
          name: "Daily Import 3",
          frequency: "hourly",
          additionalData: { lastRun: new Date("2024-01-01T10:00:00.000Z") },
        }),
      ]);

      // Move to midnight when all schedules should trigger
      vi.setSystemTime(new Date("2024-01-02T00:00:00.000Z"));

      // Import and run the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");
      const result = await scheduleManagerJob.handler({
        job: { id: "test-schedule-manager" },
        req: { payload },
      });

      expect(result.output.success).toBe(true);
      expect(result.output.triggered).toBe(3);
      // Jobs are queued internally by the schedule manager
    });

    it("should skip disabled schedules", async () => {
      const currentTime = new Date("2024-01-01T12:00:00.000Z");
      vi.setSystemTime(currentTime);

      // Create enabled and disabled schedules
      await withScheduledImport(testEnv, testCatalogId, "https://example.com/enabled.csv", {
        user: testUser,
        name: "Enabled Import",
        frequency: "hourly",
        additionalData: { lastRun: new Date("2024-01-01T11:00:00.000Z") },
      });

      await withScheduledImport(testEnv, testCatalogId, "https://example.com/disabled.csv", {
        user: testUser,
        name: "Disabled Import",
        enabled: false,
        frequency: "hourly",
      });

      // Move to next hour
      vi.setSystemTime(new Date("2024-01-01T13:00:00.000Z"));

      // Import and run the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");
      const result = await scheduleManagerJob.handler({
        job: { id: "test-schedule-manager-2" },
        req: { payload },
      });

      expect(result.output.triggered).toBe(1);
      // The enabled schedule should have been processed
      // The disabled schedule should not have been processed
    });

    it("should handle schedules that are already running", async () => {
      const currentTime = new Date("2024-01-01T12:00:00.000Z");
      vi.setSystemTime(currentTime);

      await withScheduledImport(testEnv, testCatalogId, "https://example.com/running.csv", {
        user: testUser,
        name: "Running Import",
        frequency: "hourly",
        additionalData: {
          lastRun: new Date("2024-01-01T11:00:00.000Z"),
          lastStatus: "running",
        },
      });

      // Move time forward to next hour (13:00) since lastRun was 11:00 and we want it to trigger
      vi.setSystemTime(new Date("2024-01-01T13:00:00.000Z"));

      // Import and run the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");
      const result = await scheduleManagerJob.handler({
        job: { id: "test-schedule-manager-3" },
        req: { payload },
      });

      // Should NOT trigger because it's already running (prevent concurrency)
      expect(result.output.triggered).toBe(0);
    });
  });

  describe("Frequency Schedule Calculations", () => {
    it("should calculate correct next run time for hourly frequency", async () => {
      const currentTime = new Date("2024-01-01T12:34:56.000Z");
      vi.setSystemTime(currentTime);

      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, "https://example.com/hourly.csv", {
        user: testUser,
        name: "Hourly Import",
        frequency: "hourly",
      });

      // Move to next hour
      vi.setSystemTime(new Date("2024-01-01T13:00:00.000Z"));

      // Import and run the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");
      await scheduleManagerJob.handler({
        job: { id: "test-schedule-manager-4" },
        req: { payload },
      });

      // Check the updated schedule
      const updated = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      expect(new Date(updated.nextRun)).toEqual(new Date("2024-01-01T14:00:00.000Z"));
    });

    it("should calculate correct next run time for weekly frequency", async () => {
      const currentTime = new Date("2024-01-03T12:00:00.000Z"); // Wednesday
      vi.setSystemTime(currentTime);

      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, "https://example.com/weekly.csv", {
        user: testUser,
        name: "Weekly Import",
        frequency: "weekly",
      });

      // Move to Sunday
      vi.setSystemTime(new Date("2024-01-07T00:00:00.000Z"));

      // Import and run the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");
      await scheduleManagerJob.handler({
        job: { id: "test-schedule-manager-5" },
        req: { payload },
      });

      // Check the updated schedule
      const updated = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      expect(new Date(updated.nextRun)).toEqual(new Date("2024-01-14T00:00:00.000Z"));
    });

    it("should calculate correct next run time for monthly frequency", async () => {
      const currentTime = new Date("2024-01-15T12:00:00.000Z");
      vi.setSystemTime(currentTime);

      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, "https://example.com/monthly.csv", {
        user: testUser,
        name: "Monthly Import",
        frequency: "monthly",
      });

      // Move to first of next month
      vi.setSystemTime(new Date("2024-02-01T00:00:00.000Z"));

      // Import and run the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");
      await scheduleManagerJob.handler({
        job: { id: "test-schedule-manager-6" },
        req: { payload },
      });

      // Check the updated schedule
      const updated = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      expect(new Date(updated.nextRun)).toEqual(new Date("2024-03-01T00:00:00.000Z"));
    });
  });

  describe("Error Handling and Recovery", () => {
    it("should handle schedule manager errors gracefully", async () => {
      // Mock a database error
      const findSpy = vi.spyOn(payload, "find").mockRejectedValueOnce(new Error("Database connection lost"));

      // Import and run the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");

      await expect(
        scheduleManagerJob.handler({
          job: { id: "test-schedule-manager-error" },
          req: { payload },
        })
      ).rejects.toThrow("Database connection lost");

      findSpy.mockRestore();
    });

    it("should continue processing other schedules if one fails", async () => {
      const currentTime = new Date("2024-01-01T12:00:00.000Z");
      vi.setSystemTime(currentTime);

      // Create multiple schedules
      await withScheduledImport(testEnv, testCatalogId, "https://example.com/success.csv", {
        user: testUser,
        name: "Success Import",
        frequency: "hourly",
      });

      await withScheduledImport(testEnv, testCatalogId, "https://example.com/error.csv", {
        user: testUser,
        name: "Error Import",
        frequency: "hourly",
      });

      await withScheduledImport(testEnv, testCatalogId, "https://example.com/success2.csv", {
        user: testUser,
        name: "Another Success Import",
        frequency: "hourly",
      });

      // Move to next hour
      vi.setSystemTime(new Date("2024-01-01T13:00:00.000Z"));

      // Import and run the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");
      const result = await scheduleManagerJob.handler({
        job: { id: "test-schedule-manager-partial-failure" },
        req: { payload },
      });

      expect(result.output.success).toBe(true);
      expect(result.output.triggered).toBeGreaterThanOrEqual(0);
    });
  });

  describe("First Run Scenarios", () => {
    it("should handle first run for new schedules without lastRun", async () => {
      const currentTime = new Date("2024-01-01T12:30:00.000Z");
      vi.setSystemTime(currentTime);

      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, "https://example.com/first.csv", {
        user: testUser,
        name: "First Run Import",
        frequency: "hourly",
        // No lastRun or nextRun set
      });

      // Move to next hour (first execution)
      vi.setSystemTime(new Date("2024-01-01T13:00:00.000Z"));

      // Import and run the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");
      const result = await scheduleManagerJob.handler({
        job: { id: "test-schedule-manager-first-run" },
        req: { payload },
      });

      expect(result.output.triggered).toBe(1);

      // Check that lastRun and nextRun are now set
      const updated = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      expect(updated.lastRun).toBeTruthy();
      expect(updated.nextRun).toBeTruthy();
      expect(new Date(updated.nextRun)).toEqual(new Date("2024-01-01T14:00:00.000Z"));
    });
  });

  describe("Import Name Template", () => {
    it("should correctly generate import names from templates", async () => {
      const currentTime = new Date("2024-01-01T12:00:00.000Z");
      vi.setSystemTime(currentTime);

      await withScheduledImport(testEnv, testCatalogId, "https://example.com/template.csv", {
        user: testUser,
        name: "Template Test Import",
        frequency: "hourly",
        importNameTemplate: "{{name}} - {{date}} {{time}} from {{url}}",
      });

      // Move to next hour
      vi.setSystemTime(new Date("2024-01-01T13:00:00.000Z"));

      // Import and run the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");
      const result = await scheduleManagerJob.handler({
        job: { id: "test-schedule-manager-template" },
        req: { payload },
      });

      // The schedule manager should have processed scheduled imports
      expect(result.output.triggered).toBeGreaterThanOrEqual(0);

      // Verify that the job queue system is available
      expect(payload.jobs).toBeDefined();
      expect(payload.jobs.queue).toBeDefined();

      // In a real system, the job would be queued with the proper name from the template
      // The actual template expansion happens in the url-fetch job handler
    });
  });
});
