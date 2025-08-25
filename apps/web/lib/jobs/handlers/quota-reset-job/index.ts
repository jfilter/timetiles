/**
 * Job handler for resetting daily quota counters.
 * 
 * This job runs daily at midnight UTC to reset user usage counters
 * for quotas that operate on a daily basis (file uploads, URL fetches, etc).
 * 
 * @module
 */

import { getPermissionService } from "@/lib/services/permission-service";
import { createLogger } from "@/lib/logger";

const logger = createLogger("quota-reset-job");

/**
 * Job configuration for the quota reset task.
 */
export const quotaResetJobConfig = {
  slug: "quota-reset" as const,
  handler: quotaResetJob,
  queue: "default",
  /**
   * Run daily at midnight UTC
   * Format: "seconds minutes hours dayOfMonth month dayOfWeek"
   */
  schedule: "0 0 0 * * *",
  retries: 3,
  waitUntil: 120000, // 2 minutes timeout
};

/**
 * Resets daily quota counters for all users.
 * 
 * This includes:
 * - File uploads per day
 * - URL fetches per day  
 * - Import jobs per day
 * 
 * Does NOT reset:
 * - Total events created (cumulative)
 * - Active schedules (current count)
 */
export async function quotaResetJob({ payload }: any) {
  try {
    logger.info("Starting daily quota reset job");
    
    const permissionService = getPermissionService(payload);
    
    // Reset all daily counters
    await permissionService.resetAllDailyCounters();
    
    logger.info("Daily quota reset completed successfully");
  } catch (error) {
    logger.error("Failed to reset daily quotas", { error });
    throw error; // Re-throw to trigger retry
  }
}