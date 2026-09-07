/**
 * Cache service exports.
 *
 * @module
 * @category Services/Cache
 */

export { Cache } from "./cache";
export { FileSystemCacheStorage } from "./storage/file-system";
export type {
  CacheConfig,
  CacheEntry,
  CacheEntryMetadata,
  CacheSetOptions,
  CacheStats,
  CacheStorage,
  FileSystemCacheOptions,
  UrlFetchCacheOptions,
} from "./types";
export { getUrlFetchCache, UrlFetchCache } from "./url-fetch-cache";
