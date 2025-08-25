/**
 * Cache service exports.
 *
 * @module
 * @category Services/Cache
 */

export { Cache } from "./cache";
export { CacheManager, CacheBackend } from "./manager";
export { HttpCache, getHttpCache } from "./http-cache";
export { MemoryCacheStorage } from "./storage/memory";
export { FileSystemCacheStorage } from "./storage/file-system";

export type {
  CacheEntry,
  CacheEntryMetadata,
  CacheSetOptions,
  CacheStats,
  CacheStorage,
  CacheConfig,
  Serializer,
  MemoryCacheOptions,
  FileSystemCacheOptions,
  HttpCacheEntry,
  HttpCacheMetadata,
  HttpCacheOptions,
} from "./types";