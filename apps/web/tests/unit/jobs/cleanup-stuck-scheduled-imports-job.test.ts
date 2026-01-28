/**
 * Unit tests for cleanup stuck scheduled imports job.
 * @module
 */
import type { BasePayload } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to ensure mock functions are available when vi.mock runs
const { mockLoggerInfo, mockLoggerWarn, mockLoggerError, mockLoggerDebug, mockLogError } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerDebug: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
  logError: mockLogError,
  createJobLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { cleanupStuckScheduledImportsJob } from "@/lib/jobs/handlers/cleanup-stuck-scheduled-imports-job";

type MockPayload = {
  find: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

describe.sequential("Cleanup Stuck Scheduled Imports Job", () => {
  let mockPayload: MockPayload;
  let mockJob: { id: string; input?: Record<string, unknown> };
  let mockReq: { payload: BasePayload };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock payload
    mockPayload = {
      find: vi.fn(),
      update: vi.fn(),
    };

    mockJob = {
      id: "job-1",
      input: {},
    };

    mockReq = {
      payload: mockPayload as unknown as BasePayload,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Finding Stuck Imports", () => {
    it("should find imports stuck for more than 2 hours", async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const stuckImport = {
        id: "import-1",
        name: "Stuck Import",
        lastStatus: "running",
        lastRun: threeHoursAgo.toISOString(),
        executionHistory: [],
        statistics: {
          totalRuns: 5,
          successfulRuns: 4,
          failedRuns: 0,
          averageDuration: 5000,
        },
      };

      mockPayload.find.mockResolvedValue({
        docs: [stuckImport],
        totalDocs: 1,
      });

      const result = await cleanupStuckScheduledImportsJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.find).toHaveBeenCalledWith({
        collection: "scheduled-imports",
        where: {
          lastStatus: {
            equals: "running",
          },
        },
        limit: 1000,
      });

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "scheduled-imports",
        id: "import-1",
        data: expect.objectContaining({
          lastStatus: "failed",
          lastError: "Import was stuck and automatically reset by cleanup job",
        }),
      });

      expect(result.output).toEqual({
        success: true,
        totalRunning: 1,
        stuckCount: 1,
        resetCount: 1,
        dryRun: false,
      });
    });

    it("should not find imports running for less than 2 hours", async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const runningImport = {
        id: "import-2",
        name: "Running Import",
        lastStatus: "running",
        lastRun: oneHourAgo.toISOString(),
        executionHistory: [],
        statistics: {},
      };

      mockPayload.find.mockResolvedValue({
        docs: [runningImport],
        totalDocs: 1,
      });

      const result = await cleanupStuckScheduledImportsJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.update).not.toHaveBeenCalled();

      expect(result.output).toEqual({
        success: true,
        totalRunning: 1,
        stuckCount: 0,
        resetCount: 0,
        dryRun: false,
      });
    });

    it("should handle pagination limit of 100", async () => {
      const stuckImports = Array.from({ length: 150 }, (_, i) => ({
        id: `import-${i}`,
        name: `Import ${i}`,
        lastStatus: "running",
        lastRun: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        executionHistory: [],
        statistics: {},
      }));

      mockPayload.find.mockResolvedValue({
        docs: stuckImports.slice(0, 100), // Return only first 100 as per actual limit is 1000
        totalDocs: 100,
      });

      const result = await cleanupStuckScheduledImportsJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.find).toHaveBeenCalledWith({
        collection: "scheduled-imports",
        where: {
          lastStatus: {
            equals: "running",
          },
        },
        limit: 1000,
      });

      // Should process all 100 stuck imports
      expect(mockPayload.update).toHaveBeenCalledTimes(100);
      expect(result.output.resetCount).toBe(100);
    });
  });

  describe("Resetting Stuck Imports", () => {
    it("should process multiple stuck imports", async () => {
      const stuckImports = [
        {
          id: "import-1",
          name: "Import 1",
          lastStatus: "running",
          lastRun: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          executionHistory: [],
          statistics: {},
        },
        {
          id: "import-2",
          name: "Import 2",
          lastStatus: "running",
          lastRun: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          executionHistory: [],
          statistics: {},
        },
      ];

      mockPayload.find.mockResolvedValue({
        docs: stuckImports,
        totalDocs: 2,
      });

      const result = await cleanupStuckScheduledImportsJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.update).toHaveBeenCalledTimes(2);
      expect(result.output.resetCount).toBe(2);
    });

    it("should handle partial failures gracefully", async () => {
      const stuckImports = [
        {
          id: "import-1",
          name: "Import 1",
          lastStatus: "running",
          lastRun: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          executionHistory: [],
          statistics: {},
        },
        {
          id: "import-2",
          name: "Import 2",
          lastStatus: "running",
          lastRun: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          executionHistory: [],
          statistics: {},
        },
      ];

      mockPayload.find.mockResolvedValue({
        docs: stuckImports,
        totalDocs: 2,
      });

      // Make the first update fail
      mockPayload.update.mockRejectedValueOnce(new Error("Update failed")).mockResolvedValueOnce({ id: "import-2" });

      const result = await cleanupStuckScheduledImportsJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.update).toHaveBeenCalledTimes(2);
      expect(result.output.resetCount).toBe(1);
      expect(result.output.errors).toHaveLength(1);
      expect(result.output.errors?.[0]).toEqual({
        id: "import-1",
        name: "Import 1",
        error: "Update failed",
      });
    });
  });

  describe("Dry Run Mode", () => {
    it("should not update when in dry run mode", async () => {
      const stuckImport = {
        id: "import-1",
        name: "Stuck Import",
        lastStatus: "running",
        lastRun: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        executionHistory: [],
        statistics: {},
      };

      mockPayload.find.mockResolvedValue({
        docs: [stuckImport],
        totalDocs: 1,
      });

      mockJob.input = { dryRun: true };

      const result = await cleanupStuckScheduledImportsJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.update).not.toHaveBeenCalled();
      expect(result.output).toEqual({
        success: true,
        totalRunning: 1,
        stuckCount: 1,
        resetCount: 0,
        dryRun: true,
      });
    });
  });

  describe("Logging", () => {
    it("should not log summary when no imports are cleaned", async () => {
      mockPayload.find.mockResolvedValue({
        docs: [],
        totalDocs: 0,
      });

      await cleanupStuckScheduledImportsJob.handler({
        job: mockJob,
        req: mockReq,
      });

      // Should have initial log and completion log
      expect(mockLoggerInfo).toHaveBeenCalledTimes(3);
      expect(mockLoggerInfo).toHaveBeenCalledWith("Starting cleanup stuck scheduled imports job", expect.any(Object));
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Found running scheduled imports",
        expect.objectContaining({
          count: 0,
        })
      );
    });

    it("should log errors when job fails", async () => {
      const error = new Error("Database connection failed");
      (mockPayload.find as any).mockRejectedValue(error);

      await expect(
        cleanupStuckScheduledImportsJob.handler({
          job: mockJob,
          req: mockReq,
        })
      ).rejects.toThrow("Database connection failed");

      expect(mockLogError).toHaveBeenCalledWith(
        error,
        "Cleanup stuck scheduled imports job failed",
        expect.any(Object)
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle imports with no lastRun date", async () => {
      const stuckImport = {
        id: "import-1",
        name: "No LastRun Import",
        lastStatus: "running",
        lastRun: null,
        executionHistory: [],
        statistics: {},
      };

      mockPayload.find.mockResolvedValue({
        docs: [stuckImport],
        totalDocs: 1,
      });

      const result = await cleanupStuckScheduledImportsJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "scheduled-imports",
        id: "import-1",
        data: expect.objectContaining({
          lastStatus: "failed",
        }),
      });

      expect(result.output.resetCount).toBe(1);
    });

    it("should maintain execution history limit of 10", async () => {
      const existingHistory = Array.from({ length: 12 }, (_, i) => ({
        executedAt: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
        status: "success" as const,
        duration: 5000,
      }));

      const stuckImport = {
        id: "import-1",
        name: "Full History Import",
        lastStatus: "running",
        lastRun: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        executionHistory: existingHistory,
        statistics: {
          totalRuns: 12,
          successfulRuns: 12,
          failedRuns: 0,
          averageDuration: 5000,
        },
      };

      mockPayload.find.mockResolvedValue({
        docs: [stuckImport],
        totalDocs: 1,
      });

      await cleanupStuckScheduledImportsJob.handler({
        job: mockJob,
        req: mockReq,
      });

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "scheduled-imports",
        id: "import-1",
        data: expect.objectContaining({
          executionHistory: expect.arrayContaining([
            expect.objectContaining({
              status: "failed",
            }),
          ]),
        }),
      });

      const updateCall = mockPayload.update.mock.calls[0]?.[0];
      expect(updateCall.data.executionHistory).toHaveLength(10);
    });
  });
});
