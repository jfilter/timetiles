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
import { createGeocodingService } from "@/lib/services/geocoding/geocoding-service";

import type { JobHandlerContext } from "../utils/job-context";

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
      // The cache is process-local; a separate maintenance worker cannot clean it.
      queue: "ingest",
    },
  ],
  retries: 2,
  handler: async ({ req }: JobHandlerContext) => {
    const startTime = Date.now();
    logger.info("Starting cache cleanup job");

    try {
      const urlFetchCache = getUrlFetchCache();
      const urlCleaned = await urlFetchCache.cleanup();
      const stats = await urlFetchCache.getStats();
      const locationsCleaned = await createGeocodingService(req.payload).cleanupCache();
      const totalCleaned = urlCleaned + locationsCleaned;
      const results = { urlFetchCache: { cleaned: urlCleaned, stats }, locationCache: { cleaned: locationsCleaned } };

      const duration = Date.now() - startTime;

      logger.info("Cache cleanup completed", { totalCleaned, duration, ...results });

      return { output: { success: true, totalCleaned, totalEvicted: 0, duration, results } };
    } catch (error) {
      logError(error, "Cache cleanup job failed");
      throw error;
    }
  },
};
