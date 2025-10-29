/**
 * Cache service exports.
 *
 * @module
 * @category Services/Cache
 */

export { Cache } from "./cache";
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
  MemoryCacheOptions,
  Serializer,
  UrlFetchCacheEntry,
  UrlFetchCacheMetadata,
  UrlFetchCacheOptions,
} from "./types";
export { getUrlFetchCache, UrlFetchCache } from "./url-fetch-cache";
