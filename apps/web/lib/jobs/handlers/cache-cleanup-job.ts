/**
 * Cache Cleanup Job Handler.
 *
 * This job periodically cleans up expired cache entries to prevent unbounded growth
 * of the cache storage. It removes entries that have expired based on their TTL
 * and performs eviction when the cache size exceeds configured limits.
 *
 * @module
 * @category Jobs
 */

import { logError, logger } from "@/lib/logger";
import { getUrlFetchCache } from "@/lib/services/cache";

/**
 * Cache cleanup job handler
 */
export const cacheCleanupJob = {
  slug: "cache-cleanup",
  /**
   * Run every 6 hours to clean up expired cache entries
   * Cron format: minute hour day month weekday
   */
  schedule: [
    {
      cron: "0 */6 * * *", // Every 6 hours at minute 0
      queue: "maintenance",
    },
  ],
  retries: 2,
  handler: async () => {
    const startTime = Date.now();
    logger.info("Starting cache cleanup job");

    try {
      // Clean URL fetch cache (the only concrete cache instance)
      const urlFetchCache = getUrlFetchCache();
      const totalCleaned = await urlFetchCache.cleanup();
      const stats = await urlFetchCache.getStats();

      const duration = Date.now() - startTime;

      logger.info("Cache cleanup completed", {
        totalCleaned,
        duration,
        urlFetchCache: { cleaned: totalCleaned, stats },
      });

      return {
        output: {
          success: true,
          totalCleaned,
          totalEvicted: 0,
          duration,
          results: { urlFetchCache: { cleaned: totalCleaned, stats } },
        },
      };
    } catch (error) {
      logError(error, "Cache cleanup job failed");
      throw error;
    }
  },
};
