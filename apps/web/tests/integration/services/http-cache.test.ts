/**
 * Integration tests for HTTP cache functionality.
 *
 * These tests verify the HTTP cache works with real HTTP requests
 * to test endpoints without mocking.
 *
 * @module
 * @category Services/Cache/Tests
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { fetchWithRetry } from "@/lib/jobs/handlers/url-fetch-job/fetch-utils";
import { getHttpCache } from "@/lib/services/cache";
import { TestServer } from "@/tests/setup/test-server";

describe.sequential("HTTP Cache Integration", () => {
  const httpCache = getHttpCache();
  let testServer: TestServer;
  let serverUrl: string;

  beforeAll(async () => {
    // Create and start test server
    testServer = new TestServer();
    
    // Setup test endpoints
    let requestCount = 0;
    testServer
      .respondWithJSON("/json", { slideshow: { title: "Sample" } })
      .respond("/status/404", { status: 404, body: "Not Found" })
      .respond("/status/500", { status: 500, body: "Server Error" })
      .route("/uuid", (_req, res) => {
        res.writeHead(200, { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate"
        });
        res.end(JSON.stringify({ uuid: `${Date.now()}-${Math.random()}` }));
      })
      .respond("/post", { status: 200, body: "POST response" })
      .respond("/headers", { 
        headers: { "X-Custom-Header": "test" },
        body: "Headers response" 
      })
      .respond("/delay", { body: "Delayed response", delay: 100 })
      .respond("/etag", {
        headers: { "ETag": '"test-etag"' },
        body: "ETag response"
      })
      .respond("/cache-control", {
        headers: { "Cache-Control": "max-age=2" },
        body: "Cache control response"
      })
      .setDefaultHandler((req, res) => {
        // Handle /get with query parameters
        if (req.url?.startsWith("/get")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ args: req.url?.split('?')[1] || '' }));
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      });
    
    serverUrl = await testServer.start();
  });

  afterAll(async () => {
    // Stop test server
    await testServer.stop();
  });

  beforeEach(async () => {
    // Clear cache before each test
    await httpCache.clear();
  });

  afterEach(async () => {
    // Clean up after tests
    await httpCache.clear();
  });

  describe("Real HTTP requests", () => {
    it("should cache a successful HTTP response", async () => {
      const testUrl = `${serverUrl}/json`;

      // First request - should hit the server
      const result1 = await fetchWithRetry(testUrl, {
        cacheOptions: { useCache: true },
      });
      const data1 = JSON.parse(result1.data.toString());
      expect(data1).toHaveProperty("slideshow");
      expect(result1.cacheStatus).toBe("MISS");

      // Second request - should hit the cache
      const result2 = await fetchWithRetry(testUrl, {
        cacheOptions: { useCache: true },
      });
      const data2 = JSON.parse(result2.data.toString());
      expect(data2).toEqual(data1);
      expect(result2.cacheStatus).toBe("HIT");
    });

    it("should handle different status codes", async () => {
      // Test 404 response - fetchWithRetry will throw on 404
      const notFoundUrl = `${serverUrl}/status/404`;

      await expect(
        fetchWithRetry(notFoundUrl, {
          cacheOptions: { useCache: true },
        })
      ).rejects.toThrow("HTTP 404");
    });

    it("should handle query parameters", async () => {
      const baseUrl = `${serverUrl}/get`;

      // Different query params should be cached separately
      const url1 = `${baseUrl}?foo=bar`;
      const result1 = await fetchWithRetry(url1, {
        cacheOptions: { useCache: true },
      });
      expect(result1.cacheStatus).toBe("MISS");

      const url2 = `${baseUrl}?foo=baz`;
      const result2 = await fetchWithRetry(url2, {
        cacheOptions: { useCache: true },
      });
      expect(result2.cacheStatus).toBe("MISS");

      // Same query should hit cache
      const url3 = `${baseUrl}?foo=bar`; // Same as url1
      console.log(`Fetching ${url3} - expecting HIT (same as ${url1})`);
      const result3 = await fetchWithRetry(url3, {
        cacheOptions: { useCache: true },
      });
      console.log(`Result3 status: ${result3.cacheStatus}`);
      expect(result3.cacheStatus).toBe("HIT");
    });

    it("should bypass cache when requested", async () => {
      const testUrl = `${serverUrl}/uuid`;

      // First request
      const result1 = await fetchWithRetry(testUrl, {
        cacheOptions: { useCache: true },
      });
      const data1 = JSON.parse(result1.data.toString());
      expect(data1).toHaveProperty("uuid");
      expect(result1.cacheStatus).toBe("MISS");

      // Second request with cache bypass
      const result2 = await fetchWithRetry(testUrl, {
        cacheOptions: { useCache: false },
      });
      const data2 = JSON.parse(result2.data.toString());
      expect(data2).toHaveProperty("uuid");
      expect(result2.cacheStatus).toBe("MISS");

      // UUIDs should be different if we truly bypassed cache
      expect(data2.uuid).not.toBe(data1.uuid);
    });

    it("should handle POST requests without caching", async () => {
      const testUrl = `${serverUrl}/post`;

      // POST requests should not be cached
      const result1 = await fetchWithRetry(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cacheOptions: { useCache: true },
      });
      expect(result1.cacheStatus).toBeUndefined();

      // Second POST should also not use cache
      const result2 = await fetchWithRetry(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cacheOptions: { useCache: true },
      });
      expect(result2.cacheStatus).toBeUndefined();
    });

    it("should cache responses independently", async () => {
      const testUrl = `${serverUrl}/headers`;

      // First request
      const result1 = await fetchWithRetry(testUrl, {
        cacheOptions: { useCache: true },
      });
      expect(result1.cacheStatus).toBe("MISS");

      // Same URL should hit cache
      const result2 = await fetchWithRetry(testUrl, {
        cacheOptions: { useCache: true },
      });
      expect(result2.cacheStatus).toBe("HIT");
    });
  });

  describe("Cache management", () => {
    it("should clear cache", async () => {
      // Cache multiple URLs
      await fetchWithRetry(`${serverUrl}/json`, {
        cacheOptions: { useCache: true },
      });
      await fetchWithRetry(`${serverUrl}/uuid`, {
        cacheOptions: { useCache: true },
      });

      // Verify they are cached
      const jsonCached = await fetchWithRetry(`${serverUrl}/json`, {
        cacheOptions: { useCache: true },
      });
      expect(jsonCached.cacheStatus).toBe("HIT");

      // Clear all cache
      const cleared = await httpCache.clear();
      expect(cleared).toBeGreaterThan(0);

      // JSON endpoint should no longer be cached
      const jsonAfterClear = await fetchWithRetry(`${serverUrl}/json`, {
        cacheOptions: { useCache: true },
      });
      expect(jsonAfterClear.cacheStatus).toBe("MISS");
    });

    it("should provide cache statistics", async () => {
      // Make some cached requests
      await fetchWithRetry(`${serverUrl}/json`, {
        cacheOptions: { useCache: true },
      });
      await fetchWithRetry(`${serverUrl}/json`, {
        cacheOptions: { useCache: true },
      }); // Hit

      const stats = await httpCache.getStats();
      expect(stats.entries).toBeGreaterThan(0);
      expect(stats.hits).toBeGreaterThan(0);
    });
  });

  describe("Error handling", () => {
    it("should handle network errors gracefully", async () => {
      const invalidUrl = "https://invalid-domain-that-does-not-exist-12345.com/test";

      // Should throw error, not cache
      await expect(
        fetchWithRetry(invalidUrl, {
          cacheOptions: { useCache: true },
          retryConfig: { maxRetries: 0 },
        })
      ).rejects.toThrow();
    });

    it("should handle timeout scenarios", async () => {
      // Create a test endpoint with very long delay
      testServer.respond("/long-delay", { body: "Very delayed", delay: 10000 });
      const delayUrl = `${serverUrl}/long-delay`;

      // This should timeout with a short timeout setting
      await expect(
        fetchWithRetry(delayUrl, {
          timeout: 500, // 500ms timeout
          cacheOptions: { useCache: true },
          retryConfig: { maxRetries: 0 },
        })
      ).rejects.toThrow();
    });
  });

  describe("Advanced caching features", () => {
    it("should handle ETag and conditional requests", async () => {
      const etagUrl = `${serverUrl}/etag`;

      // First fetch - cache with ETag
      const result1 = await fetchWithRetry(etagUrl, {
        cacheOptions: { useCache: true },
      });
      expect(result1.cacheStatus).toBe("MISS");

      // Force revalidation
      const result2 = await fetchWithRetry(etagUrl, {
        cacheOptions: {
          useCache: true,
          forceRevalidate: true,
        },
      });

      // Should either be REVALIDATED (304) or MISS
      expect(["REVALIDATED", "MISS"]).toContain(result2.cacheStatus);
    });

    it("should respect Cache-Control max-age", async () => {
      const cacheUrl = `${serverUrl}/cache-control`; // 2 second cache

      // First fetch
      const result1 = await fetchWithRetry(cacheUrl, {
        cacheOptions: { useCache: true },
      });
      expect(result1.cacheStatus).toBe("MISS");

      // Immediate second fetch - should be cached
      const result2 = await fetchWithRetry(cacheUrl, {
        cacheOptions: { useCache: true },
      });
      expect(result2.cacheStatus).toBe("HIT");

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Third fetch - cache should be stale
      const result3 = await fetchWithRetry(cacheUrl, {
        cacheOptions: { useCache: true },
      });
      expect(["MISS", "REVALIDATED"]).toContain(result3.cacheStatus);
    });

    it("should be significantly faster for cached responses", async () => {
      const url = `${serverUrl}/json`;

      // First fetch - measure time
      const start1 = Date.now();
      const result1 = await fetchWithRetry(url, {
        cacheOptions: { useCache: true },
      });
      const time1 = Date.now() - start1;
      expect(result1.cacheStatus).toBe("MISS");

      // Second fetch - should be much faster
      const start2 = Date.now();
      const result2 = await fetchWithRetry(url, {
        cacheOptions: { useCache: true },
      });
      const time2 = Date.now() - start2;
      expect(result2.cacheStatus).toBe("HIT");

      // Cached response should be at least 10x faster
      expect(time1 / time2).toBeGreaterThan(10);

      console.log(`Network: ${time1}ms, Cached: ${time2}ms, Speedup: ${Math.round(time1 / time2)}x`);
    });
  });
});
