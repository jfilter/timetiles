/**
 * Background job handler for resetting daily quota counters.
 *
 * This job runs daily at midnight UTC to reset all daily usage counters
 * for users, ensuring that daily quotas (file uploads, URL fetches, import jobs)
 * are properly reset for the next day.
 *
 * @module
 * @category Jobs
 */

import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";
import { getPermissionService } from "@/lib/services/permission-service";

const logger = createLogger("quota-reset-job");

interface QuotaResetJobInput {
  // No input required, but keeping for future expansion
  forceReset?: boolean;
}

/**
 * Reset daily quota counters for all users.
 */
export const quotaResetJob = async ({ 
  payload, 
  input = {} 
}: { 
  payload: Payload; 
  input?: QuotaResetJobInput 
}): Promise<void> => {
  const startTime = Date.now();
  
  try {
    logger.info("Starting daily quota reset job");

    const permissionService = getPermissionService(payload);
    
    // Reset all user daily counters
    await permissionService.resetAllDailyCounters();

    const duration = Date.now() - startTime;
    logger.info("Daily quota reset job completed", { 
      duration,
      forceReset: input.forceReset 
    });
  } catch (error) {
    logger.error("Failed to reset daily quotas", { 
      error,
      duration: Date.now() - startTime 
    });
    throw error;
  }
};

// Register the job with Payload's job system
export const quotaResetJobConfig = {
  slug: "quota-reset",
  handler: quotaResetJob,
  // Run daily at midnight UTC
  schedule: "0 0 * * *",
  description: "Reset daily quota counters for all users",
};