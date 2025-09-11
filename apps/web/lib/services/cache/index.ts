/**
 * Cache service exports.
 *
 * @module
 * @category Services/Cache
 */

export { Cache } from "./cache";
export { getHttpCache, HttpCache } from "./http-cache";
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
  HttpCacheEntry,
  HttpCacheMetadata,
  HttpCacheOptions,
  MemoryCacheOptions,
  Serializer,
} from "./types";
