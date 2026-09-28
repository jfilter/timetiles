/**
 * Unit tests for file-system cache storage.
 *
 * @module
 * @category Services/Cache/Tests
 */

import "@/tests/mocks/services/logger";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Cache } from "@/lib/services/cache/cache";
import { FileSystemCacheStorage } from "@/lib/services/cache/storage/file-system";
import { TEST_SECRETS } from "@/tests/constants/test-credentials";
import { mockLogger } from "@/tests/mocks/services/logger";

describe.sequential("FileSystemCacheStorage", () => {
  let storage: FileSystemCacheStorage;
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a unique temp directory for each test
    tempDir = path.join(os.tmpdir(), `cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    storage = new FileSystemCacheStorage({ cacheDir: tempDir, maxSize: 1024 * 1024 });
  });

  const indexedKeys = async () => {
    const data = JSON.parse(await fs.readFile(path.join(tempDir, "index.json"), "utf8")) as { index: object };
    return Object.keys(data.index);
  };

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("basic operations", () => {
    it("does not report successful maintenance when the cache directory is unusable", async () => {
      await fs.mkdir(tempDir, { recursive: true });
      const blockedPath = path.join(tempDir, "not-a-directory");
      await fs.writeFile(blockedPath, "file");
      const cache = new Cache(new FileSystemCacheStorage({ cacheDir: blockedPath, maxSize: 1024 }), "");

      await expect(cache.cleanup()).rejects.toEqual(new Error("Cache cleanup failed"));
    });

    it("allows revalidation reads of expired entries without exempting them from cleanup", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        await storage.set("expired", "validator source", 0.01);
        vi.setSystemTime(Date.now() + 10);

        expect((await storage.get("expired", { allowExpired: true }))?.value).toBe("validator source");
        expect(await storage.cleanup()).toBe(1);
        expect(await storage.get("expired", { allowExpired: true })).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("should store and retrieve a value", async () => {
      const key = "fs-test-key";
      const value = { data: "test-value" };

      await storage.set(key, value, 60);
      const entry = await storage.get(key);

      expect(entry).toMatchObject({ key, value, metadata: { accessCount: 1 } });
      expect(entry!.metadata.expiresAt!.getTime() - entry!.metadata.createdAt.getTime()).toBe(60_000);
    });

    it("should return null for non-existent key", async () => {
      const entry = await storage.get("non-existent");
      expect(entry).toBeNull();
    });

    it("should delete a value", async () => {
      const key = "fs-delete-key";
      await storage.set(key, "value", 60);

      const deleted = await storage.delete(key);
      expect(deleted).toBe(true);

      const entry = await storage.get(key);
      expect(entry).toBeNull();
    });

    it.each(["delete", "get"] as const)(
      "retains the index and size when %s cannot remove a cache file",
      async (action) => {
        const key = "unlink-failure";
        await storage.set(key, "value", 60);
        const before = await storage.getStats();
        const indexFile = path.join(tempDir, "index.json");
        const indexBefore = await fs.readFile(indexFile, "utf8");
        const index = JSON.parse(indexBefore) as { index: Record<string, { file: string }> };
        const file = index.index[key]!.file;
        // unlink cannot remove a directory, even when tests run as root.
        await fs.unlink(file);
        await fs.mkdir(file);

        await expect(storage[action](key)).rejects.toThrow();
        expect(await storage.getStats()).toMatchObject({ entries: 1, totalSize: before.totalSize });
        expect(await fs.readFile(indexFile, "utf8")).toBe(indexBefore);

        await fs.rmdir(file);
        await fs.writeFile(file, "restored");
        expect(await storage.delete(key)).toBe(true);
        expect(await storage.getStats()).toMatchObject({ entries: 0, totalSize: 0 });
      }
    );

    it("releases accounting when a cache file is already missing", async () => {
      const key = "missing-file";
      await storage.set(key, "value", 60);
      const index = JSON.parse(await fs.readFile(path.join(tempDir, "index.json"), "utf8")) as {
        index: Record<string, { file: string }>;
      };
      await fs.unlink(index.index[key]!.file);

      expect(await storage.delete(key)).toBe(false);
      expect(await indexedKeys()).toEqual([]);
      expect(await storage.getStats()).toMatchObject({ entries: 0, totalSize: 0 });
    });
  });

  describe("persistence", () => {
    it("rebuilds entry totals instead of trusting persisted summaries", async () => {
      const hash = createHash("sha256").update("entry").digest("hex");
      const file = path.join(tempDir, hash.substring(0, 2), `${hash}.cache`);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, "content");
      await fs.writeFile(
        path.join(tempDir, "index.json"),
        JSON.stringify({
          index: { entry: { file, size: 7 } },
          stats: { entries: 0, totalSize: 0, hits: 3, misses: 2, evictions: 1 },
          lastUpdated: new Date().toISOString(),
        })
      );
      expect(await storage.getStats()).toMatchObject({ entries: 1, totalSize: 7, hits: 3, misses: 2, evictions: 1 });
      await storage.delete("entry");
      expect(await storage.getStats()).toMatchObject({ entries: 0, totalSize: 0 });
    });

    it("does not delete files that do not belong to the indexed key", async () => {
      await fs.mkdir(tempDir, { recursive: true });
      const foreignFile = path.join(tempDir, "not-a-cache-entry.txt");
      await fs.writeFile(foreignFile, "keep me");
      await fs.writeFile(
        path.join(tempDir, "index.json"),
        JSON.stringify({
          index: { injected: { file: foreignFile, size: 7 } },
          stats: { entries: 1, totalSize: 7, hits: 0, misses: 0, evictions: 0 },
          lastUpdated: new Date().toISOString(),
        })
      );
      expect(await storage.delete("injected")).toBe(false);
      expect(await fs.readFile(foreignFile, "utf8")).toBe("keep me");
      expect(await storage.getStats()).toMatchObject({ entries: 0, totalSize: 0 });
    });

    it.each(["invalid size", "invalid stats"])("discards an index containing %s", async (corruption) => {
      await fs.mkdir(tempDir, { recursive: true });
      const file = path.join(tempDir, "entry.cache");
      await fs.writeFile(file, "unused");
      await fs.writeFile(
        path.join(tempDir, "index.json"),
        JSON.stringify({
          index: { broken: { file, size: corruption === "invalid size" ? -1 : 6 } },
          stats: {
            entries: 1,
            totalSize: 6,
            hits: corruption === "invalid stats" ? "wrong" : 0,
            misses: 0,
            evictions: 0,
          },
          lastUpdated: new Date().toISOString(),
        })
      );
      expect(await storage.getStats()).toMatchObject({ entries: 0, totalSize: 0, hits: 0 });
      await storage.set("healthy", "value", 60);
      expect((await storage.get("healthy"))?.value).toBe("value");
    });

    it("recovers the index write queue after a failed rename", async () => {
      await storage.set("before", "first", 60);
      const indexFile = path.join(tempDir, "index.json");
      await fs.unlink(indexFile);
      await fs.mkdir(indexFile);

      await expect(storage.set("failed", "second", 60)).rejects.toThrow();
      expect((await fs.readdir(tempDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);

      await fs.rmdir(indexFile);
      await storage.set("after", "third", 60);

      const persisted = JSON.parse(await fs.readFile(indexFile, "utf8")) as { index: Record<string, unknown> };
      expect(new Set(Object.keys(persisted.index))).toEqual(new Set(["after", "before", "failed"]));
    });

    it("should persist data across instances", async () => {
      const key = "persist-key";
      const value = { data: "persistent-value" };

      // Store data with first instance — set() awaits saveIndex(),
      // so the index file is on disk when this returns.
      await storage.set(key, value, 60);

      const newStorage = new FileSystemCacheStorage({ cacheDir: tempDir, maxSize: 1024 * 1024 });
      expect((await newStorage.get(key))?.value).toEqual(value);
    });

    it("serializes index writes of concurrent sets and persists every entry", async () => {
      // Holding payload writes until all have started makes the index saves collide.
      const keys = ["many-1", "many-2", "many-3"];
      let releasePayloads!: () => void;
      const payloadsStarted = new Promise<void>((resolve) => {
        releasePayloads = resolve;
      });
      let payloads = 0;
      let indexWrites = 0;
      let maxIndexWrites = 0;
      const { writeFile, rename } = fs;
      vi.spyOn(fs, "writeFile").mockImplementation(async (file, data) => {
        if (typeof file === "string" && file.endsWith(".tmp")) maxIndexWrites = Math.max(maxIndexWrites, ++indexWrites);
        else if (++payloads === keys.length) releasePayloads();
        await payloadsStarted;
        return writeFile(file, data);
      });
      vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
        await rename(from, to);
        indexWrites--;
      });
      try {
        await Promise.all(keys.map((key) => storage.set(key, `value-for-${key}`, 60)));
      } finally {
        vi.restoreAllMocks();
      }

      expect(maxIndexWrites).toBe(1);

      const newStorage = new FileSystemCacheStorage({ cacheDir: tempDir, maxSize: 1024 * 1024 });
      for (const key of keys) {
        expect((await newStorage.get(key))?.value).toBe(`value-for-${key}`);
      }
    });

    it("should handle cache directory creation", async () => {
      const nestedDir = path.join(tempDir, "nested", "deep", "cache");
      const tempStorage = new FileSystemCacheStorage({ cacheDir: nestedDir, maxSize: 1024 * 1024 });

      await tempStorage.set("test", "value", 60);

      // Check directory was created
      const stats = await fs.stat(nestedDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe("TTL and expiration", () => {
    it("expires get() and cleanup() entries exactly at their deadline", async () => {
      await storage.set("get-deadline", "value", 60);
      const entry = await storage.get("get-deadline");
      const clock = vi.spyOn(Date, "now").mockReturnValue(entry!.metadata.expiresAt!.getTime());
      try {
        expect(await storage.get("get-deadline")).toBeNull();
      } finally {
        clock.mockRestore();
      }

      await storage.set("cleanup-deadline", "value", 60);
      const cleanupEntry = await storage.get("cleanup-deadline");
      const cleanupClock = vi.spyOn(Date, "now").mockReturnValue(cleanupEntry!.metadata.expiresAt!.getTime());
      try {
        expect(await storage.cleanup()).toBe(1);
        expect(await storage.get("cleanup-deadline", { allowExpired: true })).toBeNull();
      } finally {
        cleanupClock.mockRestore();
      }
    });

    it("should expire entries after TTL", async () => {
      const key = "fs-ttl-key";
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        await storage.set(key, "test-value", 0.1);
        vi.setSystemTime(Date.now() + 99);
        expect((await storage.get(key))?.value).toBe("test-value");

        vi.setSystemTime(Date.now() + 1);
        expect(await storage.get(key)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("should update access metadata on get", async () => {
      const key = "fs-metadata-key";
      await storage.set(key, "value", 60);

      const entry1 = await storage.get(key);
      expect(entry1?.metadata.accessCount).toBe(1);

      const entry2 = await storage.get(key);
      expect(entry2?.metadata.accessCount).toBe(2);
      expect(entry2?.metadata.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(
        entry1!.metadata.lastAccessedAt.getTime()
      );
    });
  });

  describe("file handling", () => {
    it("should handle large values", async () => {
      const largeData = {
        data: "x".repeat(100000), // 100KB string
        nested: { array: Array(1000).fill("item") },
      };

      await storage.set("large-key", largeData, 60);
      const entry = await storage.get("large-key");

      expect(entry?.value).toEqual(largeData);
    });

    it("should round-trip a large binary body byte-identically", async () => {
      const body = Buffer.alloc(3 * 1024 * 1024);
      for (let i = 0; i < body.length; i++) {
        body[i] = i % 256;
      }

      const binaryStorage = new FileSystemCacheStorage({
        cacheDir: path.join(tempDir, "binary"),
        maxSize: 64 * 1024 * 1024,
      });

      await binaryStorage.set("binary-key", { data: body, status: 200 }, 60);
      const entry = await binaryStorage.get<{ data: Buffer; status: number }>("binary-key");

      expect(entry?.value.status).toBe(200);
      expect(Buffer.isBuffer(entry?.value.data)).toBe(true);
      expect(entry?.value.data.equals(body)).toBe(true);

      // The payload must be stored as bytes, not as a JSON byte array
      // (~11 chars per source byte, which throws past ~48MB).
      const keyHash = (await import("node:crypto")).createHash("sha256").update("binary-key").digest("hex");
      const cacheFile = path.join(tempDir, "binary", keyHash.substring(0, 2), `${keyHash}.cache`);
      const fileSize = (await fs.stat(cacheFile)).size;
      expect(fileSize).toBeLessThan(body.length * 2);
    });

    it("should not rewrite the payload file on a cache hit", async () => {
      const key = "no-rewrite-key";
      await storage.set(key, { data: Buffer.from("hello world") }, 60);

      const keyHash = createHash("sha256").update(key).digest("hex");
      const cacheFile = path.join(tempDir, keyHash.substring(0, 2), `${keyHash}.cache`);
      // A past mtime makes any rewrite visible without waiting for the clock to advance.
      const past = new Date("2020-01-01T00:00:00Z");
      await fs.utimes(cacheFile, past, past);

      expect((await storage.get(key))?.value).toEqual({ data: Buffer.from("hello world") });
      expect((await fs.stat(cacheFile)).mtime).toEqual(past);
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
        await storage.set(key, `value-for-${key}`, 60);
        const entry = await storage.get(key);
        expect(entry?.value).toBe(`value-for-${key}`);
      }
    });

    it("should handle concurrent operations", async () => {
      const promises = [];

      // Concurrent writes
      for (let i = 0; i < 10; i++) {
        promises.push(storage.set(`concurrent-${i}`, `value-${i}`, 60));
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
    it("counts missing files toward the space released during LRU cleanup", async () => {
      storage = new FileSystemCacheStorage({ cacheDir: tempDir, maxSize: 4000 });
      const value = Buffer.alloc(1000);
      for (const key of ["oldest", "older", "recent"]) {
        await storage.set(key, value, 60);
      }
      const index = JSON.parse(await fs.readFile(path.join(tempDir, "index.json"), "utf8")) as {
        index: Record<string, { file: string }>;
      };
      await fs.unlink(index.index.oldest!.file);

      await storage.set("newest", value, 60);

      expect(await indexedKeys()).toEqual(["recent", "newest"]);
      expect(await storage.getStats()).toMatchObject({ entries: 2, evictions: 1 });
      expect((await storage.get<Buffer>("recent"))?.value).toEqual(value);
      expect((await storage.get<Buffer>("newest"))?.value).toEqual(value);
    });

    it("should cleanup stale entries", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        await storage.set("fs-stale-1", "value1", 0.1);
        await storage.set("fs-stale-2", "value2", 10);
        vi.setSystemTime(Date.now() + 100);

        expect(await storage.cleanup()).toBe(1);
        expect(await indexedKeys()).toEqual(["fs-stale-2"]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should handle corrupted cache files gracefully", async () => {
      const key = `https://example.com/?token=${TEST_SECRETS.payloadSecret}`;
      await storage.set(key, "valid-value", 60);

      // Corrupt the cache file - match the actual implementation
      const crypto = await import("node:crypto");
      const keyHash = crypto.createHash("sha256").update(key).digest("hex");
      const subDir = keyHash.substring(0, 2);
      const cacheFile = path.join(tempDir, subDir, `${keyHash}.cache`);

      await fs.writeFile(cacheFile, "{ invalid json", "utf-8");

      // Should return null for corrupted entry
      const entry = await storage.get(key);
      expect(entry).toBeNull();
      await expect(fs.access(cacheFile)).rejects.toMatchObject({ code: "ENOENT" });
      expect(mockLogger.logger.debug).toHaveBeenCalledWith("Failed to read cache file");

      // Should be able to overwrite corrupted entry
      await storage.set(key, "new-value", 60);
      const newEntry = await storage.get(key);
      expect(newEntry?.value).toBe("new-value");
    });

    it("rejects truncated binary cache data instead of returning a partial value", async () => {
      const key = "truncated-binary";
      const value = Buffer.from("complete binary payload");
      await storage.set(key, value, 60);
      const index = JSON.parse(await fs.readFile(path.join(tempDir, "index.json"), "utf8")) as {
        index: Record<string, { file: string }>;
      };
      const file = index.index[key]!.file;
      const raw = await fs.readFile(file);
      await fs.writeFile(file, raw.subarray(0, raw.length - 1));

      expect(await storage.get(key)).toBeNull();
      expect(await storage.getStats()).toMatchObject({ entries: 0, totalSize: 0, hits: 0, misses: 1 });

      await storage.set(key, value, 60);
      expect((await storage.get<Buffer>(key))?.value).toEqual(value);
    });
  });

  describe("statistics", () => {
    it("reports the replacement entry's creation time rather than the file's birth time", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
        await storage.set("replaced", "original", 0);
        const replacementTime = new Date("2024-02-01T00:00:00Z");
        vi.setSystemTime(replacementTime);
        await storage.set("replaced", "replacement", 0);

        expect(await storage.getStats()).toMatchObject({ oldestEntry: replacementTime, newestEntry: replacementTime });
      } finally {
        vi.useRealTimers();
      }
    });

    it("should track hits and misses", async () => {
      // Create fresh storage for accurate stats
      const statsStorage = new FileSystemCacheStorage({ cacheDir: path.join(tempDir, "stats"), maxSize: 1024 * 1024 });

      await statsStorage.set("stats-key", "value1", 60);

      // Hit
      await statsStorage.get("stats-key");
      // Miss
      await statsStorage.get("non-existent");
      // Another miss
      await statsStorage.get("another-non-existent");

      const stats = await statsStorage.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
    });

    it("tracks exact file bytes across UTF-8 writes, replacements, and deletion", async () => {
      const fileSize = async (key: string) => {
        const hash = (await import("node:crypto")).createHash("sha256").update(key).digest("hex");
        return (await fs.stat(path.join(tempDir, hash.substring(0, 2), `${hash}.cache`))).size;
      };

      await storage.set("fs-size-1", { data: "Grüße 🌍" }, 60);
      await storage.set("fs-size-2", { data: Buffer.alloc(1000) }, 60);
      const secondSize = await fileSize("fs-size-2");
      expect(await storage.getStats()).toMatchObject({
        totalSize: (await fileSize("fs-size-1")) + secondSize,
        entries: 2,
      });

      await storage.set("fs-size-1", { data: "東京".repeat(1000) }, 60);
      expect(await storage.getStats()).toMatchObject({
        totalSize: (await fileSize("fs-size-1")) + secondSize,
        entries: 2,
      });

      await storage.delete("fs-size-1");
      expect(await storage.getStats()).toMatchObject({ totalSize: secondSize, entries: 1 });
      await storage.delete("fs-size-2");
      expect(await storage.getStats()).toMatchObject({ totalSize: 0, entries: 0 });
    });
  });
});
