import { beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupApprovalLocksJob } from "@/lib/jobs/handlers/cleanup-approval-locks-job";

// Mock external dependencies
vi.mock("@/lib/services/stage-transition", () => ({
  StageTransitionService: {
    cleanupTask: vi.fn(),
  },
}));

describe.sequential("CleanupApprovalLocksJob Handler", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
  });

  describe("Success Cases", () => {
    it("should clean up locks and return correct output", async () => {
      const { StageTransitionService } = await import("@/lib/services/stage-transition");

      // Mock successful cleanup
      const mockCleanupResult = {
        output: {
          cleaned: 5,
        },
      };

      (StageTransitionService.cleanupTask as any).mockResolvedValue(mockCleanupResult);

      // Execute job
      const result = await cleanupApprovalLocksJob.handler();

      // Verify result
      expect(result).toEqual({
        output: {
          transitionLocksCleaned: 5,
          totalCleaned: 5,
        },
      });

      // Verify service call
      expect(StageTransitionService.cleanupTask).toHaveBeenCalledTimes(1);
    });

    it("should handle zero locks cleaned", async () => {
      const { StageTransitionService } = await import("@/lib/services/stage-transition");

      // Mock cleanup with no locks to clean
      const mockCleanupResult = {
        output: {
          cleaned: 0,
        },
      };

      (StageTransitionService.cleanupTask as any).mockResolvedValue(mockCleanupResult);

      // Execute job
      const result = await cleanupApprovalLocksJob.handler();

      // Verify result
      expect(result).toEqual({
        output: {
          transitionLocksCleaned: 0,
          totalCleaned: 0,
        },
      });

      // Verify service call
      expect(StageTransitionService.cleanupTask).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Handling", () => {
    it("should propagate errors from StageTransitionService", async () => {
      const { StageTransitionService } = await import("@/lib/services/stage-transition");

      const mockError = new Error("Service cleanup failed");
      (StageTransitionService.cleanupTask as any).mockRejectedValue(mockError);

      // Execute job and expect error
      await expect(cleanupApprovalLocksJob.handler()).rejects.toThrow("Service cleanup failed");

      // Verify service call was made
      expect(StageTransitionService.cleanupTask).toHaveBeenCalledTimes(1);
    });
  });

  describe("Job Configuration", () => {
    it("should have correct job configuration", () => {
      expect(cleanupApprovalLocksJob.slug).toBe("cleanup-approval-locks");
      expect(cleanupApprovalLocksJob.schedule).toEqual([
        {
          cron: "*/5 * * * *", // Every 5 minutes
          queue: "maintenance",
        },
      ]);
    });
  });
});
