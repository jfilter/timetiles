/**
 * Unit tests for the cleanup approval locks job handler.
 *
 * Tests the maintenance job that cleans up stale approval locks
 * from import processing workflows.
 *
 * Uses real StageTransitionService since it's a simple in-memory Set.
 * No mocking needed for such simple logic.
 *
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupApprovalLocksJob } from "@/lib/jobs/handlers/cleanup-approval-locks-job";
import { StageTransitionService } from "@/lib/services/stage-transition";

describe.sequential("CleanupApprovalLocksJob Handler", () => {
  beforeEach(() => {
    // Clear any existing locks before each test
    StageTransitionService.clearTransitionLocks();
  });

  afterEach(() => {
    // Clean up after each test
    StageTransitionService.clearTransitionLocks();
  });

  describe("Success Cases", () => {
    it("should clean up locks and return correct output when locks exist", () => {
      // Add some locks to the service
      // We can't directly add to the private Set, but we can simulate by calling the internal method
      // Since transitioningJobs is private, we'll test the public API instead

      // Force add transition locks by using reflection to access private field
      const transitioningJobs = (StageTransitionService as any).transitioningJobs as Set<string>;
      transitioningJobs.add("job-1-upload-analyze");
      transitioningJobs.add("job-2-analyze-detect");
      transitioningJobs.add("job-3-detect-validate");
      transitioningJobs.add("job-4-validate-await");
      transitioningJobs.add("job-5-await-geocode");

      // Verify locks were added
      expect(transitioningJobs.size).toBe(5);

      // Execute job
      const result = cleanupApprovalLocksJob.handler();

      // Verify result shows correct number of cleaned locks
      expect(result).toEqual({
        output: {
          transitionLocksCleaned: 5,
          totalCleaned: 5,
        },
      });

      // Verify locks were actually cleared
      expect(transitioningJobs.size).toBe(0);
    });

    it("should handle zero locks cleaned when no locks exist", () => {
      // Ensure no locks exist
      const transitioningJobs = (StageTransitionService as any).transitioningJobs as Set<string>;
      expect(transitioningJobs.size).toBe(0);

      // Execute job
      const result = cleanupApprovalLocksJob.handler();

      // Verify result shows zero cleaned
      expect(result).toEqual({
        output: {
          transitionLocksCleaned: 0,
          totalCleaned: 0,
        },
      });
    });

    it("should clean up different amounts of locks correctly", () => {
      const transitioningJobs = (StageTransitionService as any).transitioningJobs as Set<string>;

      // Add just one lock
      transitioningJobs.add("job-single-lock");

      const result = cleanupApprovalLocksJob.handler();

      expect(result.output.totalCleaned).toBe(1);
      expect(transitioningJobs.size).toBe(0);
    });
  });
});
