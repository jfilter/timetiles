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

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import type {
  CacheStorage,
  CacheEntry,
  CacheSetOptions,
  CacheStats,
  FileSystemCacheOptions,
} from "../types";

interface IndexEntry {
  file: string;
  expires?: number;
  size: number;
  tags?: string[];
}

interface IndexData {
  index: Record<string, IndexEntry>;
  stats: CacheStats;
  lastUpdated: string;
}

export class FileSystemCacheStorage implements CacheStorage {
  private cacheDir: string;
  private indexFile: string;
  private index: Map<string, IndexEntry>;
  private stats: CacheStats;
  private maxSize: number;
  private defaultTTL: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: FileSystemCacheOptions = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), ".cache", "general");
    this.indexFile = path.join(this.cacheDir, "index.json");
    this.index = new Map();
    this.maxSize = options.maxSize || 500 * 1024 * 1024; // 500MB default
    this.defaultTTL = options.defaultTTL || 3600; // 1 hour default
    this.stats = {
      entries: 0,
      totalSize: 0,
      hits: 0,
      misses: 0,
      evictions: 0,
    };

    // Initialize cache directory and index
    this.initPromise = this.initialize();

    // Setup periodic cleanup
    if (options.cleanupIntervalMs) {
      this.cleanupInterval = setInterval(() => {
        this.cleanup().catch((err) => console.error("Cache cleanup error:", err));
      }, options.cleanupIntervalMs);
    }
  }

  private async initialize(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await this.loadIndex();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
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
      const filePath = indexEntry.file;
      const data = await fs.readFile(filePath, "utf-8");
      const entry: CacheEntry<T> = JSON.parse(data);

      // Update access metadata
      entry.metadata.accessCount++;
      entry.metadata.lastAccessedAt = new Date();

      // Write back updated metadata
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2));

      this.stats.hits++;
      return entry;
    } catch (error) {
      // File might be corrupted or deleted
      this.index.delete(key);
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
    const ttl = options?.ttl || this.defaultTTL;
    const entry: CacheEntry<T> = {
      key,
      value,
      metadata: {
        createdAt: now,
        expiresAt: ttl > 0 ? new Date(now.getTime() + ttl * 1000) : undefined,
        accessCount: 0,
        lastAccessedAt: now,
        size: JSON.stringify(value).length,
        tags: options?.tags,
        custom: options?.metadata,
      },
    };

    // Write cache file
    const serialized = JSON.stringify(entry, null, 2);
    await fs.writeFile(filePath, serialized);

    // Update index
    const indexEntry: IndexEntry = {
      file: filePath,
      expires: entry.metadata.expiresAt?.getTime(),
      size: serialized.length,
      tags: options?.tags,
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
      this.index.delete(key);
      this.stats.entries--;
      this.stats.totalSize -= indexEntry.size;
      await this.saveIndex();
      return true;
    } catch {
      // File might already be deleted
      this.index.delete(key);
      this.stats.entries--;
      this.stats.totalSize -= indexEntry.size;
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

    if (!pattern) {
      // Clear everything
      const keys = Array.from(this.index.keys());
      for (const key of keys) {
        if (await this.delete(key)) {
          cleared++;
        }
      }
    } else {
      // Clear by pattern
      const regex = new RegExp(pattern);
      const keys = Array.from(this.index.keys());
      for (const key of keys) {
        if (regex.test(key)) {
          if (await this.delete(key)) {
            cleared++;
          }
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

    // Batch write for efficiency
    await Promise.all(Array.from(entries).map(([key, value]) => this.set(key, value, options)));
  }

  async getStats(): Promise<CacheStats> {
    await this.ensureInitialized();

    let oldestDate: Date | undefined;
    let newestDate: Date | undefined;

    // Get creation dates from index
    for (const [_, indexEntry] of this.index) {
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

    return {
      ...this.stats,
      entries: this.index.size,
      oldestEntry: oldestDate,
      newestEntry: newestDate,
    };
  }

  async cleanup(): Promise<number> {
    await this.ensureInitialized();

    const now = Date.now();
    let cleaned = 0;

    // Remove expired entries
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

    // If still over size limit, remove least recently used
    if (this.stats.totalSize > this.maxSize) {
      const entries: Array<{
        key: string;
        lastAccessed: number;
        size: number;
      }> = [];

      // Collect all entries with their last access time
      for (const [key, indexEntry] of this.index) {
        try {
          const data = await fs.readFile(indexEntry.file, "utf-8");
          const entry = JSON.parse(data);
          entries.push({
            key,
            lastAccessed: new Date(entry.metadata.lastAccessedAt || entry.metadata.createdAt).getTime(),
            size: indexEntry.size,
          });
        } catch {
          // Skip corrupted entries
          await this.delete(key);
          cleaned++;
        }
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
    }

    await this.saveIndex();
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

      // Remove invalid entries
      for (const key of invalidKeys) {
        this.index.delete(key);
        this.stats.entries--;
      }

      if (invalidKeys.length > 0) {
        await this.saveIndex();
      }
    } catch {
      // Index doesn't exist yet or is corrupted
      this.index = new Map();
      this.stats = {
        entries: 0,
        totalSize: 0,
        hits: 0,
        misses: 0,
        evictions: 0,
      };
    }
  }

  private async saveIndex(): Promise<void> {
    const indexData: IndexData = {
      index: Object.fromEntries(this.index),
      stats: this.stats,
      lastUpdated: new Date().toISOString(),
    };
    await fs.writeFile(this.indexFile, JSON.stringify(indexData, null, 2));
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}