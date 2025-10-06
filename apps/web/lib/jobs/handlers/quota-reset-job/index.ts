/**
 * Job handler for resetting daily quota counters.
 *
 * This job runs daily at midnight UTC to reset user usage counters
 * for quotas that operate on a daily basis (file uploads, URL fetches, etc).
 *
 * @module
 */

import { createLogger } from "@/lib/logger";
import { getQuotaService } from "@/lib/services/quota-service";

import type { JobHandlerContext } from "../../utils/job-context";

const logger = createLogger("quota-reset-job");

/**
 * Job configuration for the quota reset task.
 */
export const quotaResetJobConfig = {
  slug: "quota-reset" as const,
  handler: async (context: JobHandlerContext) => {
    const payload = context.req?.payload ?? context.payload;
    if (!payload) {
      throw new Error("Payload instance not found in job context");
    }

    try {
      logger.info("Starting daily quota reset job");

      const quotaService = getQuotaService(payload);

      // Reset all daily counters
      await quotaService.resetAllDailyCounters();

      logger.info("Daily quota reset completed successfully");

      return {
        output: {
          success: true,
          message: "Daily quota reset completed successfully",
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error("Failed to reset daily quotas", { error });
      throw error; // Re-throw to trigger retry
    }
  },
  /**
   * Run daily at midnight UTC
   * Cron format: minute hour day month weekday
   */
  schedule: [
    {
      cron: "0 0 * * *", // Every day at midnight
      queue: "maintenance",
    },
  ],
  retries: 3,
  waitUntil: 120000, // 2 minutes timeout
};
