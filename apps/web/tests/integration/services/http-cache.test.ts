/**
 * Integration tests for HTTP cache functionality.
 * 
 * These tests verify the HTTP cache works with real HTTP requests
 * to test endpoints without mocking.
 *
 * @module
 * @category Services/Cache/Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import os from "os";
import fs from "fs/promises";

import { HttpCache } from "@/lib/services/cache/http-cache";
import { FileSystemCacheStorage } from "@/lib/services/cache/storage/file-system";
import { Cache } from "@/lib/services/cache/cache";

describe("HTTP Cache Integration", () => {
  let httpCache: HttpCache;
  let tempDir: string;
  let storage: FileSystemCacheStorage;
  let testServer: string;

  beforeEach(async () => {
    // Create temp directory for cache
    tempDir = path.join(os.tmpdir(), `http-cache-test-${Date.now()}`);
    
    // Create file system storage
    storage = new FileSystemCacheStorage({
      cacheDir: tempDir,
      maxSize: 10 * 1024 * 1024, // 10MB
      defaultTTL: 3600, // 1 hour
    });

    // Create cache instance
    const cache = new Cache({
      storage,
      keyPrefix: "http:",
    });

    // Create HTTP cache
    httpCache = new HttpCache(cache);

    // Use a reliable test endpoint
    testServer = "https://httpbin.org";
  });

  afterEach(async () => {
    if (storage) {
      await storage.destroy();
    }
    
    // Remove temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe("Real HTTP requests", () => {
    it("should cache a successful HTTP response", async () => {
      const testUrl = `${testServer}/json`;

      // First request - should hit the server
      const response1 = await httpCache.fetch(testUrl);
      const data1 = await response1.json();
      expect(data1).toHaveProperty("slideshow");
      expect(response1.headers.get("X-Cache")).toBe("MISS");

      // Second request - should hit the cache
      const response2 = await httpCache.fetch(testUrl);
      const data2 = await response2.json();
      expect(data2).toEqual(data1);
      expect(response2.headers.get("X-Cache")).toBe("HIT");
    });

    it("should handle different status codes", async () => {
      // Test 404 response
      const notFoundUrl = `${testServer}/status/404`;
      const response404 = await httpCache.fetch(notFoundUrl);
      expect(response404.status).toBe(404);

      // Should not cache error responses by default
      const response404Again = await httpCache.fetch(notFoundUrl);
      expect(response404Again.headers.get("X-Cache")).not.toBe("HIT");
    });

    it("should handle query parameters", async () => {
      const baseUrl = `${testServer}/get`;
      
      // Different query params should be cached separately
      const response1 = await httpCache.fetch(`${baseUrl}?foo=bar`);
      expect(response1.headers.get("X-Cache")).toBe("MISS");

      const response2 = await httpCache.fetch(`${baseUrl}?foo=baz`);
      expect(response2.headers.get("X-Cache")).toBe("MISS");

      // Same query should hit cache
      const response3 = await httpCache.fetch(`${baseUrl}?foo=bar`);
      expect(response3.headers.get("X-Cache")).toBe("HIT");
    });

    it("should bypass cache when requested", async () => {
      const testUrl = `${testServer}/uuid`;

      // First request
      const response1 = await httpCache.fetch(testUrl);
      const data1 = await response1.json();
      expect(data1).toHaveProperty("uuid");

      // Second request with cache bypass
      const response2 = await httpCache.fetch(testUrl, {
        cache: "no-cache",
      });
      const data2 = await response2.json();
      expect(data2).toHaveProperty("uuid");
      expect(response2.headers.get("X-Cache")).not.toBe("HIT");
      
      // UUIDs should be different if we truly bypassed cache
      expect(data2.uuid).not.toBe(data1.uuid);
    });

    it("should handle POST requests without caching", async () => {
      const testUrl = `${testServer}/post`;
      const payload = { test: "data" };

      // POST requests should not be cached
      const response1 = await httpCache.fetch(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(response1.status).toBe(200);
      expect(response1.headers.get("X-Cache")).toBeNull();

      // Second POST should also not use cache
      const response2 = await httpCache.fetch(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(response2.headers.get("X-Cache")).toBeNull();
    });

    it("should handle headers in cache key", async () => {
      const testUrl = `${testServer}/headers`;

      // Request with specific headers
      const response1 = await httpCache.fetch(testUrl, {
        headers: {
          "X-Custom-Header": "value1",
        },
      });
      expect(response1.headers.get("X-Cache")).toBe("MISS");

      // Same URL but different headers should miss cache
      const response2 = await httpCache.fetch(testUrl, {
        headers: {
          "X-Custom-Header": "value2",
        },
      });
      expect(response2.headers.get("X-Cache")).toBe("MISS");

      // Same headers should hit cache
      const response3 = await httpCache.fetch(testUrl, {
        headers: {
          "X-Custom-Header": "value1",
        },
      });
      expect(response3.headers.get("X-Cache")).toBe("HIT");
    });
  });

  describe("Cache management", () => {
    it("should clear cache by pattern", async () => {
      // Cache multiple URLs
      await httpCache.fetch(`${testServer}/json`);
      await httpCache.fetch(`${testServer}/uuid`);
      await httpCache.fetch(`${testServer}/get?test=1`);

      // Verify all are cached
      const jsonCached = await httpCache.fetch(`${testServer}/json`);
      expect(jsonCached.headers.get("X-Cache")).toBe("HIT");

      // Clear cache with pattern
      const cleared = await httpCache.clear();
      expect(cleared).toBeGreaterThan(0);

      // JSON endpoint should no longer be cached
      const jsonAfterClear = await httpCache.fetch(`${testServer}/json`);
      expect(jsonAfterClear.headers.get("X-Cache")).toBe("MISS");

      // Other endpoints should still be cached
      const uuidCached = await httpCache.fetch(`${testServer}/uuid`);
      expect(uuidCached.headers.get("X-Cache")).toBe("HIT");
    });

    it("should provide cache statistics", async () => {
      // Make some cached requests
      await httpCache.fetch(`${testServer}/json`);
      await httpCache.fetch(`${testServer}/json`); // Hit

      const stats = await httpCache.getStats();
      expect(stats.entries).toBeGreaterThan(0);
      expect(stats.hits).toBeGreaterThan(0);
    });
  });

  describe("Error handling", () => {
    it("should handle network errors gracefully", async () => {
      const invalidUrl = "https://invalid-domain-that-does-not-exist-12345.com/test";

      // Should throw error, not cache
      await expect(httpCache.fetch(invalidUrl)).rejects.toThrow();

      // Verify cache is empty
      const cached = await httpCache.get(invalidUrl, "GET");
      expect(cached).toBeNull();
    });

    it("should handle timeout scenarios", async () => {
      // Use httpbin's delay endpoint
      const delayUrl = `${testServer}/delay/10`;

      // This should timeout with a short timeout setting
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      try {
        await httpCache.fetch(delayUrl, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (error: any) {
        clearTimeout(timeoutId);
        expect(error.name).toBe("AbortError");
      }

      // Should not have cached the failed request
      const cached = await httpCache.get(delayUrl, "GET");
      expect(cached).toBeNull();
    });
  });
});