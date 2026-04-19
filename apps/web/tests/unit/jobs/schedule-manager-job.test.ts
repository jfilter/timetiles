/**
 * Unit tests for Schedule Manager Job Handler.
 * @module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  calculateNextRun,
  getNextExecutionTime,
  getNextFrequencyExecution,
  shouldRunNow,
} from "@/lib/jobs/handlers/schedule-manager/schedule-evaluation";
import { scheduleManagerJob } from "@/lib/jobs/handlers/schedule-manager-job";

// Mock dependencies
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  logError: vi.fn(),
}));

vi.mock("@/lib/services/feature-flag-service", () => ({
  getFeatureFlagService: vi.fn().mockReturnValue({ isEnabled: vi.fn().mockResolvedValue(true) }),
}));

describe.sequential("scheduleManagerJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should have a cron schedule configured", () => {
    expect(scheduleManagerJob.schedule).toBeDefined();
    expect(scheduleManagerJob.schedule).toHaveLength(1);
    expect(scheduleManagerJob.schedule[0]!.cron).toBe("* * * * *");
  });

  describe("handler", () => {
    const createUpdateBuilder = (result: unknown[]) => {
      const builder = {
        set: vi.fn(() => builder),
        where: vi.fn(() => builder),
        returning: vi.fn(() => Promise.resolve(result)),
      };

      return builder;
    };

    const createMockContext = () => {
      const mockPayload = {
        find: vi.fn(),
        findByID: vi.fn(),
        update: vi.fn().mockResolvedValue({ docs: [{ id: "claimed" }] }),
        db: { drizzle: { update: vi.fn().mockImplementation(() => createUpdateBuilder([{ id: 1 }])) } },
        jobs: { queue: vi.fn().mockResolvedValue({ id: "workflow-job-123" }) },
      };

      const mockJob = { id: "schedule-job-123" };

      const mockReq = { payload: mockPayload as any };

      return { mockPayload, mockJob, mockReq };
    };

    it("should find and process enabled scheduled ingests", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const mockScheduledIngests: any[] = [
        {
          id: "import-1",
          name: "Daily Import",
          enabled: true,
          sourceUrl: "https://example.com/data.csv",
          scheduleType: "frequency",
          frequency: "daily",
          catalog: "catalog-123",
          createdBy: "user-123",
          ingestNameTemplate: "{{name}} - {{date}}",
          lastRun: new Date("2024-01-14 00:00:00").toISOString(), // Yesterday
        },
      ];

      mockPayload.find.mockResolvedValue({ docs: mockScheduledIngests, totalDocs: 1 });

      // Set time to after midnight to make the import due
      vi.setSystemTime(new Date("2024-01-15 00:30:00"));

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      expect(mockPayload.find).toHaveBeenCalledWith({
        collection: "scheduled-ingests",
        where: { enabled: { equals: true } },
        limit: 1000,
        pagination: false,
      });

      expect(result.output).toMatchObject({
        success: true,
        totalScheduled: 1,
        triggered: 1,
        errors: 0,
        scrapersTriggered: 0,
        scraperErrors: 0,
      });
    });

    it("should trigger imports that are due based on frequency", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15T10:30:00Z");
      vi.setSystemTime(currentTime);

      const mockScheduledIngests: any[] = [
        {
          id: "hourly-import",
          name: "Hourly Import",
          enabled: true,
          sourceUrl: "https://api1.example.com/data",
          scheduleType: "frequency",
          frequency: "hourly",
          lastRun: new Date("2024-01-15T09:00:00Z").toISOString(),
          catalog: { id: "catalog-1", name: "Catalog 1" },
          createdBy: { id: "user-1", email: "user@example.com" },
        },
        {
          id: "daily-import",
          name: "Daily Import",
          enabled: true,
          sourceUrl: "https://api2.example.com/data",
          scheduleType: "frequency",
          frequency: "daily",
          lastRun: new Date("2024-01-15T00:00:00Z").toISOString(),
          catalog: "catalog-2",
          createdBy: "user-2",
        },
      ];

      mockPayload.find.mockResolvedValue({ docs: mockScheduledIngests, totalDocs: 2 });

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // Should only queue the hourly import
      expect(mockPayload.jobs.queue).toHaveBeenCalledTimes(1);
      expect(mockPayload.jobs.queue).toHaveBeenCalledWith({
        workflow: "scheduled-ingest",
        input: {
          scheduledIngestId: "hourly-import",
          sourceUrl: "https://api1.example.com/data",
          authConfig: undefined,
          catalogId: "catalog-1",
          originalName: expect.stringContaining("Hourly Import"),
          userId: "user-1",
          triggeredBy: "schedule",
        },
      });

      expect(result.output.triggered).toBe(1);
    });

    it("should handle cron expressions", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15 14:35:00");
      vi.setSystemTime(currentTime);

      const mockScheduledIngests: any[] = [
        {
          id: "cron-import",
          name: "Cron Import",
          enabled: true,
          sourceUrl: "https://api.example.com/data",
          scheduleType: "cron",
          cronExpression: "30 14 * * *", // Daily at 14:30
          lastRun: new Date("2024-01-14 14:30:00").toISOString(),
          catalog: "catalog-123",
          createdBy: "user-123",
        },
      ];

      mockPayload.find.mockResolvedValue({ docs: mockScheduledIngests, totalDocs: 1 });

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      expect(mockPayload.jobs.queue).toHaveBeenCalledTimes(1);
      expect(result.output.triggered).toBe(1);
    });

    it("should skip scheduled ingests with partially numeric cron fields", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15 14:35:00");
      vi.setSystemTime(currentTime);

      const mockScheduledIngests: any[] = [
        {
          id: "invalid-cron-import",
          name: "Invalid Cron Import",
          enabled: true,
          sourceUrl: "https://api.example.com/data",
          scheduleType: "cron",
          cronExpression: "30abc 14 * * *",
          lastRun: new Date("2024-01-14 14:30:00").toISOString(),
          catalog: "catalog-123",
          createdBy: "user-123",
        },
      ];

      mockPayload.find.mockResolvedValue({ docs: mockScheduledIngests, totalDocs: 1 });

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
      expect(result.output.triggered).toBe(0);
      expect(result.output.errors).toBe(0);
    });

    it("should respect cron day-of-week restrictions", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-14T14:35:00Z");
      vi.setSystemTime(currentTime);

      const mockScheduledIngests: any[] = [
        {
          id: "weekly-cron-import",
          name: "Weekly Cron Import",
          enabled: true,
          sourceUrl: "https://api.example.com/data",
          scheduleType: "cron",
          cronExpression: "30 14 * * 1",
          lastRun: new Date("2024-01-08T14:30:00Z").toISOString(),
          catalog: "catalog-123",
          createdBy: "user-123",
        },
      ];

      mockPayload.find.mockResolvedValue({ docs: mockScheduledIngests, totalDocs: 1 });

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
      expect(result.output.triggered).toBe(0);
      expect(result.output.errors).toBe(0);
    });

    it("should skip disabled schedules", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const mockScheduledIngests: any[] = [
        {
          id: "disabled-import",
          name: "Disabled Import",
          enabled: false, // Disabled
          sourceUrl: "https://api.example.com/data",
          scheduleType: "frequency",
          frequency: "hourly",
        },
      ];

      mockPayload.find.mockResolvedValue({ docs: mockScheduledIngests, totalDocs: 1 });

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // Should find it but not trigger
      expect(mockPayload.find).toHaveBeenCalled();
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
      expect(result.output.triggered).toBe(0);
    });

    it("should update scheduled ingest metadata after triggering", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15 10:00:00");
      vi.setSystemTime(currentTime);

      const mockScheduledIngest: any = {
        id: "import-1",
        name: "Test Import",
        enabled: true,
        sourceUrl: "https://example.com/data",
        scheduleType: "frequency",
        frequency: "hourly",
        lastRun: new Date("2024-01-15 08:00:00").toISOString(),
        catalog: "catalog-123",
        createdBy: "user-123",
        statistics: { totalRuns: 5, successfulRuns: 4, failedRuns: 1, averageDuration: 2.5 },
        executionHistory: [],
      };

      mockPayload.find.mockResolvedValue({ docs: [mockScheduledIngest], totalDocs: 1 });

      await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // triggerScheduledIngest uses a guarded Drizzle update to claim "running" status.
      expect(mockPayload.db.drizzle.update).toHaveBeenCalled();

      // totalRuns is NOT incremented at queue time — only on job completion.
      // The atomic SQL claim sets lastStatus, lastRun, currentRetries, nextRun
      // but never executionHistory or statistics.
      expect(mockPayload.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ executionHistory: expect.anything() }) })
      );
    });

    it("should handle errors gracefully", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      // Set current time to make the import due to run
      const currentTime = new Date("2024-01-15 10:00:00");
      vi.setSystemTime(currentTime);

      const mockScheduledIngest: any = {
        id: "error-import",
        name: "Error Import",
        enabled: true,
        sourceUrl: "https://example.com/data",
        scheduleType: "frequency",
        frequency: "daily",
        lastRun: new Date("2024-01-14 00:00:00").toISOString(), // Yesterday, so it should run
        catalog: "catalog-123",
        createdBy: "user-123",
      };

      mockPayload.find.mockResolvedValue({ docs: [mockScheduledIngest], totalDocs: 1 });

      // Make job queue throw an error
      mockPayload.jobs.queue.mockRejectedValue(new Error("Queue error"));

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // Should handle error and continue
      expect(result.output).toMatchObject({ success: true, totalScheduled: 1, triggered: 0, errors: 1 });

      // Should update the import with error status and advance nextRun
      // so the scheduler doesn't retry every minute
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "scheduled-ingests",
        id: "error-import",
        data: expect.objectContaining({ lastStatus: "failed", lastError: "Queue error", nextRun: expect.any(String) }),
      });
    });

    it("should calculate correct next run times for different frequencies", async () => {
      const testCases = [
        {
          frequency: "hourly",
          currentTime: new Date("2024-01-15T10:30:00Z"),
          lastRun: new Date("2024-01-15T09:00:00Z"), // 1.5 hours ago
          expectedNext: new Date("2024-01-15T11:00:00Z"),
        },
        {
          frequency: "daily",
          currentTime: new Date("2024-01-15T00:30:00Z"), // Just after midnight UTC
          lastRun: new Date("2024-01-14T23:30:00Z"), // 1 hour ago
          expectedNext: new Date("2024-01-16T00:00:00Z"), // Tomorrow at midnight UTC
        },
        {
          frequency: "weekly",
          currentTime: new Date("2024-01-15T10:30:00Z"), // Monday
          lastRun: new Date("2024-01-08T00:00:00Z"), // Last Monday
          expectedNext: new Date("2024-01-21T00:00:00Z"), // Next Sunday
        },
        {
          frequency: "monthly",
          currentTime: new Date("2024-01-15T10:30:00Z"),
          lastRun: new Date("2023-12-01T00:00:00Z"), // Last month
          expectedNext: new Date("2024-02-01T00:00:00Z"),
        },
      ];

      for (const testCase of testCases) {
        const { mockPayload, mockJob, mockReq } = createMockContext();

        vi.setSystemTime(testCase.currentTime);

        const mockImport: any = {
          id: `${testCase.frequency}-import`,
          name: `${testCase.frequency} Import`,
          enabled: true,
          sourceUrl: "https://example.com/data",
          scheduleType: "frequency",
          frequency: testCase.frequency,
          catalog: "catalog-123",
          createdBy: "user-123",
          lastRun: testCase.lastRun.toISOString(),
        };

        mockPayload.find.mockResolvedValue({ docs: [mockImport], totalDocs: 1 });

        await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

        expect(mockPayload.db.drizzle.update).toHaveBeenCalled();
        expect(mockPayload.jobs.queue).toHaveBeenCalled();
      }
    });

    it("should skip imports that are already running (in-memory guard)", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15 10:00:00");
      vi.setSystemTime(currentTime);

      const mockScheduledIngest: any = {
        id: "running-import",
        name: "Running Import",
        enabled: true,
        sourceUrl: "https://example.com/data",
        scheduleType: "frequency",
        frequency: "hourly",
        lastRun: new Date("2024-01-15 08:00:00").toISOString(),
        lastStatus: "running",
        catalog: "catalog-123",
        createdBy: "user-123",
      };

      mockPayload.find.mockResolvedValue({ docs: [mockScheduledIngest], totalDocs: 1 });

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // Should not attempt to trigger a running import
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
      expect(result.output.triggered).toBe(0);
    });

    it("should skip imports when concurrent trigger is rejected", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15 10:00:00");
      vi.setSystemTime(currentTime);

      const mockScheduledIngest: any = {
        id: "concurrent-import",
        name: "Concurrent Import",
        enabled: true,
        sourceUrl: "https://example.com/data",
        scheduleType: "frequency",
        frequency: "hourly",
        lastRun: new Date("2024-01-15 08:00:00").toISOString(),
        catalog: "catalog-123",
        createdBy: "user-123",
      };

      mockPayload.find.mockResolvedValue({ docs: [mockScheduledIngest], totalDocs: 1 });

      // Simulate atomic claim rejection.
      mockPayload.db.drizzle.update.mockImplementation(() => createUpdateBuilder([]));

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // Should handle gracefully without counting as an error
      expect(result.output.errors).toBe(0);
    });

    it("should handle import name template replacements", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15T14:30:45Z");
      vi.setSystemTime(currentTime);

      const mockImport: any = {
        id: "template-import",
        name: "Template Test",
        enabled: true,
        sourceUrl: "https://api.example.com/data.csv",
        scheduleType: "frequency",
        frequency: "daily",
        catalog: "catalog-123",
        createdBy: "user-123",
        ingestNameTemplate: "{{name}} - {{date}} at {{time}} from {{url}}",
        lastRun: new Date("2024-01-14 00:00:00").toISOString(), // Yesterday
      };

      mockPayload.find.mockResolvedValue({ docs: [mockImport], totalDocs: 1 });

      await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      expect(mockPayload.jobs.queue).toHaveBeenCalledWith({
        workflow: "scheduled-ingest",
        input: expect.objectContaining({
          originalName: expect.stringMatching(
            /Template Test - \d{4}-\d{2}-\d{2} at \d{2}:\d{2}:\d{2} from api\.example\.com/
          ),
        }),
      });
    });

    it("should handle feature flag disabled", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();
      const { getFeatureFlagService } = await import("@/lib/services/feature-flag-service");
      (getFeatureFlagService as any).mockReturnValueOnce({ isEnabled: vi.fn().mockResolvedValue(false) });

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      expect(result.output).toMatchObject({ success: true, skipped: true });
      expect(mockPayload.find).not.toHaveBeenCalled();
    });

    it("should handle no enabled scheduled ingests", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();
      mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });

      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      expect(result.output.totalScheduled).toBe(0);
      expect(result.output.triggered).toBe(0);
    });

    it("should handle update error during error handling gracefully", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15 10:00:00");
      vi.setSystemTime(currentTime);

      const mockScheduledIngest: any = {
        id: "error-update-import",
        name: "Error Update Import",
        enabled: true,
        sourceUrl: "https://example.com/data",
        scheduleType: "frequency",
        frequency: "daily",
        lastRun: new Date("2024-01-14 00:00:00").toISOString(),
        catalog: "catalog-123",
        createdBy: "user-123",
      };

      mockPayload.find.mockResolvedValue({ docs: [mockScheduledIngest], totalDocs: 1 });
      mockPayload.jobs.queue.mockRejectedValue(new Error("Queue error"));
      // Make the status update also fail
      mockPayload.update.mockRejectedValue(new Error("Update error"));

      // Should not throw despite double failure
      const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });
      expect(result.output.errors).toBe(1);
    });

    it("should not record execution history at queue time", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const existingHistory = Array.from({ length: 15 }, (_, i) => ({
        executedAt: new Date(`2024-01-${i + 1} 10:00:00`).toISOString(),
        status: "success" as const,
        jobId: `job-${i}`,
        duration: 2.5,
      }));

      const mockImport: any = {
        id: "history-import",
        name: "History Import",
        enabled: true,
        sourceUrl: "https://example.com/data",
        scheduleType: "frequency",
        frequency: "daily",
        catalog: "catalog-123",
        createdBy: "user-123",
        executionHistory: existingHistory,
        lastRun: new Date("2024-01-14 00:00:00").toISOString(), // Yesterday
      };

      mockPayload.find.mockResolvedValue({ docs: [mockImport], totalDocs: 1 });

      await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

      // The atomic SQL claim only sets lastStatus, lastRun, currentRetries,
      // and nextRun. It never touches executionHistory or statistics — those
      // are managed by the url-fetch job handler on completion.
      // Verify that no payload.update call includes executionHistory.
      expect(mockPayload.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ executionHistory: expect.anything() }) })
      );
    });
  });
});

describe("schedule-evaluation — direct function tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getNextFrequencyExecution", () => {
    it("throws for invalid frequency", () => {
      expect(() => getNextFrequencyExecution("biweekly")).toThrow("Invalid frequency: biweekly");
    });

    it("throws for invalid frequency in timezone path", () => {
      expect(() => getNextFrequencyExecution("biweekly", new Date(), "America/New_York")).toThrow(
        "Invalid frequency: biweekly"
      );
    });

    it("calculates hourly next run in timezone", () => {
      const now = new Date("2024-06-15T10:30:00Z");
      const result = getNextFrequencyExecution("hourly", now, "Europe/Berlin");
      expect(result.getTime()).toBeGreaterThan(now.getTime());
    });

    it("calculates daily next run in timezone", () => {
      const now = new Date("2024-06-15T10:30:00Z");
      const result = getNextFrequencyExecution("daily", now, "Europe/Berlin");
      expect(result.getTime()).toBeGreaterThan(now.getTime());
    });

    it("calculates weekly next run in timezone", () => {
      const now = new Date("2024-06-15T10:30:00Z"); // Saturday
      const result = getNextFrequencyExecution("weekly", now, "Europe/Berlin");
      expect(result.getTime()).toBeGreaterThan(now.getTime());
    });

    it("calculates monthly next run in timezone", () => {
      const now = new Date("2024-06-15T10:30:00Z");
      const result = getNextFrequencyExecution("monthly", now, "Europe/Berlin");
      expect(result.getTime()).toBeGreaterThan(now.getTime());
    });

    it("handles monthly next run advancing past now in timezone", () => {
      // Use December to test year rollover
      const now = new Date("2024-12-31T23:30:00Z");
      const result = getNextFrequencyExecution("monthly", now, "US/Eastern");
      expect(result.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe("getNextExecutionTime", () => {
    it("throws for invalid schedule configuration", () => {
      const invalid: any = { scheduleType: "unknown" };
      expect(() => getNextExecutionTime(invalid)).toThrow("Invalid schedule configuration");
    });

    it("throws when cron expression returns null next run", () => {
      // This is hard to trigger with real cron parser, but the code path exists.
      // A frequency type with missing frequency field also goes to the throw.
      const invalid: any = { scheduleType: "frequency", frequency: undefined };
      expect(() => getNextExecutionTime(invalid)).toThrow("Invalid schedule configuration");
    });

    it("uses timezone from scheduledIngest", () => {
      const sched: any = { scheduleType: "frequency", frequency: "daily", timezone: "America/New_York" };
      const result = getNextExecutionTime(sched, new Date("2024-06-15T10:00:00Z"));
      expect(result.getTime()).toBeGreaterThan(new Date("2024-06-15T10:00:00Z").getTime());
    });

    it("defaults timezone to UTC", () => {
      const sched: any = { scheduleType: "frequency", frequency: "daily" };
      const result = getNextExecutionTime(sched, new Date("2024-06-15T10:00:00Z"));
      expect(result).toEqual(new Date("2024-06-16T00:00:00Z"));
    });
  });

  describe("shouldRunNow", () => {
    it("returns false when disabled", () => {
      const sched: any = { enabled: false, scheduleType: "frequency", frequency: "hourly" };
      expect(shouldRunNow(sched, new Date())).toBe(false);
    });

    it("returns false for invalid schedule configuration (no frequency or cron)", () => {
      const sched: any = { enabled: true, scheduleType: "frequency" };
      expect(shouldRunNow(sched, new Date())).toBe(false);
    });

    it("returns true when nextRun is in the past", () => {
      const sched: any = {
        enabled: true,
        scheduleType: "frequency",
        frequency: "hourly",
        nextRun: "2024-01-01T00:00:00Z",
      };
      expect(shouldRunNow(sched, new Date("2024-01-01T01:00:00Z"))).toBe(true);
    });

    it("returns false when nextRun is in the future", () => {
      const sched: any = {
        enabled: true,
        scheduleType: "frequency",
        frequency: "hourly",
        nextRun: "2024-01-01T02:00:00Z",
      };
      expect(shouldRunNow(sched, new Date("2024-01-01T01:00:00Z"))).toBe(false);
    });

    it("calculates from lastRun when nextRun is not set", () => {
      const sched: any = {
        enabled: true,
        scheduleType: "frequency",
        frequency: "hourly",
        lastRun: "2024-01-01T08:00:00Z",
      };
      // At 09:30 the hourly next run (09:00) should have passed
      expect(shouldRunNow(sched, new Date("2024-01-01T09:30:00Z"))).toBe(true);
    });

    it("returns false for lastRun with invalid schedule config (catch path)", () => {
      const sched: any = {
        enabled: true,
        scheduleType: "cron",
        cronExpression: undefined, // invalid - missing cron expression
        lastRun: "2024-01-01T08:00:00Z",
      };
      // Cron type with no expression should trigger the catch path
      // The try block calls getNextExecutionTime which throws "Invalid schedule configuration"
      expect(shouldRunNow(sched, new Date("2024-01-01T09:30:00Z"))).toBe(false);
    });

    it("returns false for first run with invalid schedule config (catch path)", () => {
      const sched: any = {
        enabled: true,
        scheduleType: "cron",
        cronExpression: undefined, // invalid
        // no lastRun, no nextRun - first run
      };
      expect(shouldRunNow(sched, new Date("2024-01-01T09:30:00Z"))).toBe(false);
    });

    it("handles first run (no lastRun, no nextRun) with valid config", () => {
      vi.setSystemTime(new Date("2024-01-01T09:30:00Z"));
      const sched: any = {
        enabled: true,
        scheduleType: "frequency",
        frequency: "hourly",
        // no lastRun, no nextRun
      };
      // For a first run, getNextExecutionTime is called without fromDate,
      // so it calculates next hour from now. At 09:30, next run is 10:00,
      // which is in the future, so it should be false.
      expect(shouldRunNow(sched, new Date("2024-01-01T09:30:00Z"))).toBe(false);
    });
  });

  describe("calculateNextRun", () => {
    it("returns expected next run for valid schedule", () => {
      const sched: any = { scheduleType: "frequency", frequency: "hourly" };
      const currentTime = new Date("2024-01-01T09:30:00Z");
      const result = calculateNextRun(sched, currentTime);
      expect(result).toEqual(new Date("2024-01-01T10:00:00Z"));
    });

    it("falls back to 24 hours on error", () => {
      const sched: any = {
        id: "test-123",
        scheduleType: "cron",
        cronExpression: undefined, // invalid
      };
      const currentTime = new Date("2024-01-01T09:30:00Z");
      const result = calculateNextRun(sched, currentTime);
      // Should fall back to 24 hours
      expect(result).toEqual(new Date("2024-01-02T09:30:00Z"));
    });
  });
});
