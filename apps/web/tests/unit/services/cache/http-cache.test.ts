/**
 * Unit tests for HTTP cache functionality.
 *
 * @module
 * @category Services/Cache/Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import fs from "fs/promises";

import { HttpCache } from "@/lib/services/cache/http-cache";
import { Cache } from "@/lib/services/cache/cache";
import { MemoryCacheStorage } from "@/lib/services/cache/storage/memory";
import type { HttpCacheEntry } from "@/lib/services/cache/types";

// Mock fetch globally
global.fetch = vi.fn();

describe("HttpCache", () => {
  let httpCache: HttpCache;
  let cache: Cache;
  let storage: MemoryCacheStorage;

  beforeEach(() => {
    // Reset fetch mock
    vi.resetAllMocks();
    (global.fetch as any).mockReset();
    
    // Create fresh storage and cache with unique prefix for each test
    storage = new MemoryCacheStorage({
      maxEntries: 100,
      maxSize: 10 * 1024 * 1024, // 10MB
    });
    
    cache = new Cache({
      storage,
      keyPrefix: `test-${Date.now()}-${Math.random()}:`,
    });
    
    httpCache = new HttpCache(cache);
  });

  afterEach(() => {
    storage.destroy();
    vi.clearAllMocks();
  });

  describe("basic caching", () => {
    it("should cache a successful response", async () => {
      const testUrl = "https://api.example.com/data";
      const responseData = { message: "Hello, World!" };
      const responseBuffer = Buffer.from(JSON.stringify(responseData));

      // Mock successful response
      (global.fetch as any).mockResolvedValueOnce(
        new Response(responseBuffer, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "max-age=3600",
          },
        })
      );

      // First request - should hit the server
      const response1 = await httpCache.fetch(testUrl);
      expect(response1.status).toBe(200);
      expect(response1.headers.get("X-Cache")).toBe("MISS");
      
      const data1 = await response1.json();
      expect(data1).toEqual(responseData);

      // Verify fetch was called
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second request - should hit the cache
      const response2 = await httpCache.fetch(testUrl);
      expect(response2.status).toBe(200);
      expect(response2.headers.get("X-Cache")).toBe("HIT");
      
      const data2 = await response2.json();
      expect(data2).toEqual(responseData);

      // Verify fetch was not called again
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should not cache responses with no-store directive", async () => {
      const testUrl = "https://api.example.com/no-cache";
      const responseData = { data: "sensitive" };

      // Mock response with no-store
      (global.fetch as any).mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        })
      );

      // First request
      await httpCache.fetch(testUrl);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second request - should not use cache
      await httpCache.fetch(testUrl);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should bypass cache for non-GET requests", async () => {
      const testUrl = "https://api.example.com/data";
      const postData = { key: "value" };

      // Mock POST response
      (global.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      // POST request - should not cache
      await httpCache.fetch(testUrl, {
        method: "POST",
        body: JSON.stringify(postData),
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Another POST - should not use cache
      await httpCache.fetch(testUrl, {
        method: "POST",
        body: JSON.stringify(postData),
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("conditional requests", () => {
    it("should handle 304 Not Modified", async () => {
      const testUrl = "https://api.example.com/etag-test";
      const etag = '"abc123"';
      const responseData = { version: 1 };
      const responseBuffer = Buffer.from(JSON.stringify(responseData));

      // First request - returns data with ETag
      (global.fetch as any).mockResolvedValueOnce(
        new Response(responseBuffer, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "ETag": etag,
            "Cache-Control": "must-revalidate, max-age=0",
          },
        })
      );

      // First fetch
      const response1 = await httpCache.fetch(testUrl);
      expect(response1.status).toBe(200);
      const data1 = await response1.json();
      expect(data1).toEqual(responseData);

      // Second request - returns 304
      (global.fetch as any).mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: {
            "ETag": etag,
          },
        })
      );

      // Second fetch - should revalidate
      const response2 = await httpCache.fetch(testUrl, {
        forceRevalidate: true,
      });
      expect(response2.status).toBe(200); // Client sees 200, not 304
      expect(response2.headers.get("X-Cache-Revalidated")).toBe("true");
      
      const data2 = await response2.json();
      expect(data2).toEqual(responseData); // Same data as before

      // Verify conditional headers were sent
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const secondCall = (global.fetch as any).mock.calls[1];
      expect(secondCall[1].headers.get("If-None-Match")).toBe(etag);
    });
  });

  describe("cache options", () => {
    it("should bypass cache when requested", async () => {
      const testUrl = "https://api.example.com/bypass";
      let requestCount = 0;

      // Mock response that counts requests
      (global.fetch as any).mockImplementation(() => {
        requestCount++;
        return Promise.resolve(
          new Response(JSON.stringify({ count: requestCount }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "max-age=3600",
            },
          })
        );
      });

      // First request - normal
      const response1 = await httpCache.fetch(testUrl);
      const data1 = await response1.json();
      expect(data1.count).toBe(1);

      // Second request - should use cache
      const response2 = await httpCache.fetch(testUrl);
      const data2 = await response2.json();
      expect(data2.count).toBe(1); // Same as before

      // Third request - bypass cache
      const response3 = await httpCache.fetch(testUrl, {
        bypassCache: true,
      });
      const data3 = await response3.json();
      expect(data3.count).toBe(2); // New request made

      expect(requestCount).toBe(2);
    });

    it("should return stale cache on error when requested", async () => {
      const testUrl = "https://api.example.com/stale-on-error";
      const responseData = { data: "cached" };

      // First request - successful
      (global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify(responseData), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "max-age=1", // Expires quickly
          },
        })
      );

      // Cache the response
      await httpCache.fetch(testUrl);

      // Wait for cache to become stale
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Second request - network error
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      // Should return stale cache
      const response = await httpCache.fetch(testUrl, {
        returnStaleOnError: true,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Cache-Stale")).toBe("true");
      
      const data = await response.json();
      expect(data).toEqual(responseData);
    });
  });

  describe("error handling", () => {
    it("should not cache error responses", async () => {
      const testUrl = "https://api.example.com/error";

      // Mock error response
      (global.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({ error: "Server Error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      );

      // First request - error
      const response1 = await httpCache.fetch(testUrl);
      expect(response1.status).toBe(500);

      // Second request - should make new request, not use cache
      const response2 = await httpCache.fetch(testUrl);
      expect(response2.status).toBe(500);

      // Both requests should have been made
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should propagate network errors", async () => {
      const testUrl = "https://api.example.com/network-error";

      // Mock network error
      (global.fetch as any).mockRejectedValueOnce(new Error("Network timeout"));

      // Should throw error
      await expect(httpCache.fetch(testUrl)).rejects.toThrow("Network timeout");

      // Verify cache is empty
      const cached = await httpCache.get(testUrl);
      expect(cached).toBeNull();
    });
  });

  describe("cache management", () => {
    it("should clear cache entries", async () => {
      const testUrl1 = "https://api.example.com/data1";
      const testUrl2 = "https://api.example.com/data2";

      // Mock responses
      (global.fetch as any).mockImplementation((url: string) => {
        return Promise.resolve(
          new Response(JSON.stringify({ url }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "max-age=3600",
            },
          })
        );
      });

      // Cache both URLs
      await httpCache.fetch(testUrl1);
      await httpCache.fetch(testUrl2);

      // Verify both are cached
      expect(await httpCache.get(testUrl1)).not.toBeNull();
      expect(await httpCache.get(testUrl2)).not.toBeNull();

      // Clear cache
      const cleared = await httpCache.clear();
      expect(cleared).toBeGreaterThanOrEqual(2);

      // Verify cache is empty
      expect(await httpCache.get(testUrl1)).toBeNull();
      expect(await httpCache.get(testUrl2)).toBeNull();
    });

    it("should provide cache statistics", async () => {
      const testUrl = "https://api.example.com/stats-test";

      // Mock response
      (global.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({ data: "test" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "max-age=3600",
          },
        })
      );

      // Make cached request
      await httpCache.fetch(testUrl);
      await httpCache.fetch(testUrl); // Hit

      const stats = await httpCache.getStats();
      expect(stats.entries).toBeGreaterThan(0);
      // Note: hits/misses are tracked by the underlying cache, not HttpCache
    });
  });
});