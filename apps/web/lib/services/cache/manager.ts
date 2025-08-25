/**
 * Cache manager for creating and managing cache instances.
 *
 * This manager provides a factory pattern for creating cache instances with different
 * storage backends and configurations. It manages singleton instances and provides
 * global cache operations.
 *
 * @module
 * @category Services/Cache
 */

import { logger } from "@/lib/logger";

import { Cache } from "./cache";
import { FileSystemCacheStorage } from "./storage/file-system";
import { MemoryCacheStorage } from "./storage/memory";
import type { CacheConfig, CacheStorage } from "./types";

export enum CacheBackend {
  MEMORY = "memory",
  FILESYSTEM = "filesystem",
}

/**
 * Cache manager for creating and managing cache instances
 */
export class CacheManager {
  private static instances = new Map<string, Cache>();

  /**
   * Create or get a cache instance
   */
  static getCache(name: string = "default", backend?: CacheBackend, config?: Partial<CacheConfig>): Cache {
    const key = `${name}:${backend || "default"}`;

    if (!this.instances.has(key)) {
      const cache = this.createCache(name, backend, config);
      this.instances.set(key, cache);
      logger.info("Cache instance created", { name, backend: backend || this.getBackendFromEnv() });
    }

    return this.instances.get(key)!;
  }

  /**
   * Create a new cache instance
   */
  private static createCache(name: string, backend?: CacheBackend, config?: Partial<CacheConfig>): Cache {
    const selectedBackend = backend || this.getBackendFromEnv();
    const storage = this.createStorage(selectedBackend, name);

    return new Cache({
      storage,
      keyPrefix: `${name}:`,
      defaultTTL: this.getDefaultTTL(),
      ...config,
    });
  }

  /**
   * Create storage backend
   */
  private static createStorage(backend: CacheBackend, name: string): CacheStorage {
    switch (backend) {
      case CacheBackend.MEMORY:
        return new MemoryCacheStorage({
          maxEntries: this.getMaxEntries(),
          maxSize: this.getMaxSize(),
          defaultTTL: this.getDefaultTTL(),
        });

      case CacheBackend.FILESYSTEM:
      default:
        return new FileSystemCacheStorage({
          cacheDir: this.getCacheDir(name),
          maxSize: this.getMaxSize(),
          cleanupIntervalMs: this.getCleanupInterval(),
          defaultTTL: this.getDefaultTTL(),
        });
    }
  }

  /**
   * Get backend from environment
   */
  private static getBackendFromEnv(): CacheBackend {
    const backend = process.env.CACHE_BACKEND?.toLowerCase();

    switch (backend) {
      case "memory":
        return CacheBackend.MEMORY;
      case "filesystem":
      case "fs":
      default:
        return CacheBackend.FILESYSTEM;
    }
  }

  /**
   * Get configuration from environment
   */
  private static getDefaultTTL(): number {
    return parseInt(process.env.CACHE_DEFAULT_TTL || "3600", 10);
  }

  private static getMaxEntries(): number {
    return parseInt(process.env.CACHE_MAX_ENTRIES || "1000", 10);
  }

  private static getMaxSize(): number {
    const sizeMB = parseInt(process.env.CACHE_MAX_SIZE_MB || "500", 10);
    return sizeMB * 1024 * 1024;
  }

  private static getCacheDir(name: string): string {
    const baseDir = process.env.CACHE_DIR || ".cache";
    return `${baseDir}/${name}`;
  }

  private static getCleanupInterval(): number {
    return parseInt(process.env.CACHE_CLEANUP_INTERVAL_MS || "3600000", 10); // 1 hour default
  }

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
  static async getAllStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};

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