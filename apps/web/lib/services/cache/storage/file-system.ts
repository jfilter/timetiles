/**
 * File system cache storage implementation.
 *
 * This storage backend persists cache entries to the file system, allowing data to survive
 * process restarts. It organizes cache files in subdirectories for better performance with
 * large numbers of entries and maintains an index for fast lookups.
 *
 * @module
 * @category Services/Cache/Storage
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { logger } from "@/lib/logger";

import type { CacheEntry, CacheSetOptions, CacheStats, CacheStorage, FileSystemCacheOptions } from "../types";
import { decodeEntry, encodeEntry } from "./entry-codec";

interface IndexEntry {
  file: string;
  expires?: number;
  size: number;
  tags?: string[];
  /** Access metadata lives here so reads never rewrite the payload and LRU never reads it. */
  createdAt?: number;
  lastAccessedAt?: number;
  accessCount?: number;
}

interface IndexData {
  index: Record<string, IndexEntry>;
  stats: CacheStats;
  lastUpdated: string;
}

/**
 * File-backed cache for a single owner.
 *
 * Index writes are serialized and atomic WITHIN one instance. Two instances (or two
 * processes) pointed at the same directory each keep their own in-memory index, so
 * their `index.json` writes are last-write-wins — that is by design, every caller
 * owns its own cache directory. Do not share a directory between instances.
 */
export class FileSystemCacheStorage implements CacheStorage {
  private readonly cacheDir: string;
  private readonly indexFile: string;
  private index: Map<string, IndexEntry>;
  private stats: CacheStats;
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private initPromise: Promise<void> | null = null;
  /** Serializes index writes; every set() rewrites the same file. */
  private indexWriteChain: Promise<void> = Promise.resolve();
  private indexWriteSeq = 0;
  private static instanceCounter = 0;
  private readonly instanceId: number;

  constructor(options: FileSystemCacheOptions = {}) {
    FileSystemCacheStorage.instanceCounter += 1;
    this.instanceId = FileSystemCacheStorage.instanceCounter;
    this.cacheDir = options.cacheDir ?? path.join(process.cwd(), ".cache", "general");
    this.indexFile = path.join(this.cacheDir, "index.json");
    this.index = new Map();
    this.maxSize = options.maxSize ?? 500 * 1024 * 1024; // 500MB default
    this.defaultTTL = options.defaultTTL ?? 3600; // 1 hour default
    this.stats = { entries: 0, totalSize: 0, hits: 0, misses: 0, evictions: 0 };

    // Initialize cache directory and index lazily
    // Initialization will happen on first use via ensureInitialized()
    this.initPromise = null;

    // Setup periodic cleanup
    if (options.cleanupIntervalMs) {
      this.cleanupInterval = setInterval(() => {
        // oxlint-disable-next-line promise/prefer-await-to-then
        void this.cleanup().catch((err: unknown) => {
          logger.error("Cache cleanup error", { error: err });
        });
      }, options.cleanupIntervalMs);
    }
  }

  private async initialize(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await this.loadIndex();
  }

  private async ensureInitialized(): Promise<void> {
    this.initPromise ??= this.initialize();
    await this.initPromise;
  }

  /**
   * Drop an index entry and release its accounting.
   *
   * Every removal path must go through here: forgetting the `totalSize` subtraction
   * leaves phantom bytes that can hold the cache permanently "over capacity".
   */
  private releaseIndexEntry(key: string): void {
    const entry = this.index.get(key);
    if (!entry) return;
    this.index.delete(key);
    this.stats.entries--;
    this.stats.totalSize -= entry.size;
  }

