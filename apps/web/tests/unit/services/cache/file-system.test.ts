/**
 * Unit tests for file-system cache storage.
 *
 * @module
 * @category Services/Cache/Tests
 */

import fs from "node:fs/promises";
import path from "node:path";

import os from "os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileSystemCacheStorage } from "@/lib/services/cache/storage/file-system";

describe.sequential("FileSystemCacheStorage", () => {
  let storage: FileSystemCacheStorage;
  let tempDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = path.join(os.tmpdir(), `cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    storage = new FileSystemCacheStorage({
      cacheDir: tempDir,
      maxSize: 1024 * 1024, // 1MB
      defaultTTL: 60, // 1 minute
      cleanupIntervalMs: 60000, // 1 minute
    });
  });

  afterEach(async () => {
    // Clean up
    if (storage) {
      storage.destroy();
    }

    // Remove temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe("basic operations", () => {
    it("should store and retrieve a value", async () => {
      const key = "fs-test-key";
      const value = { data: "test-value" };

      await storage.set(key, value);
      const entry = await storage.get(key);

      expect(entry).toBeDefined();
      expect(entry?.key).toBe(key);
      expect(entry?.value).toEqual(value);
      expect(entry?.metadata).toBeDefined();
    });

    it("should return null for non-existent key", async () => {
      const entry = await storage.get("non-existent");
      expect(entry).toBeNull();
    });

    it("should delete a value", async () => {
      const key = "fs-delete-key";
      await storage.set(key, "value");

      const deleted = await storage.delete(key);
      expect(deleted).toBe(true);

      const entry = await storage.get(key);
      expect(entry).toBeNull();
    });

    it("should check if key exists", async () => {
      const key = "fs-exists-key";
      await storage.set(key, "value");

      const hasKey = await storage.has(key);
      expect(hasKey).toBe(true);

      const hasNonExistent = await storage.has("non-existent");
      expect(hasNonExistent).toBe(false);
    });
  });

  describe("persistence", () => {
    it("should persist data across instances", async () => {
      const key = "persist-key";
      const value = { data: "persistent-value" };

      // Store data with first instance — set() awaits saveIndex(),
      // so the index file is on disk when this returns.
      await storage.set(key, value);

      // Don't call destroy() here — it fires a floating saveIndex() that
      // races with the new instance's loadIndex(). The afterEach hook
      // handles cleanup. The index is already persisted by set().

      // Create new instance with same cache directory
      const newStorage = new FileSystemCacheStorage({
        cacheDir: tempDir,
      });

      // Should be able to retrieve the data
      const entry = await newStorage.get(key);
      expect(entry?.value).toEqual(value);

      newStorage.destroy();
    });

    it("should handle cache directory creation", async () => {
      const nestedDir = path.join(tempDir, "nested", "deep", "cache");
      const tempStorage = new FileSystemCacheStorage({
        cacheDir: nestedDir,
      });

      await tempStorage.set("test", "value");

      // Check directory was created
      const stats = await fs.stat(nestedDir);
      expect(stats.isDirectory()).toBe(true);

      tempStorage.destroy();
    });
  });

  describe("TTL and expiration", () => {
    it("should expire entries after TTL", async () => {
      const key = "fs-ttl-key";
      const value = "test-value";

      // Set with 0.1 second TTL
      await storage.set(key, value, { ttl: 0.1 });

      // Should exist immediately
      expect(await storage.has(key)).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be expired
      expect(await storage.has(key)).toBe(false);
      expect(await storage.get(key)).toBeNull();
    });

    it("should update access metadata on get", async () => {
      const key = "fs-metadata-key";
      await storage.set(key, "value");

      const entry1 = await storage.get(key);
      expect(entry1?.metadata.accessCount).toBe(1);

      const entry2 = await storage.get(key);
      expect(entry2?.metadata.accessCount).toBe(2);
      expect(entry2?.metadata.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(
        entry1!.metadata.lastAccessedAt.getTime()
      );
    });
  });

  describe("batch operations", () => {
    it("should get multiple values", async () => {
      await storage.set("fs-batch-1", "value1");
      await storage.set("fs-batch-2", "value2");
      await storage.set("fs-batch-3", "value3");

      const entries = await storage.getMany(["fs-batch-1", "fs-batch-2", "non-existent"]);

      expect(entries.size).toBe(2);
      expect(entries.get("fs-batch-1")?.value).toBe("value1");
      expect(entries.get("fs-batch-2")?.value).toBe("value2");
      expect(entries.has("non-existent")).toBe(false);
    });

    it("should set multiple values", async () => {
      const entries = new Map([
        ["fs-set-1", "value1"],
        ["fs-set-2", "value2"],
        ["fs-set-3", "value3"],
      ]);

      await storage.setMany(entries, { tags: ["batch"] });

      for (const [key, value] of entries) {
        const entry = await storage.get(key);
        expect(entry?.value).toBe(value);
        expect(entry?.metadata.tags).toEqual(["batch"]);
      }
    });
  });

  describe("pattern matching", () => {
    it("should clear entries by pattern", async () => {
      await storage.set("user:1", "data1");
      await storage.set("user:2", "data2");
      await storage.set("post:1", "data3");

      const cleared = await storage.clear("^user:");

      expect(cleared).toBe(2);
      expect(await storage.has("user:1")).toBe(false);
      expect(await storage.has("user:2")).toBe(false);
      expect(await storage.has("post:1")).toBe(true);
    });

    it("should get keys by pattern", async () => {
      await storage.set("pattern:1", "data1");
      await storage.set("pattern:2", "data2");
      await storage.set("other:1", "data3");

      const keys = await storage.keys("^pattern:");

      expect(keys).toHaveLength(2);
      expect(keys).toContain("pattern:1");
      expect(keys).toContain("pattern:2");
      expect(keys).not.toContain("other:1");
    });
  });

  describe("file handling", () => {
    it("should handle large values", async () => {
      const largeData = {
        data: "x".repeat(100000), // 100KB string
        nested: {
          array: Array(1000).fill("item"),
        },
      };

      await storage.set("large-key", largeData);
      const entry = await storage.get("large-key");

      expect(entry?.value).toEqual(largeData);
    });

    it("should handle special characters in keys", async () => {
      const specialKeys = [
        "key-with-spaces and stuff",
        "key/with/slashes",
        "key:with:colons",
        "key.with.dots",
        "key@with#special$chars",
      ];

      for (const key of specialKeys) {
        await storage.set(key, `value-for-${key}`);
        const entry = await storage.get(key);
        expect(entry?.value).toBe(`value-for-${key}`);
      }
    });

    it("should handle concurrent operations", async () => {
      const promises = [];

      // Concurrent writes
      for (let i = 0; i < 10; i++) {
        promises.push(storage.set(`concurrent-${i}`, `value-${i}`));
      }

      await Promise.all(promises);

      // Concurrent reads
      const readPromises = [];
      for (let i = 0; i < 10; i++) {
        readPromises.push(storage.get(`concurrent-${i}`));
      }

      const results = await Promise.all(readPromises);

      for (let i = 0; i < 10; i++) {
        expect(results[i]?.value).toBe(`value-${i}`);
      }
    });
  });

  describe("cleanup", () => {
    it("should cleanup stale entries", async () => {
      await storage.set("fs-stale-1", "value1", { ttl: 0.1 }); // Expires in 100ms
      await storage.set("fs-stale-2", "value2", { ttl: 10 }); // Expires in 10s

      // Wait for first entry to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const cleaned = await storage.cleanup();
      expect(cleaned).toBe(1);
      expect(await storage.has("fs-stale-1")).toBe(false);
      expect(await storage.has("fs-stale-2")).toBe(true);
    });

    it("should clear all entries", async () => {
      await storage.set("fs-clear-1", "value1");
      await storage.set("fs-clear-2", "value2");
      await storage.set("fs-clear-3", "value3");

      const cleared = await storage.clear();
      expect(cleared).toBe(3);

      const stats = await storage.getStats();
      expect(stats.entries).toBe(0);
    });

    it("should handle corrupted cache files gracefully", async () => {
      const key = "corrupted-key";
      await storage.set(key, "valid-value");

      // Corrupt the cache file - match the actual implementation
      const crypto = await import("crypto");
      const keyHash = crypto.createHash("sha256").update(key).digest("hex");
      const subDir = keyHash.substring(0, 2);
      const cacheFile = path.join(tempDir, subDir, `${keyHash}.cache`);

      await fs.writeFile(cacheFile, "{ invalid json", "utf-8");

      // Should return null for corrupted entry
      const entry = await storage.get(key);
      expect(entry).toBeNull();

      // Should be able to overwrite corrupted entry
      await storage.set(key, "new-value");
      const newEntry = await storage.get(key);
      expect(newEntry?.value).toBe("new-value");
    });
  });

  describe("statistics", () => {
    it("should track hits and misses", async () => {
      // Create fresh storage for accurate stats
      const statsStorage = new FileSystemCacheStorage({
        cacheDir: path.join(tempDir, "stats"),
      });

      await statsStorage.set("stats-key", "value1");

      // Hit
      await statsStorage.get("stats-key");
      // Miss
      await statsStorage.get("non-existent");
      // Another miss
      await statsStorage.get("another-non-existent");

      const stats = await statsStorage.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);

      statsStorage.destroy();
    });

    it("should track total size", async () => {
      await storage.set("fs-size-1", { data: "small" });
      await storage.set("fs-size-2", { data: "a".repeat(1000) });

      const stats = await storage.getStats();
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.entries).toBe(2);
    });
  });

  describe("tags and metadata", () => {
    it("should store tags with entries", async () => {
      await storage.set("fs-tags-key", "value1", {
        tags: ["tag1", "tag2"],
        metadata: { custom: "data" },
      });

      const entry = await storage.get("fs-tags-key");
      expect(entry?.metadata.tags).toEqual(["tag1", "tag2"]);
      expect(entry?.metadata.custom).toEqual({ custom: "data" });
    });
  });
});
