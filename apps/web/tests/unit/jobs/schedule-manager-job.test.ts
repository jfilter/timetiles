/**
 * Unit tests for Schedule Manager Job Handler
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scheduleManagerJob } from "@/lib/jobs/handlers/schedule-manager-job";

// Mock dependencies
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logError: vi.fn(),
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

  describe("handler", () => {
    const createMockContext = () => {
      const mockPayload = {
        find: vi.fn(),
        findByID: vi.fn(),
        update: vi.fn(),
        jobs: {
          queue: vi.fn().mockResolvedValue({ id: "url-fetch-job-123" }),
        },
      };

      const mockJob = {
        id: "schedule-job-123",
      };

      const mockReq = {
        payload: mockPayload,
      };

      return { mockPayload, mockJob, mockReq };
    };

    it("should find and process enabled scheduled imports", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const mockScheduledImports: any[] = [
        {
          id: "import-1",
          name: "Daily Import",
          enabled: true,
          sourceUrl: "https://example.com/data.csv",
          scheduleType: "frequency",
          frequency: "daily",
          catalog: "catalog-123",
          createdBy: "user-123",
          importNameTemplate: "{{name}} - {{date}}",
          lastRun: new Date("2024-01-14 00:00:00").toISOString(), // Yesterday
        },
      ];

      mockPayload.find.mockResolvedValue({
        docs: mockScheduledImports,
        totalDocs: 1,
      });

      // Set time to after midnight to make the import due
      vi.setSystemTime(new Date("2024-01-15 00:30:00"));

      const result = await scheduleManagerJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.find).toHaveBeenCalledWith({
        collection: "scheduled-imports",
        where: {
          enabled: {
            equals: true,
          },
        },
        limit: 1000,
      });

      expect(result.output).toEqual({
        success: true,
        totalScheduled: 1,
        triggered: 1,
        errors: 0,
      });
    });

    it("should trigger imports that are due based on frequency", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15 10:30:00");
      vi.setSystemTime(currentTime);

      const mockScheduledImports: any[] = [
        {
          id: "hourly-import",
          name: "Hourly Import",
          enabled: true,
          sourceUrl: "https://api1.example.com/data",
          scheduleType: "frequency",
          frequency: "hourly",
          lastRun: new Date("2024-01-15 09:00:00").toISOString(),
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
          lastRun: new Date("2024-01-15 00:00:00").toISOString(),
          catalog: "catalog-2",
          createdBy: "user-2",
        },
      ];

      mockPayload.find.mockResolvedValue({
        docs: mockScheduledImports,
        totalDocs: 2,
      });

      const result = await scheduleManagerJob.handler({
        job: mockJob,
        req: mockReq,
      });

      // Should only queue the hourly import
      expect(mockPayload.jobs.queue).toHaveBeenCalledTimes(1);
      expect(mockPayload.jobs.queue).toHaveBeenCalledWith({
        task: "url-fetch",
        input: {
          scheduledImportId: "hourly-import",
          sourceUrl: "https://api1.example.com/data",
          authConfig: undefined,
          catalogId: "catalog-1",
          originalName: expect.stringContaining("Hourly Import"),
          userId: "user-1",
        },
      });

      expect(result.output.triggered).toBe(1);
    });

    it("should handle cron expressions", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15 14:35:00");
      vi.setSystemTime(currentTime);

      const mockScheduledImports: any[] = [
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

      mockPayload.find.mockResolvedValue({
        docs: mockScheduledImports,
        totalDocs: 1,
      });

      const result = await scheduleManagerJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.jobs.queue).toHaveBeenCalledTimes(1);
      expect(result.output.triggered).toBe(1);
    });

    it("should skip disabled schedules", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const mockScheduledImports: any[] = [
        {
          id: "disabled-import",
          name: "Disabled Import",
          enabled: false, // Disabled
          sourceUrl: "https://api.example.com/data",
          scheduleType: "frequency",
          frequency: "hourly",
        },
      ];

      mockPayload.find.mockResolvedValue({
        docs: mockScheduledImports,
        totalDocs: 1,
      });

      const result = await scheduleManagerJob.handler({
        job: mockJob,
        req: mockReq,
      });

      // Should find it but not trigger
      expect(mockPayload.find).toHaveBeenCalled();
      expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
      expect(result.output.triggered).toBe(0);
    });

    it("should update scheduled import metadata after triggering", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15 10:00:00");
      vi.setSystemTime(currentTime);

      const mockScheduledImport: any = {
        id: "import-1",
        name: "Test Import",
        enabled: true,
        sourceUrl: "https://example.com/data",
        scheduleType: "frequency",
        frequency: "hourly",
        lastRun: new Date("2024-01-15 08:00:00").toISOString(),
        catalog: "catalog-123",
        createdBy: "user-123",
        statistics: {
          totalRuns: 5,
          successfulRuns: 4,
          failedRuns: 1,
          averageDuration: 2.5,
        },
        executionHistory: [],
      };

      mockPayload.find.mockResolvedValue({
        docs: [mockScheduledImport],
        totalDocs: 1,
      });

      await scheduleManagerJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "scheduled-imports",
        id: "import-1",
        data: expect.objectContaining({
          lastRun: currentTime,
          nextRun: new Date("2024-01-15 11:00:00"), // Next hour
          lastStatus: "running",
          currentRetries: 0,
          statistics: {
            totalRuns: 6,
            successfulRuns: 5,
            failedRuns: 1,
            averageDuration: 2.5,
          },
          executionHistory: expect.arrayContaining([
            expect.objectContaining({
              executedAt: currentTime,
              status: "success",
              jobId: "url-fetch-job-123",
            }),
          ]),
        }),
      });
    });

    it("should handle errors gracefully", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      // Set current time to make the import due to run
      const currentTime = new Date("2024-01-15 10:00:00");
      vi.setSystemTime(currentTime);

      const mockScheduledImport: any = {
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

      mockPayload.find.mockResolvedValue({
        docs: [mockScheduledImport],
        totalDocs: 1,
      });

      // Make job queue throw an error
      mockPayload.jobs.queue.mockRejectedValue(new Error("Queue error"));

      const result = await scheduleManagerJob.handler({
        job: mockJob,
        req: mockReq,
      });

      // Should handle error and continue
      expect(result.output).toEqual({
        success: true,
        totalScheduled: 1,
        triggered: 0,
        errors: 1,
      });

      // Should update the import with error status
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "scheduled-imports",
        id: "error-import",
        data: expect.objectContaining({
          lastStatus: "failed",
          lastError: "Queue error",
          currentRetries: 1,
        }),
      });
    });

    it("should calculate correct next run times for different frequencies", async () => {
      const testCases = [
        {
          frequency: "hourly",
          currentTime: new Date("2024-01-15 10:30:00"),
          lastRun: new Date("2024-01-15 09:00:00"), // 1.5 hours ago
          expectedNext: new Date("2024-01-15 11:00:00"),
        },
        {
          frequency: "daily",
          currentTime: new Date("2024-01-15 00:30:00"), // Just after midnight
          lastRun: new Date("2024-01-14 00:00:00"), // Yesterday at midnight
          expectedNext: new Date("2024-01-16 00:00:00"), // Tomorrow at midnight
        },
        {
          frequency: "weekly",
          currentTime: new Date("2024-01-15 10:30:00"), // Monday
          lastRun: new Date("2024-01-08 00:00:00"), // Last Monday
          expectedNext: new Date("2024-01-21 00:00:00"), // Next Sunday
        },
        {
          frequency: "monthly",
          currentTime: new Date("2024-01-15 10:30:00"),
          lastRun: new Date("2023-12-01 00:00:00"), // Last month
          expectedNext: new Date("2024-02-01 00:00:00"),
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

        mockPayload.find.mockResolvedValue({
          docs: [mockImport],
          totalDocs: 1,
        });

        await scheduleManagerJob.handler({
          job: mockJob,
          req: mockReq,
        });

        expect(mockPayload.update).toHaveBeenCalledWith({
          collection: "scheduled-imports",
          id: `${testCase.frequency}-import`,
          data: expect.objectContaining({
            nextRun: testCase.expectedNext,
          }),
        });
      }
    });

    it("should handle import name template replacements", async () => {
      const { mockPayload, mockJob, mockReq } = createMockContext();

      const currentTime = new Date("2024-01-15 14:30:45");
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
        importNameTemplate: "{{name}} - {{date}} at {{time}} from {{url}}",
        lastRun: new Date("2024-01-14 00:00:00").toISOString(), // Yesterday
      };

      mockPayload.find.mockResolvedValue({
        docs: [mockImport],
        totalDocs: 1,
      });

      await scheduleManagerJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.jobs.queue).toHaveBeenCalledWith({
        task: "url-fetch",
        input: expect.objectContaining({
          originalName: "Template Test - 2024-01-15 at 14:30:45 from api.example.com",
        }),
      });
    });

    it("should maintain execution history limit", async () => {
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

      mockPayload.find.mockResolvedValue({
        docs: [mockImport],
        totalDocs: 1,
      });

      await scheduleManagerJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "scheduled-imports",
        id: "history-import",
        data: expect.objectContaining({
          executionHistory: expect.arrayContaining([
            expect.objectContaining({
              status: "success",
            }),
          ]),
        }),
      });

      // Check that history is limited to 10 items
      const updateCall = mockPayload.update.mock.calls[0];
      if (updateCall?.[0]) {
        expect(updateCall[0].data.executionHistory).toHaveLength(10);
      }
    });
  });
});
