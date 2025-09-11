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

import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logger } from "@/lib/logger";
import { getHttpCache } from "@/lib/services/cache";
import { CacheManager } from "@/lib/services/cache/manager";

export interface CacheCleanupJobInput {
  // Optional: specific cache instances to clean
  cacheNames?: string[];
  // Optional: force cleanup even if recently cleaned
  force?: boolean;
}

/**
 * Cache cleanup job handler
 */
export const cacheCleanupJob = {
  slug: "cache-cleanup",
  handler: async (context: JobHandlerContext) => {
    const input = (context.input ?? context.job?.input) as CacheCleanupJobInput;

    const startTime = Date.now();
    logger.info("Starting cache cleanup job", {
      cacheNames: input.cacheNames,
      force: input.force,
    });

    try {
      let totalCleaned = 0;
      const totalEvicted = 0;
      const results: Record<string, unknown> = {};

      // Clean HTTP cache
      const httpCache = getHttpCache();
      const httpCleaned = await httpCache.clear();
      totalCleaned += httpCleaned;
      results.httpCache = {
        cleaned: httpCleaned,
        stats: await httpCache.getStats(),
      };

      // Clean other cache instances if specified
      if (input.cacheNames && input.cacheNames.length > 0) {
        for (const cacheName of input.cacheNames) {
          const cache = CacheManager.getInstance(cacheName);
          if (cache) {
            const cleaned = await cache.cleanup();
            totalCleaned += cleaned;
            results[cacheName] = {
              cleaned,
              stats: await cache.getStats(),
            };
          } else {
            logger.warn("Cache instance not found", { cacheName });
          }
        }
      } else {
        // Clean all cache instances
        const allStats = await CacheManager.getAllStats();
        for (const [cacheName] of Object.entries(allStats)) {
          const cache = CacheManager.getInstance(cacheName);
          if (cache) {
            const cleaned = await cache.cleanup();
            totalCleaned += cleaned;
            results[cacheName] = {
              cleaned,
              stats: await cache.getStats(),
            };
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info("Cache cleanup completed", {
        totalCleaned,
        totalEvicted,
        duration,
        results,
      });

      return {
        output: {
          success: true,
          totalCleaned,
          totalEvicted,
          duration,
          results,
        },
      };
    } catch (error) {
      const errorObj = error as Error;
      logger.error("Cache cleanup job failed", {
        error: errorObj.message,
        stack: errorObj.stack,
      });

      return {
        output: {
          success: false,
          error: errorObj.message,
        },
      };
    }
  },
};
