/**
 * Integration tests for URL fetch cache functionality.
 *
 * These tests verify the URL fetch cache works with real HTTP requests
 * to test endpoints without mocking. Tests URL normalization, caching behavior,
 * ETags, Cache-Control headers, and conditional requests.
 *
 * @module
 * @category Services/Cache/Tests
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildAuthHeaders } from "@/lib/ingest/url-fetch/auth";
import { fetchWithRetry } from "@/lib/ingest/url-fetch/fetch-utils";
import { type Cache, getUrlFetchCache } from "@/lib/services/cache";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import { createIntegrationTestEnvironment } from "@/tests/setup/integration/environment";

describe.sequential("HTTP Cache Integration", () => {
  const urlFetchCache = getUrlFetchCache();
  let testServer: any;
  let serverUrl: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    // Create integration test environment
    const testEnv = await createIntegrationTestEnvironment();

    // Create test server with routes before starting
    const { TestServer } = await import("@/tests/setup/integration/http-server");
    testServer = new TestServer();

    // Setup test endpoints
    testServer
      .respondWithJSON("/json", { slideshow: { title: "Sample" } })
      .respondWithJSON("/json/", { slideshow: { title: "Different endpoint" } })
      .respond("/status/404", { status: 404, body: "Not Found" })
      .respond("/status/500", { status: 500, body: "Server Error" })
      .route("/uuid", (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        });
        res.end(JSON.stringify({ uuid: `${Date.now()}-${Math.random()}` }));
      })
      .respond("/post", { status: 200, body: "POST response" })
      .respond("/headers", { headers: { "X-Custom-Header": "test" }, body: "Headers response" })
      .respond("/delay", { body: "Delayed response", delay: 100 })
      .respond("/cache-control", { headers: { "Cache-Control": "max-age=2" }, body: "Cache control response" })
      .respond("/expired", { headers: { Expires: "Thu, 01 Jan 1970 00:00:00 GMT" }, body: "Expired response" })
      .setDefaultHandler((req: IncomingMessage, res: ServerResponse) => {
        // Handle /get with query parameters
        if (req.url?.startsWith("/get")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ args: req.url?.split("?")[1] ?? "" }));
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      });

    serverUrl = await testServer.start();

    // Extend cleanup to stop server
    const originalCleanup = testEnv.cleanup;
    cleanup = async () => {
      await testServer.stop();
      await originalCleanup();
    };
  });

  afterAll(async () => {
    await cleanup();
  }); // Default 10s timeout - should be plenty with direct pool.end()

  beforeEach(async () => {
    // Clear cache before each test
    await urlFetchCache.clear();
  });

  afterEach(async () => {
    // Clean up after tests
    await urlFetchCache.clear();
  });

  describe("Real HTTP requests", () => {
    it("does not retain responses whose Expires date is already past", async () => {
      const url = `${serverUrl}/expired`;
      const first = await fetchWithRetry(url, { cacheOptions: { useCache: true } });
      const second = await fetchWithRetry(url, { cacheOptions: { useCache: true } });

      expect(first.data.toString()).toBe("Expired response");
      expect(second.data.toString()).toBe("Expired response");
      expect(first.cacheStatus).toBe("MISS");
      expect(second.cacheStatus).toBe("MISS");
    });

    it("should cache a successful HTTP response", async () => {
      const testUrl = `${serverUrl}/json`;

      // First request - should hit the server
      const result1 = await fetchWithRetry(testUrl, { cacheOptions: { useCache: true } });
      const data1 = JSON.parse(result1.data.toString());
      expect(data1).toHaveProperty("slideshow");
      expect(result1.cacheStatus).toBe("MISS");

      // Second request - should hit the cache
      const result2 = await fetchWithRetry(testUrl, { cacheOptions: { useCache: true } });
      const data2 = JSON.parse(result2.data.toString());
      expect(data2).toEqual(data1);
      expect(result2.cacheStatus).toBe("HIT");
    });

    it("should handle different status codes", async () => {
      // Test 404 response - fetchWithRetry will throw on 404
      const notFoundUrl = `${serverUrl}/status/404`;

      await expect(fetchWithRetry(notFoundUrl, { cacheOptions: { useCache: true } })).rejects.toThrow("HTTP 404");
    });

    it("should handle query parameters", async () => {
      const baseUrl = `${serverUrl}/get`;

      // Different query params should be cached separately
      const url1 = `${baseUrl}?foo=bar`;
      const result1 = await fetchWithRetry(url1, { cacheOptions: { useCache: true } });
      expect(result1.cacheStatus).toBe("MISS");

      const url2 = `${baseUrl}?foo=baz`;
      const result2 = await fetchWithRetry(url2, { cacheOptions: { useCache: true } });
      expect(result2.cacheStatus).toBe("MISS");

      // Same query should hit cache
      const url3 = `${baseUrl}?foo=bar`; // Same as url1
      console.log(`Fetching ${url3} - expecting HIT (same as ${url1})`);
      const result3 = await fetchWithRetry(url3, { cacheOptions: { useCache: true } });
      console.log(`Result3 status: ${result3.cacheStatus}`);
      expect(result3.cacheStatus).toBe("HIT");
    });

    it("should bypass cache when requested", async () => {
      const testUrl = `${serverUrl}/uuid`;

      // First request
      const result1 = await fetchWithRetry(testUrl, { cacheOptions: { useCache: true } });
      const data1 = JSON.parse(result1.data.toString());
      expect(data1).toHaveProperty("uuid");
      expect(result1.cacheStatus).toBe("MISS");

      // Second request with cache bypass
      const result2 = await fetchWithRetry(testUrl, { cacheOptions: { useCache: false } });
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
      const result1 = await fetchWithRetry(testUrl, { cacheOptions: { useCache: true } });
      expect(result1.cacheStatus).toBe("MISS");

      // Same URL should hit cache
      const result2 = await fetchWithRetry(testUrl, { cacheOptions: { useCache: true } });
      expect(result2.cacheStatus).toBe("HIT");
    });
  });

  describe("Cache management", () => {
    it("should clear cache", async () => {
      // Cache multiple URLs
      await fetchWithRetry(`${serverUrl}/json`, { cacheOptions: { useCache: true } });
      await fetchWithRetry(`${serverUrl}/uuid`, { cacheOptions: { useCache: true } });

      // Verify they are cached
      const jsonCached = await fetchWithRetry(`${serverUrl}/json`, { cacheOptions: { useCache: true } });
      expect(jsonCached.cacheStatus).toBe("HIT");

      // Clear all cache
      const cleared = await urlFetchCache.clear();
      expect(cleared).toBeGreaterThan(0);

      // JSON endpoint should no longer be cached
      const jsonAfterClear = await fetchWithRetry(`${serverUrl}/json`, { cacheOptions: { useCache: true } });
      expect(jsonAfterClear.cacheStatus).toBe("MISS");
    });

    it("should provide cache statistics", async () => {
      // Make some cached requests
      await fetchWithRetry(`${serverUrl}/json`, { cacheOptions: { useCache: true } });
      await fetchWithRetry(`${serverUrl}/json`, { cacheOptions: { useCache: true } }); // Hit

      const stats = await urlFetchCache.getStats();
      expect(stats.entries).toBeGreaterThan(0);
      expect(stats.hits).toBeGreaterThan(0);
    });
  });

  describe("Error handling", () => {
    it("should handle network errors gracefully", async () => {
      const invalidUrl = "https://invalid-domain-that-does-not-exist-12345.com/test";

      // Should throw error, not cache
      await expect(
        fetchWithRetry(invalidUrl, { cacheOptions: { useCache: true }, retryConfig: { maxRetries: 0 } })
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
      ).rejects.toThrow("Request timeout after 500ms");
    });

    it("preserves a caller abort when the request timeout has not elapsed", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        urlFetchCache.fetch(`${serverUrl}/delay`, { signal: controller.signal, timeout: 60000, bypassCache: true })
      ).rejects.toMatchObject({ name: "AbortError" });
    });

    it("preserves a null caller abort reason", async () => {
      await expect(
        urlFetchCache.fetch(`${serverUrl}/delay`, {
          signal: AbortSignal.abort(null),
          timeout: 60000,
          bypassCache: true,
        })
      ).rejects.toBeNull();
    });

    it("should not retry terminal HTTP errors", async () => {
      let requestCount = 0;
      testServer.route("/status/404-counted", (_req: IncomingMessage, res: ServerResponse) => {
        requestCount++;
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      });

      await expect(
        fetchWithRetry(`${serverUrl}/status/404-counted`, {
          cacheOptions: { useCache: false },
          retryConfig: { maxRetries: 3 },
        })
      ).rejects.toThrow("HTTP 404");

      expect(requestCount).toBe(1);
    });

    it("should retry transient HTTP errors", async () => {
      let requestCount = 0;
      testServer.route("/status/flaky-500", (_req: IncomingMessage, res: ServerResponse) => {
        requestCount++;
        if (requestCount === 1) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Server Error");
          return;
        }

        res.writeHead(200, { "Content-Type": "text/csv" });
        res.end("id,name\n1,test");
      });

      const result = await fetchWithRetry(`${serverUrl}/status/flaky-500`, {
        cacheOptions: { useCache: false },
        retryConfig: { maxRetries: 1 },
      });

      expect(requestCount).toBe(2);
      expect(result.attempts).toBe(2);
      expect(result.data.toString("utf-8")).toContain("id,name");
    });

    it("enforces a smaller size limit on a fresh cache hit without retrying", async () => {
      let requests = 0;
      testServer.route("/cached-size-limit", (_req: IncomingMessage, res: ServerResponse) => {
        requests++;
        res.writeHead(200, { "Content-Type": "text/csv", "Cache-Control": "max-age=60" });
        res.end("id,name\n1,test");
      });
      const url = `${serverUrl}/cached-size-limit`;
      await fetchWithRetry(url);

      await expect(fetchWithRetry(url, { maxSize: 1, retryConfig: { maxRetries: 3 } })).rejects.toThrow(
        "File too large"
      );
      expect(requests).toBe(1);
    });

    it("should not retry deterministic file-size failures", async () => {
      let requestCount = 0;
      testServer.route("/too-large-counted", (_req: IncomingMessage, res: ServerResponse) => {
        requestCount++;
        res.writeHead(200, { "Content-Type": "text/csv" });
        res.end("too large");
      });

      await expect(
        fetchWithRetry(`${serverUrl}/too-large-counted`, {
          maxSize: 1,
          cacheOptions: { useCache: false },
          retryConfig: { maxRetries: 3 },
        })
      ).rejects.toThrow("File too large");

      expect(requestCount).toBe(1);
    });
  });

  describe("Advanced caching features", () => {
    it.each([
      ["must-revalidate", false],
      ["MUST-REVALIDATE", false],
      ["must-revalidate", true],
      ["", false],
    ] as const)("respects the revalidation failure policy (%s, disconnected: %s)", async (directive, disconnected) => {
      let requests = 0;
      testServer.route("/mandatory-revalidation", (_req: IncomingMessage, res: ServerResponse) => {
        requests++;
        if (requests > 1 && disconnected) {
          res.destroy();
          return;
        }
        res.writeHead(requests === 1 ? 200 : 503, { ETag: '"mandatory"', "Cache-Control": `max-age=1, ${directive}` });
        res.end(requests === 1 ? "Old response" : "Unavailable");
      });

      const url = `${serverUrl}/mandatory-revalidation`;
      expect((await fetchWithRetry(url)).data.toString()).toBe("Old response");
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = fetchWithRetry(url, { retryConfig: { maxRetries: 0 } });
      if (directive) {
        await expect(result).rejects.toThrow();
      } else {
        const fallback = await result;
        expect(fallback.cacheStatus).toBe("STALE");
        expect(fallback.data.toString()).toBe("Old response");
      }
      expect(requests).toBe(2);
    });

    it.each(["etag", "last-modified"] as const)(
      "automatically revalidates an expired response with %s",
      async (header) => {
        const conditionalHeaders: Array<string | undefined> = [];
        const validator = header === "etag" ? '"automatic-revalidation"' : "Wed, 01 Jan 2025 00:00:00 GMT";
        const requestHeader = header === "etag" ? "if-none-match" : "if-modified-since";
        testServer.route("/automatic-revalidation", (req: IncomingMessage, res: ServerResponse) => {
          const conditional = req.headers[requestHeader];
          conditionalHeaders.push(conditional);
          res.writeHead(conditional === validator ? 304 : 200, { [header]: validator, "Cache-Control": "max-age=1" });
          res.end(conditional === validator ? undefined : "Unchanged response");
        });

        const url = `${serverUrl}/automatic-revalidation`;
        expect((await fetchWithRetry(url)).cacheStatus).toBe("MISS");
        await new Promise((resolve) => setTimeout(resolve, 1100));

        const result = await fetchWithRetry(url);
        expect(result.data.toString()).toBe("Unchanged response");
        expect(conditionalHeaders).toEqual([undefined, validator]);
        expect(result.cacheStatus).toBe("REVALIDATED");
        expect((await fetchWithRetry(url)).cacheStatus).toBe("HIT");
      }
    );

    it("should handle ETag and conditional requests", async () => {
      const etagUrl = `${serverUrl}/etag`;
      const etag = '"test-etag"';
      const validators: Array<string | undefined> = [];
      testServer.route("/etag", (req: IncomingMessage, res: ServerResponse) => {
        const validator = req.headers["if-none-match"];
        validators.push(validator);
        const unchanged = validator === etag;
        res.writeHead(unchanged ? 304 : 200, {
          ETag: etag,
          "Content-Type": "text/plain",
          "Cache-Control": "max-age=60",
        });
        res.end(unchanged ? undefined : "ETag response");
      });

      // First fetch - cache with ETag
      const result1 = await fetchWithRetry(etagUrl, { cacheOptions: { useCache: true } });
      expect(result1.cacheStatus).toBe("MISS");

      // Force revalidation
      const result2 = await fetchWithRetry(etagUrl, { cacheOptions: { useCache: true, forceRevalidate: true } });

      expect(result2.cacheStatus).toBe("REVALIDATED");
      expect(result2.data.toString()).toBe("ETag response");

      // The bodyless 304 must leave a reusable cached response behind.
      const result3 = await fetchWithRetry(etagUrl, { cacheOptions: { useCache: true } });
      expect(result3.cacheStatus).toBe("HIT");
      expect(result3.data).toEqual(result1.data);
      expect(validators).toEqual([undefined, etag]);
    });

    it.each([undefined, "0", "60"])("uses only the new response age after a 304 (Age: %s)", async (age) => {
      const etag = '"age-revalidation"';
      let requests = 0;
      testServer.route("/age-revalidation", (req: IncomingMessage, res: ServerResponse) => {
        requests++;
        const unchanged = req.headers["if-none-match"] === etag;
        res.sendDate = false;
        res.writeHead(unchanged ? 304 : 200, {
          ETag: etag,
          "Cache-Control": unchanged ? "max-age=60" : "max-age=3600",
          ...(!unchanged ? { Age: "120", Date: new Date(Date.now() - 120_000).toUTCString() } : {}),
          ...(unchanged && age !== undefined ? { Age: age } : {}),
        });
        res.end(unchanged ? undefined : "Age response");
      });
      const url = `${serverUrl}/age-revalidation`;
      expect((await urlFetchCache.fetch(url)).headers["X-Cache"]).toBe("MISS");
      const revalidated = await urlFetchCache.fetch(url, { forceRevalidate: true });
      expect(revalidated.headers["X-Cache"]).toBe("REVALIDATED");
      expect(revalidated.headers["age"]).toBe(age);
      expect(revalidated.headers["date"]).toBeUndefined();
      expect(revalidated.data.toString()).toBe("Age response");
      expect((await urlFetchCache.fetch(url)).headers["X-Cache"]).toBe(age === "60" ? "MISS" : "HIT");
      expect(requests).toBe(age === "60" ? 3 : 2);
    });

    it("preserves the stored success status after revalidation", async () => {
      const etag = '"status-preservation"';
      testServer.route("/revalidated-status", (req: IncomingMessage, res: ServerResponse) => {
        const unchanged = req.headers["if-none-match"] === etag;
        res.writeHead(unchanged ? 304 : 203, { ETag: etag, "Cache-Control": "max-age=60" });
        res.end(unchanged ? undefined : "Unchanged response");
      });
      const url = `${serverUrl}/revalidated-status`;
      expect((await urlFetchCache.fetch(url)).status).toBe(203);

      const revalidated = await urlFetchCache.fetch(url, { forceRevalidate: true });
      expect(revalidated.headers["X-Cache"]).toBe("REVALIDATED");
      expect(revalidated.status).toBe(203);
      expect(revalidated.data.toString()).toBe("Unchanged response");
      expect((await urlFetchCache.fetch(url)).status).toBe(203);
    });

    it("keeps range responses separate from complete cached responses", async () => {
      let requests = 0;
      testServer.route("/range-response", (req: IncomingMessage, res: ServerResponse) => {
        requests++;
        const partial = req.headers.range !== undefined;
        res.writeHead(partial ? 206 : 200, {
          "Cache-Control": "max-age=60",
          ...(partial ? { "Content-Range": "bytes 0-2/6" } : {}),
        });
        res.end(partial ? "abc" : "abcdef");
      });
      const url = `${serverUrl}/range-response`;
      const rangeOptions = { headers: { Range: "bytes=0-2" } };
      expect((await urlFetchCache.fetch(url, rangeOptions)).data.toString()).toBe("abc");
      expect((await urlFetchCache.fetch(url)).data.toString()).toBe("abcdef");
      expect((await urlFetchCache.fetch(url, rangeOptions)).data.toString()).toBe("abc");
      expect((await urlFetchCache.fetch(url)).headers["X-Cache"]).toBe("HIT");
      expect(requests).toBe(3);
    });

    it("does not cache unsolicited partial responses", async () => {
      let requests = 0;
      testServer.route("/unsolicited-partial", (_req: IncomingMessage, res: ServerResponse) => {
        requests++;
        res.writeHead(206, { "Cache-Control": "max-age=60", "Content-Range": "bytes 0-2/6" });
        res.end("abc");
      });
      const url = `${serverUrl}/unsolicited-partial`;
      await urlFetchCache.fetch(url);
      await urlFetchCache.fetch(url);
      expect(requests).toBe(2);
    });

    it("matches only the request headers selected by Vary", async () => {
      let requests = 0;
      testServer.route("/vary-language", (req: IncomingMessage, res: ServerResponse) => {
        requests++;
        res.writeHead(200, { Vary: "Accept-Language", "Cache-Control": "max-age=60" });
        res.end(req.headers["accept-language"]);
      });
      const url = `${serverUrl}/vary-language`;
      await urlFetchCache.fetch(url, { headers: { "Accept-Language": "en" } });
      const hit = await urlFetchCache.fetch(url, { headers: { "accept-language": "en", "X-Unrelated": "changed" } });
      expect(hit.headers["X-Cache"]).toBe("HIT");
      const changed = await urlFetchCache.fetch(url, { headers: { "Accept-Language": "de" } });
      expect(changed.data.toString()).toBe("de");
      expect(changed.headers["X-Cache"]).toBe("MISS");
      expect(requests).toBe(2);
    });

    it("isolates authenticated and anonymous responses without Vary", async () => {
      const firstToken = TEST_CREDENTIALS.bearer.token;
      const secondToken = TEST_CREDENTIALS.bearer.alternateToken;
      let requests = 0;
      testServer.route("/auth-cache-isolation", (req: IncomingMessage, res: ServerResponse) => {
        requests++;
        const identities = new Map([
          [`Bearer ${firstToken}`, "first"],
          [`Bearer ${secondToken}`, "second"],
        ]);
        res.writeHead(200, { "Content-Type": "text/csv", "Cache-Control": "public, max-age=60" });
        res.end(`identity\n${identities.get(req.headers.authorization ?? "") ?? "anonymous"}`);
      });
      const url = `${serverUrl}/auth-cache-isolation`;
      const callers = [
        { expected: "first", authHeaders: await buildAuthHeaders({ type: "bearer", bearerToken: firstToken }) },
        { expected: "second", authHeaders: await buildAuthHeaders({ type: "bearer", bearerToken: secondToken }) },
        { expected: "anonymous", authHeaders: await buildAuthHeaders({ type: "none" }) },
      ];
      for (const cacheStatus of ["MISS", "HIT"]) {
        for (const { expected, authHeaders } of callers) {
          const result = await fetchWithRetry(url, { authHeaders, retryConfig: { maxRetries: 0 } });
          expect(result.data.toString()).toBe(`identity\n${expected}`);
          expect(result.cacheStatus).toBe(cacheStatus);
        }
      }
      expect(requests).toBe(3);
    });

    it("distinguishes absent and empty Vary request headers", async () => {
      testServer.route("/vary-empty", (req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { Vary: "X-Variant", "Cache-Control": "max-age=60" });
        res.end(req.headers["x-variant"] === undefined ? "absent" : "present");
      });
      const url = `${serverUrl}/vary-empty`;
      expect((await urlFetchCache.fetch(url)).data.toString()).toBe("absent");
      const changed = await urlFetchCache.fetch(url, { headers: { "X-Variant": "" } });
      expect(changed.data.toString()).toBe("present");
    });

    it("refetches legacy Vary entries without a request fingerprint", async () => {
      let requests = 0;
      testServer.route("/vary-legacy", (_req: IncomingMessage, res: ServerResponse) => {
        requests++;
        res.writeHead(200, { Vary: "Accept-Language", "Cache-Control": "max-age=60" });
        res.end("response");
      });
      const url = `${serverUrl}/vary-legacy`;
      await urlFetchCache.fetch(url);

      // Recreate the old on-disk metadata using the real cache storage.
      const internals = urlFetchCache as unknown as {
        cache: Cache;
        getCacheKey: (url: string, method: string) => string;
      };
      const key = internals.getCacheKey(url, "GET");
      const entry = await internals.cache.get<{ metadata: { varyFingerprint?: string } }>(key);
      expect(entry?.metadata.varyFingerprint).toMatch(/^[a-f0-9]{64}$/);
      delete entry!.metadata.varyFingerprint;
      await internals.cache.set(key, entry, { ttl: 60 });

      expect((await urlFetchCache.fetch(url)).headers["X-Cache"]).toBe("MISS");
      expect(requests).toBe(2);
    });

    it("does not reuse Vary star responses even when cache-control is ignored", async () => {
      let requests = 0;
      testServer.route("/vary-star", (_req: IncomingMessage, res: ServerResponse) => {
        requests++;
        res.writeHead(200, { Vary: "*", "Cache-Control": "max-age=60" });
        res.end("response");
      });
      const url = `${serverUrl}/vary-star`;
      await urlFetchCache.fetch(url, { respectCacheControl: false });
      await urlFetchCache.fetch(url, { respectCacheControl: false });
      expect(requests).toBe(2);
    });

    it.each(["Accept-Language", "*"])("honors Vary changed to %s by a 304", async (vary) => {
      let requests = 0;
      testServer.route("/vary-revalidated", (req: IncomingMessage, res: ServerResponse) => {
        requests++;
        const unchanged = req.headers["if-none-match"] === '"vary-response"';
        res.writeHead(unchanged ? 304 : 200, {
          ETag: '"vary-response"',
          "Cache-Control": "max-age=60",
          ...(unchanged ? { Vary: vary } : {}),
        });
        res.end(unchanged ? undefined : req.headers["accept-language"]);
      });
      const url = `${serverUrl}/vary-revalidated`;
      const headers = { "Accept-Language": "en" };
      await urlFetchCache.fetch(url, { headers });
      expect((await urlFetchCache.fetch(url, { headers, forceRevalidate: true })).headers["X-Cache"]).toBe(
        "REVALIDATED"
      );
      const language = vary === "*" ? "en" : "de";
      const result = await urlFetchCache.fetch(url, { headers: { "Accept-Language": language } });
      expect(result.headers["X-Cache"]).toBe("MISS");
      expect(result.data.toString()).toBe(language);
      expect(requests).toBe(3);
    });

    it.each(["private", "no-store", "no-cache", "Private", "No-Store", "No-Cache"])(
      "discards cached content when a 304 changes policy to %s",
      async (policy) => {
        const url = `${serverUrl}/etag-policy`;
        const etag = '"policy-etag"';
        const validators: Array<string | undefined> = [];
        testServer.route("/etag-policy", (req: IncomingMessage, res: ServerResponse) => {
          const validator = req.headers["if-none-match"];
          validators.push(validator);
          const unchanged = validator === etag;
          res.writeHead(unchanged ? 304 : 200, {
            ETag: etag,
            "Content-Type": "text/plain",
            "Cache-Control": unchanged ? policy : "max-age=60",
          });
          res.end(unchanged ? undefined : "Policy response");
        });

        await fetchWithRetry(url);
        const revalidated = await fetchWithRetry(url, { cacheOptions: { forceRevalidate: true } });
        expect(revalidated.cacheStatus).toBe("REVALIDATED");
        expect(revalidated.data.toString()).toBe("Policy response");

        const next = await fetchWithRetry(url);
        expect(next.cacheStatus).toBe("MISS");
        expect(validators).toEqual([undefined, etag, undefined]);
      }
    );

    it.each([
      ["private", false],
      ["no-store", false],
      ["no-cache", false],
      ["private", true],
      ["no-store", true],
      ["no-cache", true],
      ["Private", false],
      ["No-Store", false],
      ["No-Cache", false],
      ["Private", true],
      ["No-Store", true],
      ["No-Cache", true],
    ] as const)("removes superseded content after a 200 with %s (bypass: %s)", async (policy, bypassCache) => {
      const url = `${serverUrl}/replacement-policy`;
      let requests = 0;
      testServer.route("/replacement-policy", (_req: IncomingMessage, res: ServerResponse) => {
        requests++;
        res.writeHead(200, {
          ETag: '"replacement-etag"',
          "Content-Type": "text/plain",
          "Cache-Control": requests === 1 ? "max-age=60" : policy,
        });
        res.end(`Version ${requests}`);
      });

      expect((await fetchWithRetry(url)).data.toString()).toBe("Version 1");
      const replacement = await fetchWithRetry(url, { cacheOptions: { bypassCache, forceRevalidate: true } });
      expect(replacement.data.toString()).toBe("Version 2");
      expect(replacement.cacheStatus).toBe("MISS");

      const next = await fetchWithRetry(url);
      expect(next.cacheStatus).toBe("MISS");
      expect(next.data.toString()).toBe("Version 3");
      expect(requests).toBe(3);
    });

    it("should respect Cache-Control max-age", async () => {
      const cacheUrl = `${serverUrl}/cache-control`; // 2 second cache

      // First fetch
      const result1 = await fetchWithRetry(cacheUrl, { cacheOptions: { useCache: true } });
      expect(result1.cacheStatus).toBe("MISS");

      // Immediate second fetch - should be cached
      const result2 = await fetchWithRetry(cacheUrl, { cacheOptions: { useCache: true } });
      expect(result2.cacheStatus).toBe("HIT");

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Third fetch - cache should be stale
      const result3 = await fetchWithRetry(cacheUrl, { cacheOptions: { useCache: true } });
      expect(["MISS", "REVALIDATED"]).toContain(result3.cacheStatus);
    });
  });

  describe("URL Normalization", () => {
    it("should normalize URLs with different casing", async () => {
      const url1 = `${serverUrl.toUpperCase()}/json`;
      const url2 = `${serverUrl.toLowerCase()}/json`;

      // Fetch with uppercase hostname
      const result1 = await fetchWithRetry(url1, { cacheOptions: { useCache: true } });
      expect(result1.cacheStatus).toBe("MISS");

      // Fetch with lowercase hostname - should hit cache
      const result2 = await fetchWithRetry(url2, { cacheOptions: { useCache: true } });
      expect(result2.cacheStatus).toBe("HIT");
    });

    it("keeps distinct trailing-slash endpoints separate", async () => {
      const url1 = `${serverUrl}/json`;
      const url2 = `${serverUrl}/json/`;

      const result1 = await fetchWithRetry(url1, { cacheOptions: { useCache: true } });
      expect(result1.cacheStatus).toBe("MISS");

      const result2 = await fetchWithRetry(url2, { cacheOptions: { useCache: true } });
      expect(result2.cacheStatus).toBe("MISS");
      expect(result2.data).not.toEqual(result1.data);
    });

    it("preserves query parameter order in cache identity", async () => {
      const url1 = `${serverUrl}/get?b=2&a=1`;
      const url2 = `${serverUrl}/get?a=1&b=2`;

      const result1 = await fetchWithRetry(url1, { cacheOptions: { useCache: true } });
      expect(result1.cacheStatus).toBe("MISS");

      const result2 = await fetchWithRetry(url2, { cacheOptions: { useCache: true } });
      expect(result2.cacheStatus).toBe("MISS");
      expect(result2.data).not.toEqual(result1.data);
    });

    it("should ignore URL fragments", async () => {
      const url1 = `${serverUrl}/json`;
      const url2 = `${serverUrl}/json#section`;

      const result1 = await fetchWithRetry(url1, { cacheOptions: { useCache: true } });
      expect(result1.cacheStatus).toBe("MISS");

      // URL with fragment should hit same cache entry
      const result2 = await fetchWithRetry(url2, { cacheOptions: { useCache: true } });
      expect(result2.cacheStatus).toBe("HIT");
    });
  });
});
