/**
 * Key-prefixed facade over the file-system cache storage.
 *
 * Request-path reads and writes are best-effort. Statistics and cleanup propagate
 * failures so callers never act on invented results.
 *
 * @module
 * @category Services/Cache
 */

import { logger } from "@/lib/logger";

import type { FileSystemCacheStorage } from "./storage/file-system";
import type { CacheStats } from "./types";

const bestEffort = async <T>(operation: string, fallback: T, run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch {
    logger.error(`Cache ${operation} error`);
    return fallback;
  }
};

// Storage errors can include cache keys; callers such as Payload jobs persist the message.
const withoutDetails = async <T>(operation: string, run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch {
    throw new Error(`Cache ${operation} failed`);
  }
};

export class Cache {
  constructor(
    private readonly storage: FileSystemCacheStorage,
    private readonly keyPrefix: string
  ) {}

  async get<T>(key: string, options?: { allowExpired?: boolean }): Promise<T | null> {
    return bestEffort(
      "get",
      null,
      async () => (await this.storage.get<T>(this.keyPrefix + key, options))?.value ?? null
    );
  }

  /** Store a value for `ttl` seconds; a ttl of 0 never expires. */
  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    return bestEffort("set", undefined, () => this.storage.set(this.keyPrefix + key, value, ttl));
  }

  async delete(key: string): Promise<boolean> {
    return bestEffort("delete", false, () => this.storage.delete(this.keyPrefix + key));
  }

  async getStats(): Promise<CacheStats> {
    return withoutDetails("getStats", () => this.storage.getStats());
  }

  async cleanup(): Promise<number> {
    const cleaned = await withoutDetails("cleanup", () => this.storage.cleanup());
    if (cleaned > 0) {
      logger.info("Cache cleanup completed", { cleaned });
    }
    return cleaned;
  }
}
