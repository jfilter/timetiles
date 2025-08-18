/**
 * @module Cleanup job for service processing locks.
 *
 * This job runs periodically to clean up any stale processing locks in the
 * StageTransitionService. It prevents memory leaks from locks that might not
 * have been properly cleaned up due to application crashes or errors.
 */

import { StageTransitionService } from "@/lib/services/stage-transition";

export const cleanupApprovalLocksJob = {
  slug: "cleanup-approval-locks",
  schedule: [
    {
      cron: "*/5 * * * *", // Every 5 minutes
      queue: "maintenance",
    },
  ],
  handler: () => {
    const transitionResult = StageTransitionService.cleanupTask();

    return {
      output: {
        transitionLocksCleaned: transitionResult.output.cleaned,
        totalCleaned: transitionResult.output.cleaned,
      },
    };
  },
};
