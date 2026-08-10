/**
 * Main cache service that provides high-level caching operations.
 *
 * This service wraps the storage backend and provides a convenient API for caching
 * operations including cache-aside pattern, tag-based invalidation, and namespacing.
 *
 * @module
 * @category Services/Cache
 */

import { logger } from "@/lib/logger";

import type { CacheConfig, CacheEntry, CacheSetOptions, CacheStorage } from "./types";

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
    } catch (error) {
      logger.error("Cache get error", { key: fullKey, error });
      return null;
    }
  }

  /**
   * Get full cache entry with metadata
   */
  async getEntry<T>(key: string): Promise<CacheEntry<T> | null> {
    const fullKey = this.makeKey(key);
    try {
      return await this.storage.get<T>(fullKey);
    } catch (error) {
      logger.error("Cache getEntry error", { key: fullKey, error });
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
    } catch (error) {
      logger.error("Cache set error", { key: fullKey, error });
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<boolean> {
    const fullKey = this.makeKey(key);
    try {
      return await this.storage.delete(fullKey);
    } catch (error) {
      logger.error("Cache delete error", { key: fullKey, error });
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    const fullKey = this.makeKey(key);
    try {
      return await this.storage.has(fullKey);
    } catch (error) {
      logger.error("Cache has error", { key: fullKey, error });
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
    } catch (error) {
      logger.error("Cache clear error", { pattern: fullPattern, error });
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
    } catch (error) {
      logger.error("Cache keys error", { pattern: fullPattern, error });
      return [];
    }
  }

  /**
   * Get multiple values at once
   */
  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const fullKeys = keys.map((k) => this.makeKey(k));
    try {
      const entries = await this.storage.getMany<T>(fullKeys);

      // Convert back to original keys
      const result = new Map<string, T>();
      const prefixLength = this.keyPrefix.length;
      for (const [fullKey, entry] of entries) {
        const key = fullKey.substring(prefixLength);
        if (entry?.value != null) {
          result.set(key, entry.value);
        }
      }
      return result;
    } catch (error) {
      logger.error("Cache getMany error", { keys: fullKeys, error });
      return new Map();
    }
  }

  /**
   * Set multiple values at once
   */
  async setMany<T>(entries: Map<string, T> | Record<string, T>, options?: CacheSetOptions): Promise<void> {
    const map = entries instanceof Map ? entries : new Map(Object.entries(entries));
    const fullEntries = new Map<string, T>();

    for (const [key, value] of map) {
      fullEntries.set(this.makeKey(key), value);
    }

    try {
      // Same defaulting as set(): without it a batch write ignores the configured TTL.
      await this.storage.setMany(fullEntries, { ...options, ttl: options?.ttl ?? this.config.defaultTTL });
    } catch (error) {
      logger.error("Cache setMany error", { error });
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      return await this.storage.getStats();
    } catch (error) {
      logger.error("Cache getStats error", { error });
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
    } catch (error) {
      logger.error("Cache cleanup error", { error });
      return 0;
    }
  }

  /**
   * Create a namespaced cache instance
   */
  namespace(namespace: string): Cache {
    return new Cache({ ...this.config, keyPrefix: this.keyPrefix + namespace + ":" });
  }

  /**
   * Destroy the cache (cleanup resources)
   */
  destroy(): void {
    if (this.storage.destroy) {
      this.storage.destroy();
    }
  }
}
