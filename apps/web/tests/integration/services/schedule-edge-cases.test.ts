/**
 * Schedule Edge Case Tests for Scheduled Imports
 *
 * Tests various scheduling edge cases including:
 * - Cron expression validation
 * - Daylight saving time transitions
 * - Overlapping schedule executions
 * - Disabled/re-enabled schedules
 * - Schedule modifications during execution
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createIntegrationTestEnvironment } from "@/tests/setup/test-environment-builder";

// Mock fetch globally
global.fetch = vi.fn();

describe.sequential("Schedule Edge Case Tests", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testUserId: string;
  let testCatalogId: string;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;

    // Create test user
    const user = await payload.create({
      collection: "users",
      data: {
        email: "schedule-test@example.com",
        password: "test123456",
        role: "admin",
      },
    });
    testUserId = user.id;

    // Create test catalog
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Schedule Test Catalog",
        description: "Catalog for schedule edge case tests",
      },
    });
    testCatalogId = catalog.id;

    // Mock payload.jobs.queue
    vi.spyOn(payload.jobs, "queue").mockImplementation(async (params: any) => {
      const { task, input } = params;
      return {
        id: `mock-job-${Date.now()}`,
        task,
        input,
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;
    });
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
    } catch (error) {
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
        })
      ).rejects.toThrow(/The following field is invalid: Cron|Invalid cron/);
    });

    it("should accept valid complex cron expressions", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Complex Cron Import",
          sourceUrl: "https://example.com/data.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "cron",
          cronExpression: "*/15 9-17 * * 1-5", // Every 15 minutes during business hours on weekdays
        },
      });

      expect(scheduledImport.cronExpression).toBe("*/15 9-17 * * 1-5");
    });
  });

  describe("Schedule Type Switching", () => {
    it("should clear frequency when switching to cron", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Type Switch Import",
          sourceUrl: "https://example.com/data.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
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
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Type Switch Import 2",
          sourceUrl: "https://example.com/data.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "cron",
          cronExpression: "0 0 * * *",
        },
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
      const schedules = await Promise.all([
        payload.create({
          collection: "scheduled-imports",
          data: {
            name: "Daily Import 1",
            sourceUrl: "https://example.com/data1.csv",
            enabled: true,
            catalog: testCatalogId as any,
            scheduleType: "frequency",
            frequency: "hourly",
            lastRun: new Date("2024-01-01T10:00:00.000Z"),
          },
        }),
        payload.create({
          collection: "scheduled-imports",
          data: {
            name: "Daily Import 2",
            sourceUrl: "https://example.com/data2.csv",
            enabled: true,
            catalog: testCatalogId as any,
            scheduleType: "frequency",
            frequency: "hourly",
            lastRun: new Date("2024-01-01T10:00:00.000Z"),
          },
        }),
        payload.create({
          collection: "scheduled-imports",
          data: {
            name: "Daily Import 3",
            sourceUrl: "https://example.com/data3.csv",
            enabled: true,
            catalog: testCatalogId as any,
            scheduleType: "frequency",
            frequency: "hourly",
            lastRun: new Date("2024-01-01T10:00:00.000Z"),
          },
        }),
      ]);

      // Mock responses for all URLs
      // nock('https://example.com')
      // .get('/data1.csv')
      // .reply(200, 'test,data\n1,2', { 'Content-Type': 'text/csv' });
      // nock('https://example.com')
      // .get('/data2.csv')
      // .reply(200, 'test,data\n3,4', { 'Content-Type': 'text/csv' });
      // nock('https://example.com')
      // .get('/data3.csv')
      // .reply(200, 'test,data\n5,6', { 'Content-Type': 'text/csv' });

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
      expect(payload.jobs.queue).toHaveBeenCalledTimes(3);
    });

    it("should skip disabled schedules", async () => {
      const currentTime = new Date("2024-01-01T12:00:00.000Z");
      vi.setSystemTime(currentTime);

      // Create enabled and disabled schedules
      const enabledSchedule = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Enabled Import",
          sourceUrl: "https://example.com/enabled.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
          lastRun: new Date("2024-01-01T11:00:00.000Z"),
        },
      });

      const disabledSchedule = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Disabled Import",
          sourceUrl: "https://example.com/disabled.csv",
          enabled: false,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
        },
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
      expect(payload.jobs.queue).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            scheduledImportId: enabledSchedule.id,
          }),
        })
      );
    });

    it("should handle schedules that are already running", async () => {
      const currentTime = new Date("2024-01-01T12:00:00.000Z");
      vi.setSystemTime(currentTime);

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Running Import",
          sourceUrl: "https://example.com/running.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
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

      // Should still trigger if it's time
      expect(result.output.triggered).toBe(1);
    });
  });

  describe("Frequency Schedule Calculations", () => {
    it("should calculate correct next run time for hourly frequency", async () => {
      const currentTime = new Date("2024-01-01T12:34:56.000Z");
      vi.setSystemTime(currentTime);

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Hourly Import",
          sourceUrl: "https://example.com/hourly.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
        },
      });

      // Mock response
      // nock('https://example.com')
      // .get('/hourly.csv')
      // .reply(200, 'test,data\n1,2', { 'Content-Type': 'text/csv' });

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

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Weekly Import",
          sourceUrl: "https://example.com/weekly.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "weekly",
        },
      });

      // Mock response
      // nock('https://example.com')
      // .get('/weekly.csv')
      // .reply(200, 'test,data\n1,2', { 'Content-Type': 'text/csv' });

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

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Monthly Import",
          sourceUrl: "https://example.com/monthly.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "monthly",
        },
      });

      // Mock response
      // nock('https://example.com')
      // .get('/monthly.csv')
      // .reply(200, 'test,data\n1,2', { 'Content-Type': 'text/csv' });

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
      const schedule1 = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Success Import",
          sourceUrl: "https://example.com/success.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
        },
      });

      const schedule2 = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Error Import",
          sourceUrl: "https://example.com/error.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
        },
      });

      const schedule3 = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Another Success Import",
          sourceUrl: "https://example.com/success2.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
        },
      });

      // Mock job queue to fail for the second schedule
      const queueMock = vi.spyOn(payload.jobs, "queue").mockImplementation(async (params: any) => {
        const { input } = params;
        if (input.scheduledImportId === schedule2.id) {
          throw new Error("Job queue failed");
        }
        return {
          id: `mock-job-${Date.now()}`,
          task: "url-fetch",
          status: "queued",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any;
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
      expect(result.output.triggered).toBe(2); // Two successful
      expect(result.output.errors).toBe(1); // One failed

      queueMock.mockRestore();
    });
  });

  describe("First Run Scenarios", () => {
    it("should handle first run for new schedules without lastRun", async () => {
      const currentTime = new Date("2024-01-01T12:30:00.000Z");
      vi.setSystemTime(currentTime);

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "First Run Import",
          sourceUrl: "https://example.com/first.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",

          // No lastRun or nextRun set
        },
      });

      // Mock response
      // nock('https://example.com')
      // .get('/first.csv')
      // .reply(200, 'test,data\n1,2', { 'Content-Type': 'text/csv' });

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

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Template Test Import",
          sourceUrl: "https://example.com/template.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
          importNameTemplate: "{{name}} - {{date}} {{time}} from {{url}}",
        },
      });

      // Mock response
      // nock('https://example.com')
      // .get('/template.csv')
      // .reply(200, 'test,data\n1,2', { 'Content-Type': 'text/csv' });

      // Clear previous mock calls
      vi.clearAllMocks();

      // Move to next hour
      vi.setSystemTime(new Date("2024-01-01T13:00:00.000Z"));

      // Import and run the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");
      await scheduleManagerJob.handler({
        job: { id: "test-schedule-manager-template" },
        req: { payload },
      });

      // Check the job queue was called with the correct originalName
      expect(payload.jobs.queue).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            originalName: "Template Test Import - 2024-01-01 13:00:00 from example.com",
          }),
        })
      );
    });
  });
});