  private getCacheFilePath(key: string): string {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const subdir = hash.substring(0, 2); // Use first 2 chars for subdirectory
    return path.join(this.cacheDir, subdir, `${hash}.cache`);
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    await this.ensureInitialized();

    const indexEntry = this.index.get(key);
    if (!indexEntry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (indexEntry.expires && indexEntry.expires < Date.now()) {
      await this.delete(key);
      this.stats.misses++;
      return null;
    }

    try {
      const raw = await fs.readFile(indexEntry.file);
      const entry = decodeEntry<T>(raw);

      // Access metadata is tracked in the index — rewriting the payload on every hit
      // would re-serialize the whole body.
      const accessedAt = Date.now();
      indexEntry.accessCount = (indexEntry.accessCount ?? entry.metadata.accessCount) + 1;
      indexEntry.lastAccessedAt = accessedAt;
      entry.metadata.accessCount = indexEntry.accessCount;
      entry.metadata.lastAccessedAt = new Date(accessedAt);
      entry.metadata.size ??= indexEntry.size;

      this.stats.hits++;
      return entry;
    } catch (error) {
      // File might be corrupted or deleted. Release its accounting too: dropping the
      // index entry alone left `totalSize` (and `entries`) counting bytes that are gone,
      // and phantom size above `maxSize` makes cleanupLRU evict on every subsequent set()
      // — including the entry just written, pinning the hit rate at zero across restarts.
      logger.debug("Failed to read cache file", { key, error });
      this.releaseIndexEntry(key);
      await this.saveIndex();
      this.stats.misses++;
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    await this.ensureInitialized();

    const filePath = this.getCacheFilePath(key);
    const fileDir = path.dirname(filePath);

    // Ensure subdirectory exists
    await fs.mkdir(fileDir, { recursive: true });

    const now = new Date();
    const ttl = options?.ttl ?? this.defaultTTL;
    const entry: CacheEntry<T> = {
      key,
      value,
      metadata: {
        createdAt: now,
        expiresAt: ttl > 0 ? new Date(now.getTime() + ttl * 1000) : undefined,
        accessCount: 0,
        lastAccessedAt: now,
        tags: options?.tags,
        custom: options?.metadata,
      },
    };

    // Write cache file — size comes from the bytes actually written, never a second serialization.
    const serialized = encodeEntry(entry);
    await fs.writeFile(filePath, serialized);

    // Update index
    const indexEntry: IndexEntry = {
      file: filePath,
      expires: entry.metadata.expiresAt?.getTime(),
      size: serialized.length,
      tags: options?.tags,
      createdAt: now.getTime(),
      lastAccessedAt: now.getTime(),
      accessCount: 0,
    };

    // Remove old entry's size from stats if it exists
    const oldEntry = this.index.get(key);
    if (oldEntry) {
      this.stats.totalSize -= oldEntry.size;
    } else {
      this.stats.entries++;
    }

    this.index.set(key, indexEntry);
    this.stats.totalSize += indexEntry.size;

    await this.saveIndex();

    // Check if cleanup needed
    if (this.stats.totalSize > this.maxSize) {
      await this.cleanup();
    }
  }

  async delete(key: string): Promise<boolean> {
    await this.ensureInitialized();

    const indexEntry = this.index.get(key);
    if (!indexEntry) return false;

    try {
      await fs.unlink(indexEntry.file);
      this.releaseIndexEntry(key);
      await this.saveIndex();
      return true;
    } catch {
      // File might already be deleted
      this.releaseIndexEntry(key);
      await this.saveIndex();
      return false;
    }
  }

  async has(key: string): Promise<boolean> {
    await this.ensureInitialized();

    const indexEntry = this.index.get(key);
    if (!indexEntry) return false;

    // Check expiration
    if (indexEntry.expires && indexEntry.expires < Date.now()) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  async clear(pattern?: string): Promise<number> {
    await this.ensureInitialized();

    let cleared = 0;

    if (pattern) {
      // Clear by pattern
      const regex = new RegExp(pattern);
      const keys = Array.from(this.index.keys());
      for (const key of keys) {
        if (regex.test(key) && (await this.delete(key))) {
          cleared++;
        }
      }
    } else {
      // Clear everything
      const keys = Array.from(this.index.keys());
      for (const key of keys) {
        if (await this.delete(key)) {
          cleared++;
        }
      }
    }

    return cleared;
  }

  async keys(pattern?: string): Promise<string[]> {
    await this.ensureInitialized();

    const allKeys = Array.from(this.index.keys());
    if (!pattern) return allKeys;

    const regex = new RegExp(pattern);
    return allKeys.filter((key) => regex.test(key));
  }

  async getMany<T>(keys: string[]): Promise<Map<string, CacheEntry<T>>> {
    await this.ensureInitialized();

    const result = new Map<string, CacheEntry<T>>();

    // Batch read for efficiency
    await Promise.all(
      keys.map(async (key) => {
        const entry = await this.get<T>(key);
        if (entry) {
          result.set(key, entry);
        }
      })
    );

    return result;
  }

  async setMany<T>(entries: Map<string, T>, options?: CacheSetOptions): Promise<void> {
    await this.ensureInitialized();

    // Sequential: every set() rewrites the single index file, so concurrent
    // writes can interleave and leave a truncated index behind.
    for (const [key, value] of entries) {
      await this.set(key, value, options);
    }
  }

  async getStats(): Promise<CacheStats> {
    await this.ensureInitialized();

    let oldestDate: Date | undefined;
    let newestDate: Date | undefined;

    // Get creation dates from index
    for (const [, indexEntry] of this.index) {
      try {
        const stats = await fs.stat(indexEntry.file);
        const created = stats.birthtime;
        if (!oldestDate || created < oldestDate) {
          oldestDate = created;
        }
        if (!newestDate || created > newestDate) {
          newestDate = created;
        }
      } catch {
        // File might be deleted
      }
    }

    return { ...this.stats, entries: this.index.size, oldestEntry: oldestDate, newestEntry: newestDate };
  }

  async cleanup(): Promise<number> {
    await this.ensureInitialized();

    let cleaned = 0;

    // Remove expired entries
    cleaned += await this.cleanupExpiredEntries();

    // If still over size limit, remove least recently used
    if (this.stats.totalSize > this.maxSize) {
      cleaned += await this.cleanupLRU();
    }

    await this.saveIndex();
    return cleaned;
  }

  private async cleanupExpiredEntries(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;
    const expiredKeys: string[] = [];

    for (const [key, indexEntry] of this.index) {
      if (indexEntry.expires && indexEntry.expires < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      if (await this.delete(key)) {
        cleaned++;
      }
    }

    return cleaned;
  }

  private async cleanupLRU(): Promise<number> {
    let cleaned = 0;
    const entries: Array<{ key: string; lastAccessed: number; size: number }> = [];

    // Access times come from the index — reading every payload here loaded the whole cache
    // into memory just to sort it.
    for (const [key, indexEntry] of this.index) {
      entries.push({
        key,
        lastAccessed: indexEntry.lastAccessedAt ?? indexEntry.createdAt ?? 0,
        size: indexEntry.size,
      });
    }

    // Sort by last accessed (oldest first)
    entries.sort((a, b) => a.lastAccessed - b.lastAccessed);

    // Remove until under 80% of max size
    let currentSize = this.stats.totalSize;
    const targetSize = this.maxSize * 0.8;

    for (const entry of entries) {
      if (currentSize <= targetSize) break;

      if (await this.delete(entry.key)) {
        currentSize -= entry.size;
        cleaned++;
        this.stats.evictions++;
      }
    }

    return cleaned;
  }

  private async loadIndex(): Promise<void> {
    try {
      const data = await fs.readFile(this.indexFile, "utf-8");
      const indexData: IndexData = JSON.parse(data);
      this.index = new Map(Object.entries(indexData.index));
      this.stats = indexData.stats || this.stats;

      // Validate index entries still exist
      const invalidKeys: string[] = [];
      for (const [key, entry] of this.index) {
        try {
          await fs.access(entry.file);
        } catch {
          invalidKeys.push(key);
        }
      }

      // Remove invalid entries — subtracting their size, not just the count.
      for (const key of invalidKeys) {
        this.releaseIndexEntry(key);
      }

      if (invalidKeys.length > 0) {
        await this.saveIndex();
      }
    } catch {
      // Index doesn't exist yet or is corrupted
      this.index = new Map();
      this.stats = { entries: 0, totalSize: 0, hits: 0, misses: 0, evictions: 0 };
    }
  }

  private async saveIndex(): Promise<void> {
    const indexData: IndexData = {
      index: Object.fromEntries(this.index),
      stats: this.stats,
      lastUpdated: new Date().toISOString(),
    };
    // Write-then-rename through a serialized queue: every set() rewrites this one
    // file, so overlapping writes could otherwise leave a truncated index behind —
    // loadIndex reads that as "corrupted" and drops the whole cache.
    const payload = JSON.stringify(indexData, null, 2);
    this.indexWriteSeq += 1;
    // instanceId as well as pid: two storages on the same directory in one process
    // would otherwise queue the same temp path and rename each other's file away.
    const tempFile = `${this.indexFile}.${process.pid}.${this.instanceId}.${this.indexWriteSeq}.tmp`;

    const write = async (): Promise<void> => {
      try {
        await fs.writeFile(tempFile, payload);
        await fs.rename(tempFile, this.indexFile);
      } catch (error) {
        await fs.unlink(tempFile).catch(() => undefined);
        throw error;
      }
    };
    this.indexWriteChain = this.indexWriteChain.then(write, write);

    return this.indexWriteChain;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Schedule cleanup operations (async operations not allowed in destroy)
    if (this.initPromise) {
      void this.initPromise
        // oxlint-disable-next-line promise/prefer-await-to-then -- Cannot use async/await in synchronous destroy method
        .then(() => {
          return this.saveIndex();
        })
        // oxlint-disable-next-line promise/prefer-await-to-then -- Cannot use async/await in synchronous destroy method
        .catch(() => {
          // Ignore errors on shutdown
        });
    }
  }
}
