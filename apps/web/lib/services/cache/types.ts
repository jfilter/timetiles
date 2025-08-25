/**
 * Type definitions for the generic caching system.
 *
 * This module defines the core interfaces and types used throughout the cache
 * implementation. The design is generic enough to support various storage backends
 * (memory, filesystem, Redis, etc.) and different types of cached data.
 *
 * @module
 * @category Services/Cache
 */

/**
 * Generic cache entry that can store any type of data
 */
export interface CacheEntry<T = any> {
  key: string;
  value: T;
  metadata: CacheEntryMetadata;
}

/**
 * Metadata associated with a cache entry
 */
export interface CacheEntryMetadata {
  createdAt: Date;
  expiresAt?: Date;
  accessCount: number;
  lastAccessedAt: Date;
  size?: number;
  tags?: string[];
  custom?: Record<string, any>;
}

/**
 * Options for setting a cache value
 */
export interface CacheSetOptions {
  /** Time to live in seconds */
  ttl?: number;
  /** Tags for grouping related entries */
  tags?: string[];
  /** Custom metadata */
  metadata?: Record<string, any>;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of entries in cache */
  entries: number;
  /** Total size in bytes */
  totalSize: number;
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of evictions */
  evictions: number;
  /** Oldest entry timestamp */
  oldestEntry?: Date;
  /** Newest entry timestamp */
  newestEntry?: Date;
}

/**
 * Cache storage interface for different backends
 */
export interface CacheStorage {
  /**
   * Get a value from cache
   */
  get<T = any>(key: string): Promise<CacheEntry<T> | null>;

  /**
   * Set a value in cache
   */
  set<T = any>(key: string, value: T, options?: CacheSetOptions): Promise<void>;

  /**
   * Delete a value from cache
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if key exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Clear cache entries matching pattern
   * @returns Number of entries cleared
   */
  clear(pattern?: string): Promise<number>;

  /**
   * Get all keys matching pattern
   */
  keys(pattern?: string): Promise<string[]>;

  /**
   * Get multiple values at once
   */
  getMany<T = any>(keys: string[]): Promise<Map<string, CacheEntry<T>>>;

  /**
   * Set multiple values at once
   */
  setMany<T = any>(entries: Map<string, T>, options?: CacheSetOptions): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): Promise<CacheStats>;

  /**
   * Clean up expired entries
   * @returns Number of entries cleaned
   */
  cleanup(): Promise<number>;

  /**
   * Destroy the storage (cleanup resources)
   */
  destroy?(): void;
}

/**
 * Serializer interface for converting objects to/from storable format
 */
export interface Serializer {
  serialize<T>(value: T): string | Buffer;
  deserialize<T>(data: string | Buffer): T;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Storage backend */
  storage: CacheStorage;
  /** Cache namespace for key prefixing */
  namespace?: string;
  /** Default TTL in seconds */
  defaultTTL?: number;
  /** Maximum cache size in bytes */
  maxSize?: number;
  /** Maximum number of entries */
  maxEntries?: number;
  /** Custom serializer */
  serializer?: Serializer;
  /** Key prefix */
  keyPrefix?: string;
  /** Callback when entry is evicted */
  onEviction?: (key: string, value: any) => void;
}

/**
 * Options for memory cache storage
 */
export interface MemoryCacheOptions {
  /** Maximum number of entries */
  maxEntries?: number;
  /** Maximum total size in bytes */
  maxSize?: number;
  /** Default TTL in seconds */
  defaultTTL?: number;
  /** Callback when entry is evicted */
  onEviction?: (key: string, entry: CacheEntry) => void;
}

/**
 * Options for filesystem cache storage
 */
export interface FileSystemCacheOptions {
  /** Cache directory path */
  cacheDir?: string;
  /** Maximum cache size in bytes */
  maxSize?: number;
  /** Cleanup interval in milliseconds */
  cleanupIntervalMs?: number;
  /** Default TTL in seconds */
  defaultTTL?: number;
}

/**
 * HTTP-specific cache entry
 */
export interface HttpCacheEntry {
  url: string;
  method: string;
  data: Buffer;
  headers: Record<string, string>;
  statusCode: number;
  metadata: HttpCacheMetadata;
}

/**
 * HTTP cache metadata
 */
export interface HttpCacheMetadata {
  etag?: string;
  lastModified?: string;
  expires?: Date;
  maxAge?: number;
  fetchedAt: Date;
  contentHash: string;
  size: number;
}

/**
 * Options for HTTP cache
 */
export interface HttpCacheOptions {
  /** Use cache for this request */
  useCache?: boolean;
  /** Bypass cache and fetch fresh data */
  bypassCache?: boolean;
  /** Respect Cache-Control headers */
  respectCacheControl?: boolean;
  /** Force revalidation */
  forceRevalidate?: boolean;
}