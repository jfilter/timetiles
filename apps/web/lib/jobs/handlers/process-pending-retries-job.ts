/**
 * Scheduled job for processing pending retry attempts on failed imports.
 *
 * This job runs periodically to check for failed import jobs that are scheduled
 * for automatic retry and processes them using the ErrorRecoveryService. It handles
 * retry scheduling based on error classification and exponential backoff.
 *
 * @module
 */

import { ErrorRecoveryService } from "@/lib/services/error-recovery";

import type { JobHandlerContext } from "../utils/job-context";

export const processPendingRetriesJob = {
  slug: "process-pending-retries",
  schedule: [
    {
      cron: "*/5 * * * *", // Every 5 minutes
      queue: "maintenance",
    },
  ],
  handler: async ({ req }: JobHandlerContext<object>) => {
    if (!req) {
      throw new Error("Request context is required");
    }

    await ErrorRecoveryService.processPendingRetries(req.payload);

    return {
      output: {
        success: true,
      },
    };
  },
};
