/**
 * Unit tests for the cleanup approval locks job handler.
 *
 * The in-memory transition lock mechanism was removed from StageTransitionService
 * because the Payload beforeChange hook contract already prevents concurrent hooks
 * for the same document update. The job is retained as a no-op to avoid breaking
 * the Payload job registry.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { cleanupApprovalLocksJob } from "@/lib/jobs/handlers/cleanup-approval-locks-job";

describe.sequential("CleanupApprovalLocksJob Handler", () => {
  it("should return zero cleaned counts", () => {
    const result = cleanupApprovalLocksJob.handler();

    expect(result).toEqual({ output: { transitionLocksCleaned: 0, totalCleaned: 0 } });
  });

  it("should have the correct slug and schedule", () => {
    expect(cleanupApprovalLocksJob.slug).toBe("cleanup-approval-locks");
    expect(cleanupApprovalLocksJob.schedule).toEqual([{ cron: "*/5 * * * *", queue: "maintenance" }]);
  });
});
