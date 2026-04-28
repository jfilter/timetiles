/**
 * Rate-limit counter cleanup job.
 *
 * Removes expired rows from the PostgreSQL rate-limit store so the shared
 * counter table stays bounded over time.
 *
 * @module
 * @category Jobs
 */

import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { createRateLimitStore } from "@/lib/services/rate-limit/factory";

/**
 * Cleanup expired PostgreSQL rate-limit counters.
 */
export const rateLimitCleanupJob = {
  slug: "rate-limit-cleanup",
  schedule: [
    {
      cron: "0 * * * *", // Every hour
      queue: "maintenance" as const,
    },
  ],
  retries: 2,
  waitUntil: 120000, // 2 minutes timeout
  handler: async ({ req }: JobHandlerContext) => {
    const { backend, store } = createRateLimitStore(req.payload);

    if (backend !== "pg" || !store.cleanup) {
      logger.debug({ backend }, "Skipping rate-limit cleanup job for non-PostgreSQL backend");
      return { output: { success: true, skipped: true, backend } };
    }

    try {
      const cleaned = await store.cleanup();

      logger.info({ backend, cleaned }, "Rate-limit cleanup completed");

      return { output: { success: true, backend, cleaned } };
    } catch (error) {
      logError(error, "Rate-limit cleanup job failed", { backend });
      throw error;
    }
  },
};
