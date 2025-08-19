/**
 * Unit tests for the cleanup approval locks job handler.
 *
 * Tests the maintenance job that cleans up stale approval locks
 * from import processing workflows.
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupApprovalLocksJob } from "@/lib/jobs/handlers/cleanup-approval-locks-job";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
  return {
    cleanupTask: vi.fn(),
  };
});

// Mock external dependencies
vi.mock("@/lib/services/stage-transition", () => ({
  StageTransitionService: {
    cleanupTask: mocks.cleanupTask,
  },
}));

describe.sequential("CleanupApprovalLocksJob Handler", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
  });

  describe("Success Cases", () => {
    it("should clean up locks and return correct output", () => {
      // Mock successful cleanup
      const mockCleanupResult = {
        output: {
          cleaned: 5,
        },
      };

      mocks.cleanupTask.mockReturnValue(mockCleanupResult);

      // Execute job
      const result = cleanupApprovalLocksJob.handler();

      // Verify result
      expect(result).toEqual({
        output: {
          transitionLocksCleaned: 5,
          totalCleaned: 5,
        },
      });

      // Verify service call
      expect(mocks.cleanupTask).toHaveBeenCalledTimes(1);
    });

    it("should handle zero locks cleaned", () => {
      // Mock cleanup with no locks to clean
      const mockCleanupResult = {
        output: {
          cleaned: 0,
        },
      };

      mocks.cleanupTask.mockReturnValue(mockCleanupResult);

      // Execute job
      const result = cleanupApprovalLocksJob.handler();

      // Verify result
      expect(result).toEqual({
        output: {
          transitionLocksCleaned: 0,
          totalCleaned: 0,
        },
      });

      // Verify service call
      expect(mocks.cleanupTask).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Handling", () => {
    it("should propagate errors from StageTransitionService", () => {
      const mockError = new Error("Service cleanup failed");
      mocks.cleanupTask.mockImplementation(() => {
        throw mockError;
      });

      // Execute job and expect error
      expect(() => cleanupApprovalLocksJob.handler()).toThrow("Service cleanup failed");

      // Verify service call was made
      expect(mocks.cleanupTask).toHaveBeenCalledTimes(1);
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
