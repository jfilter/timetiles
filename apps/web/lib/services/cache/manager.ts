/**
 * Cache manager for tracking and managing cache instances.
 *
 * Provides global operations (cleanup, stats, destroy) across all registered
 * cache instances. Individual caches register themselves via their own
 * constructors; the manager does not create caches.
 *
 * @module
 * @category Services/Cache
 */

import { logger } from "@/lib/logger";

import type { Cache } from "./cache";

/**
 * Cache manager for tracking and managing cache instances.
 */
export class CacheManager {
  private static readonly instances = new Map<string, Cache>();

  /**
   * Clear all cache instances
   */
  static async clearAll(): Promise<void> {
    const promises = Array.from(this.instances.values()).map((cache) => cache.clear());
    await Promise.all(promises);
    logger.info("All cache instances cleared");
  }

  /**
   * Get stats for all caches
   */
  static async getAllStats(): Promise<Record<string, Awaited<ReturnType<Cache["getStats"]>>>> {
    const stats: Record<string, Awaited<ReturnType<Cache["getStats"]>>> = {};

    for (const [name, cache] of this.instances) {
      stats[name] = await cache.getStats();
    }

    return stats;
  }

  /**
   * Cleanup all cache instances
   */
  static async cleanupAll(): Promise<number> {
    let totalCleaned = 0;

    for (const cache of this.instances.values()) {
      totalCleaned += await cache.cleanup();
    }

    if (totalCleaned > 0) {
      logger.info("All cache instances cleaned", { totalCleaned });
    }

    return totalCleaned;
  }

  /**
   * Destroy all cache instances
   */
  static destroyAll(): void {
    for (const cache of this.instances.values()) {
      cache.destroy();
    }
    this.instances.clear();
    logger.info("All cache instances destroyed");
  }

  /**
   * Get a specific cache instance if it exists
   */
  static getInstance(name: string): Cache | undefined {
    for (const [key, cache] of this.instances) {
      if (key.startsWith(`${name}:`)) {
        return cache;
      }
    }
    return undefined;
  }

  /**
   * Check if a cache instance exists
   */
  static hasInstance(name: string): boolean {
    for (const key of this.instances.keys()) {
      if (key.startsWith(`${name}:`)) {
        return true;
      }
    }
    return false;
  }
}
