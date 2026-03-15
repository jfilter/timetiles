/**
 * Cleanup job for service processing locks.
 *
 * Previously cleaned up in-memory transition locks from StageTransitionService.
 * The in-memory lock mechanism was removed because the Payload beforeChange hook
 * contract already prevents concurrent hooks for the same document update.
 *
 * This job is retained as a no-op to avoid breaking the Payload job registry.
 *
 * @module
 */

export const cleanupApprovalLocksJob = {
  slug: "cleanup-approval-locks",
  schedule: [
    {
      cron: "*/5 * * * *", // Every 5 minutes
      queue: "maintenance",
    },
  ],
  handler: () => {
    return { output: { transitionLocksCleaned: 0, totalCleaned: 0 } };
  },
};
