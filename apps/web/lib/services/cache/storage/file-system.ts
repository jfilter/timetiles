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

import { z } from "zod";

import { logger } from "@/lib/logger";
import { isENOENT } from "@/lib/utils/is-enoent";

import type { CacheEntry, CacheStats } from "../types";
import { decodeEntry, encodeEntry } from "./entry-codec";

const counterSchema = z.number().int().nonnegative();
const indexEntrySchema = z.object({
  file: z.string().min(1),
  expires: z.number().optional(),
  size: counterSchema,
  createdAt: z.number().optional(),
  lastAccessedAt: z.number().optional(),
  accessCount: counterSchema.optional(),
});
const indexDataSchema = z.object({
  index: z.record(z.string(), indexEntrySchema),
  stats: z.object({
    entries: counterSchema,
    totalSize: counterSchema,
    hits: counterSchema,
    misses: counterSchema,
    evictions: counterSchema,
  }),
  lastUpdated: z.string(),
});
type IndexEntry = z.infer<typeof indexEntrySchema>;
type IndexData = z.infer<typeof indexDataSchema>;

/**
 * File-backed cache for a single owner.
 *
 * Index writes are serialized and atomic WITHIN one instance. Two instances (or two
 * processes) pointed at the same directory each keep their own in-memory index, so
 * their `index.json` writes are last-write-wins — that is by design, every caller
 * owns its own cache directory. Do not share a directory between instances.
 */
export class FileSystemCacheStorage {
  private readonly cacheDir: string;
  private readonly indexFile: string;
  private index: Map<string, IndexEntry>;
  private stats: CacheStats;
  private readonly maxSize: number;
  private initPromise: Promise<void> | null = null;
  /** Serializes index writes; every set() rewrites the same file. */
  private indexWriteChain: Promise<void> = Promise.resolve();
  private indexWriteSeq = 0;
  private static instanceCounter = 0;
  private readonly instanceId: number;

  constructor({ cacheDir, maxSize }: { cacheDir: string; maxSize: number }) {
    FileSystemCacheStorage.instanceCounter += 1;
    this.instanceId = FileSystemCacheStorage.instanceCounter;
    this.cacheDir = cacheDir;
    this.indexFile = path.join(this.cacheDir, "index.json");
    this.index = new Map();
    this.maxSize = maxSize;
    this.stats = { entries: 0, totalSize: 0, hits: 0, misses: 0, evictions: 0 };
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

  async get<T>(key: string, options?: { allowExpired?: boolean }): Promise<CacheEntry<T> | null> {
    await this.ensureInitialized();

    const indexEntry = this.index.get(key);
    if (!indexEntry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (!options?.allowExpired && indexEntry.expires && indexEntry.expires <= Date.now()) {
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

      this.stats.hits++;
      return entry;
    } catch {
      // Remove unreadable payloads before releasing their accounting. If deletion
      // fails, retain the index so maintenance can retry instead of orphaning files.
      logger.debug("Failed to read cache file");
      await this.delete(key);
      this.stats.misses++;
      return null;
    }
  }

  /** Store a value for `ttl` seconds; a ttl of 0 never expires. */
  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    await this.ensureInitialized();

    const filePath = this.getCacheFilePath(key);
    const fileDir = path.dirname(filePath);

    // Ensure subdirectory exists
    await fs.mkdir(fileDir, { recursive: true });

    const now = new Date();
    const entry: CacheEntry<T> = {
      key,
      value,
      metadata: {
        createdAt: now,
        expiresAt: ttl > 0 ? new Date(now.getTime() + ttl * 1000) : undefined,
        accessCount: 0,
        lastAccessedAt: now,
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

    let deleted = true;
    try {
      await fs.unlink(indexEntry.file);
    } catch (error) {
      // Only a missing file releases accounting; other failures must remain retryable.
      if (!isENOENT(error)) throw error;
      deleted = false;
    }
    this.releaseIndexEntry(key);
    await this.saveIndex();
    return deleted;
  }

  async getStats(): Promise<CacheStats> {
    await this.ensureInitialized();

    let oldestDate: Date | undefined;
    let newestDate: Date | undefined;

    // Get creation dates from index
    for (const [, indexEntry] of this.index) {
      try {
        // Older indexes lack createdAt; only those need a filesystem fallback.
        const created =
          indexEntry.createdAt != null ? new Date(indexEntry.createdAt) : (await fs.stat(indexEntry.file)).birthtime;
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
      if (indexEntry.expires && indexEntry.expires <= now) {
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
    const entries: Array<{ key: string; lastAccessed: number }> = [];

    // Access times come from the index — reading every payload here loaded the whole cache
    // into memory just to sort it.
    for (const [key, indexEntry] of this.index) {
      entries.push({ key, lastAccessed: indexEntry.lastAccessedAt ?? indexEntry.createdAt ?? 0 });
    }

    // Sort by last accessed (oldest first)
    entries.sort((a, b) => a.lastAccessed - b.lastAccessed);

    // Remove until under 80% of max size
    const targetSize = this.maxSize * 0.8;

    for (const entry of entries) {
      // delete() releases accounting even when the file was already removed.
      if (this.stats.totalSize <= targetSize) break;

      if (await this.delete(entry.key)) {
        cleaned++;
        this.stats.evictions++;
      }
    }

    return cleaned;
  }

  private async loadIndex(): Promise<void> {
    try {
      const data = await fs.readFile(this.indexFile, "utf-8");
      const indexData = indexDataSchema.parse(JSON.parse(data));
      this.index = new Map(Object.entries(indexData.index));
      this.stats = indexData.stats;
      // Entry totals are derived state; persisted summaries can be stale.
      this.stats.entries = this.index.size;
      this.stats.totalSize = Array.from(this.index.values()).reduce((total, entry) => total + entry.size, 0);

      // Index paths must belong to their keys before any filesystem operation.
      const invalidKeys: string[] = [];
      for (const [key, entry] of this.index) {
        if (path.resolve(entry.file) !== path.resolve(this.getCacheFilePath(key))) {
          invalidKeys.push(key);
          continue;
        }
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

    const write = async (previous: Promise<void>): Promise<void> => {
      // An earlier failure belongs to its own caller; this write still runs.
      await previous.catch(() => undefined);
      try {
        await fs.writeFile(tempFile, payload);
        await fs.rename(tempFile, this.indexFile);
      } catch (error) {
        await fs.unlink(tempFile).catch(() => undefined);
        throw error;
      }
    };
    this.indexWriteChain = write(this.indexWriteChain);

    return this.indexWriteChain;
  }
}
