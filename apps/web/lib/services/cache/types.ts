/**
 * Type definitions for the cache services.
 *
 * Entry, statistics and request-option shapes shared by the file-system cache
 * and the URL fetch cache.
 *
 * @module
 * @category Services/Cache
 */

/**
 * Generic cache entry that can store any type of data
 */
export interface CacheEntry<T = unknown> {
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
 * Options for URL fetch cache
 */
export interface UrlFetchCacheOptions {
  /** Use cache for this request */
  useCache?: boolean;
  /** Bypass cache and fetch fresh data */
  bypassCache?: boolean;
  /** Respect Cache-Control headers */
  respectCacheControl?: boolean;
  /** Force revalidation */
  forceRevalidate?: boolean;
}
