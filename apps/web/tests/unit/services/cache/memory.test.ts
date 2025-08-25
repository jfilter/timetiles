/**
 * Unit tests for memory cache storage.
 *
 * @module
 * @category Services/Cache/Tests
 */

import { describe, it, expect, beforeEach } from "vitest";

import { MemoryCacheStorage } from "@/lib/services/cache/storage/memory";
import type { CacheEntry } from "@/lib/services/cache/types";

describe("MemoryCacheStorage", () => {
  let storage: MemoryCacheStorage;

  beforeEach(() => {
    // Create fresh instance for each test
    storage = new MemoryCacheStorage({
      maxEntries: 10,
      maxSize: 1024 * 1024, // 1MB
      defaultTTL: 60, // 1 minute
    });
  });
  
  afterEach(() => {
    // Ensure complete cleanup
    if (storage) {
      storage.destroy();
    }
  });

  describe("basic operations", () => {
    it("should store and retrieve a value", async () => {
      const key = "basic-test-key";
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
      const key = "delete-test-key";
      await storage.set(key, "value");

      const deleted = await storage.delete(key);
      expect(deleted).toBe(true);

      const entry = await storage.get(key);
      expect(entry).toBeNull();
    });

    it("should check if key exists", async () => {
      const key = "exists-test-key";
      await storage.set(key, "value");

      const hasKey = await storage.has(key);
      expect(hasKey).toBe(true);
      
      const hasNonExistent = await storage.has("non-existent");
      expect(hasNonExistent).toBe(false);
    });
  });

  describe("TTL and expiration", () => {
    it("should expire entries after TTL", async () => {
      const key = "ttl-test-key";
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
      const key = "metadata-test-key";
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
      await storage.set("batch-get-1", "value1");
      await storage.set("batch-get-2", "value2");
      await storage.set("batch-get-3", "value3");

      const entries = await storage.getMany(["batch-get-1", "batch-get-2", "non-existent"]);

      expect(entries.size).toBe(2);
      expect(entries.get("batch-get-1")?.value).toBe("value1");
      expect(entries.get("batch-get-2")?.value).toBe("value2");
      expect(entries.has("non-existent")).toBe(false);
    });

    it("should set multiple values", async () => {
      // Create fresh storage for this test to avoid interference
      const testStorage = new MemoryCacheStorage({
        maxEntries: 10,
        maxSize: 1024 * 1024,
        defaultTTL: 60,
      });

      const entries = new Map([
        ["batch-set-1", "value1"],
        ["batch-set-2", "value2"],
        ["batch-set-3", "value3"],
      ]);

      await testStorage.setMany(entries, { tags: ["batch"] });

      for (const [key, value] of entries) {
        const entry = await testStorage.get(key);
        expect(entry?.value).toBe(value);
        expect(entry?.metadata.tags).toEqual(["batch"]);
      }
      
      testStorage.destroy();
    });
  });

  describe("pattern matching", () => {
    it("should clear entries by pattern", async () => {
      // Create fresh storage for this test to avoid interference
      const testStorage = new MemoryCacheStorage({
        maxEntries: 10,
        maxSize: 1024 * 1024,
        defaultTTL: 60,
      });

      await testStorage.set("user:1", "data1");
      await testStorage.set("user:2", "data2");
      await testStorage.set("post:1", "data3");

      const cleared = await testStorage.clear("^user:");

      expect(cleared).toBe(2);
      expect(await testStorage.has("user:1")).toBe(false);
      expect(await testStorage.has("user:2")).toBe(false);
      expect(await testStorage.has("post:1")).toBe(true);
      
      testStorage.destroy();
    });

    it("should get keys by pattern", async () => {
      // Create fresh storage for this test to avoid interference
      const testStorage = new MemoryCacheStorage({
        maxEntries: 10,
        maxSize: 1024 * 1024,
        defaultTTL: 60,
      });

      await testStorage.set("user:1", "data1");
      await testStorage.set("user:2", "data2");
      await testStorage.set("post:1", "data3");

      const keys = await testStorage.keys("^user:");

      expect(keys).toHaveLength(2);
      expect(keys).toContain("user:1");
      expect(keys).toContain("user:2");
      expect(keys).not.toContain("post:1");
      
      testStorage.destroy();
    });
  });

  describe("eviction and limits", () => {
    it("should evict LRU entries when max entries exceeded", async () => {
      // Create storage with max 3 entries
      const limitedStorage = new MemoryCacheStorage({
        maxEntries: 3,
      });

      await limitedStorage.set("lru-1", "value1");
      await limitedStorage.set("lru-2", "value2");
      await limitedStorage.set("lru-3", "value3");

      // Access lru-1 to make it recently used
      await limitedStorage.get("lru-1");

      // Add new entry, should evict lru-2 (least recently used)
      await limitedStorage.set("lru-4", "value4");

      expect(await limitedStorage.has("lru-1")).toBe(true); // Recently accessed
      expect(await limitedStorage.has("lru-2")).toBe(false); // Evicted
      expect(await limitedStorage.has("lru-3")).toBe(true);
      expect(await limitedStorage.has("lru-4")).toBe(true);
    });

    it("should track eviction count", async () => {
      const limitedStorage = new MemoryCacheStorage({
        maxEntries: 2,
      });

      await limitedStorage.set("evict-1", "value1");
      await limitedStorage.set("evict-2", "value2");
      await limitedStorage.set("evict-3", "value3"); // Should evict evict-1

      const stats = await limitedStorage.getStats();
      expect(stats.evictions).toBe(1);
    });
  });

  describe("statistics", () => {
    it("should track hits and misses", async () => {
      // Create fresh storage for this test to avoid interference
      const testStorage = new MemoryCacheStorage({
        maxEntries: 10,
        maxSize: 1024 * 1024,
        defaultTTL: 60,
      });

      await testStorage.set("stats-key", "value1");

      // Hit
      await testStorage.get("stats-key");
      // Miss
      await testStorage.get("non-existent");
      // Another miss
      await testStorage.get("another-non-existent");

      const stats = await testStorage.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      
      testStorage.destroy();
    });

    it("should track total size", async () => {
      await storage.set("size-1", { data: "small" });
      await storage.set("size-2", { data: "a".repeat(1000) });

      const stats = await storage.getStats();
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.entries).toBe(2);
    });

    it("should track oldest and newest entries", async () => {
      const before = new Date();
      await storage.set("time-1", "value1");
      await new Promise((resolve) => setTimeout(resolve, 10));
      await storage.set("time-2", "value2");
      const after = new Date();

      const stats = await storage.getStats();
      expect(stats.oldestEntry).toBeDefined();
      expect(stats.newestEntry).toBeDefined();
      expect(stats.oldestEntry!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stats.newestEntry!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("cleanup", () => {
    it("should cleanup stale entries", async () => {
      // Create fresh storage for this test to avoid interference
      const testStorage = new MemoryCacheStorage({
        maxEntries: 10,
        maxSize: 1024 * 1024,
        defaultTTL: 60,
      });

      await testStorage.set("stale-1", "value1", { ttl: 0.1 }); // Expires in 100ms
      await testStorage.set("stale-2", "value2", { ttl: 10 }); // Expires in 10s

      // Wait for first entry to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const cleaned = await testStorage.cleanup();
      expect(cleaned).toBe(1);
      expect(await testStorage.has("stale-1")).toBe(false);
      expect(await testStorage.has("stale-2")).toBe(true);
      
      testStorage.destroy();
    });

    it("should clear all entries", async () => {
      // Create fresh storage for this test to avoid interference
      const testStorage = new MemoryCacheStorage({
        maxEntries: 10,
        maxSize: 1024 * 1024,
        defaultTTL: 60,
      });

      await testStorage.set("clear-1", "value1");
      await testStorage.set("clear-2", "value2");
      await testStorage.set("clear-3", "value3");

      const cleared = await testStorage.clear();
      expect(cleared).toBe(3);

      const stats = await testStorage.getStats();
      expect(stats.entries).toBe(0);
      
      testStorage.destroy();
    });
  });

  describe("tags and metadata", () => {
    it("should store tags with entries", async () => {
      await storage.set("tags-key", "value1", {
        tags: ["tag1", "tag2"],
        metadata: { custom: "data" },
      });

      const entry = await storage.get("tags-key");
      expect(entry?.metadata.tags).toEqual(["tag1", "tag2"]);
      expect(entry?.metadata.custom).toEqual({ custom: "data" });
    });
  });
});