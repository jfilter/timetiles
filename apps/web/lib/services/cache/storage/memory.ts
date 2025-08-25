/**
 * In-memory cache storage implementation using LRU cache.
 *
 * This storage backend keeps all cache entries in memory using an LRU (Least Recently Used)
 * eviction policy. It's fast and efficient for development and testing, but data is lost
 * when the process restarts.
 *
 * @module
 * @category Services/Cache/Storage
 */

import { LRUCache } from "lru-cache";

import type {
  CacheStorage,
  CacheEntry,
  CacheSetOptions,
  CacheStats,
  MemoryCacheOptions,
} from "../types";

export class MemoryCacheStorage implements CacheStorage {
  private cache: LRUCache<string, CacheEntry>;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
  };

  constructor(options: MemoryCacheOptions = {}) {
    this.stats = { hits: 0, misses: 0, evictions: 0 };

    this.cache = new LRUCache<string, CacheEntry>({
      max: options.maxEntries || 1000,
      maxSize: options.maxSize || 100 * 1024 * 1024, // 100MB default
      sizeCalculation: (entry) => {
        // Calculate size based on serialized value
        const size = entry.metadata.size || JSON.stringify(entry.value).length;
        return size;
      },
      ttl: options.defaultTTL ? options.defaultTTL * 1000 : undefined,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
      dispose: (value, key) => {
        this.stats.evictions++;
        if (options.onEviction) {
          options.onEviction(key, value);
        }
      },
    });
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.cache.get(key);
    if (entry) {
      this.stats.hits++;
      entry.metadata.accessCount++;
      entry.metadata.lastAccessedAt = new Date();
      return entry as CacheEntry<T>;
    }
    this.stats.misses++;
    return null;
  }

  async set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    const now = new Date();
    const entry: CacheEntry<T> = {
      key,
      value,
      metadata: {
        createdAt: now,
        expiresAt: options?.ttl ? new Date(now.getTime() + options.ttl * 1000) : undefined,
        accessCount: 0,
        lastAccessedAt: now,
        size: JSON.stringify(value).length,
        tags: options?.tags,
        custom: options?.metadata,
      },
    };

    const ttl = options?.ttl ? options.ttl * 1000 : undefined;
    this.cache.set(key, entry, { ttl });
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  async clear(pattern?: string): Promise<number> {
    if (!pattern) {
      const size = this.cache.size;
      this.cache.clear();
      return size;
    }

    // Clear by pattern
    const regex = new RegExp(pattern);
    let cleared = 0;
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    return cleared;
  }

  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Array.from(this.cache.keys());
    if (!pattern) return allKeys;

    const regex = new RegExp(pattern);
    return allKeys.filter((key) => regex.test(key));
  }

  async getMany<T>(keys: string[]): Promise<Map<string, CacheEntry<T>>> {
    const result = new Map<string, CacheEntry<T>>();
    for (const key of keys) {
      const entry = await this.get<T>(key);
      if (entry) {
        result.set(key, entry);
      }
    }
    return result;
  }

  async setMany<T>(entries: Map<string, T>, options?: CacheSetOptions): Promise<void> {
    for (const [key, value] of entries) {
      await this.set(key, value, options);
    }
  }

  async getStats(): Promise<CacheStats> {
    const entries = Array.from(this.cache.values());
    const dates = entries.map((e) => e.metadata.createdAt);

    return {
      entries: this.cache.size,
      totalSize: this.cache.calculatedSize || 0,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      oldestEntry: dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : undefined,
      newestEntry: dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : undefined,
    };
  }

  async cleanup(): Promise<number> {
    const before = this.cache.size;
    this.cache.purgeStale();
    return before - this.cache.size;
  }

  destroy(): void {
    this.cache.clear();
  }
}