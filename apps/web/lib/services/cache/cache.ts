/**
 * Main cache service that provides high-level caching operations.
 *
 * Wraps storage operations with key prefixing, TTL defaults, and best-effort error handling.
 *
 * @module
 * @category Services/Cache
 */

import { logger } from "@/lib/logger";

import type { CacheConfig, CacheSetOptions, CacheStorage } from "./types";

/**
 * Main cache service that provides high-level caching operations
 */
export class Cache {
  private readonly storage: CacheStorage;
  private readonly config: CacheConfig;
  private readonly keyPrefix: string;

  constructor(config: CacheConfig) {
    this.storage = config.storage;
    this.config = config;
    this.keyPrefix = config.keyPrefix ?? "";
  }

  private makeKey(key: string): string {
    return this.keyPrefix + key;
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.makeKey(key);
    try {
      const entry = await this.storage.get<T>(fullKey);
      return entry?.value ?? null;
    } catch {
      logger.error("Cache get error");
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    const fullKey = this.makeKey(key);
    const ttl = options?.ttl ?? this.config.defaultTTL;
    try {
      await this.storage.set(fullKey, value, { ...options, ttl });
    } catch {
      logger.error("Cache set error");
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<boolean> {
    const fullKey = this.makeKey(key);
    try {
      return await this.storage.delete(fullKey);
    } catch {
      logger.error("Cache delete error");
      return false;
    }
  }

  /**
   * Clear cache entries matching pattern
   */
  async clear(pattern?: string): Promise<number> {
    const fullPattern = pattern ? this.makeKey(pattern) : undefined;
    try {
      return await this.storage.clear(fullPattern);
    } catch {
      logger.error("Cache clear error");
      return 0;
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern?: string): Promise<string[]> {
    const fullPattern = pattern ? this.makeKey(pattern) : undefined;
    try {
      const keys = await this.storage.keys(fullPattern);

      // Remove prefix from keys
      const prefixLength = this.keyPrefix.length;
      return keys.map((k) => k.substring(prefixLength));
    } catch {
      logger.error("Cache keys error");
      return [];
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      return await this.storage.getStats();
    } catch {
      logger.error("Cache getStats error");
      return { entries: 0, totalSize: 0, hits: 0, misses: 0, evictions: 0 };
    }
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<number> {
    try {
      const cleaned = await this.storage.cleanup();
      if (cleaned > 0) {
        logger.info("Cache cleanup completed", { cleaned });
      }
      return cleaned;
    } catch {
      logger.error("Cache cleanup error");
      return 0;
    }
  }
}
