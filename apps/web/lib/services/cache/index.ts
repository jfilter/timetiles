/**
 * Cache service exports.
 *
 * @module
 * @category Services/Cache
 */

export { Cache } from "./cache";
export { getUrlFetchCache, UrlFetchCache } from "./url-fetch-cache";
export { CacheBackend, CacheManager } from "./manager";
export { FileSystemCacheStorage } from "./storage/file-system";
export { MemoryCacheStorage } from "./storage/memory";
export type {
  CacheConfig,
  CacheEntry,
  CacheEntryMetadata,
  CacheSetOptions,
  CacheStats,
  CacheStorage,
  FileSystemCacheOptions,
  UrlFetchCacheEntry,
  UrlFetchCacheMetadata,
  UrlFetchCacheOptions,
  MemoryCacheOptions,
  Serializer,
} from "./types";
