/**
 * Unit tests for URL fetch cache header parsing.
 *
 * @module
 * @category Tests
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { UrlFetchCache } from "@/lib/services/cache/url-fetch-cache";

describe("UrlFetchCache", () => {
  afterEach(() => {
    delete process.env.URL_FETCH_CACHE_DIR;
    delete process.env.URL_FETCH_CACHE_TTL;
  });

  it("ignores malformed Cache-Control max-age directives", () => {
    process.env.URL_FETCH_CACHE_DIR = "./node_modules/.cache/timetiles-url-fetch-cache-unit";

    const cache = new UrlFetchCache() as unknown as { parseMaxAge: (cacheControl?: string) => number | undefined };

    expect(cache.parseMaxAge("public, max-age=60abc")).toBeUndefined();
  });

  it("falls back to the default TTL when env TTL is malformed", () => {
    process.env.URL_FETCH_CACHE_DIR = "./node_modules/.cache/timetiles-url-fetch-cache-unit";
    process.env.URL_FETCH_CACHE_TTL = "60abc";

    const cache = new UrlFetchCache() as unknown as { calculateTTL: (headers: Record<string, string>) => number };

    expect(cache.calculateTTL({})).toBe(3600);
  });

  it("uses RFC-1123 Expires headers to calculate cache TTL", () => {
    process.env.URL_FETCH_CACHE_DIR = "./node_modules/.cache/timetiles-url-fetch-cache-unit";

    const cache = new UrlFetchCache() as unknown as { calculateTTL: (headers: Record<string, string>) => number };

    expect(cache.calculateTTL({ expires: "Wed, 21 Oct 2030 07:28:00 GMT" })).toBe(2_592_000);
  });

  it("rejects truncated successful responses", async () => {
    process.env.URL_FETCH_CACHE_DIR = "./node_modules/.cache/timetiles-url-fetch-cache-unit";

    const cache = new UrlFetchCache() as unknown as {
      readResponseBody: (response: Response) => Promise<{ data: Buffer; headers: Record<string, string> }>;
    };
    const response = new Response("short", { status: 200, headers: { "Content-Length": "100" } });

    await expect(cache.readResponseBody(response)).rejects.toThrow(/Incomplete response body/);
  });

  it("preserves HTTP error status even when error body is truncated", async () => {
    process.env.URL_FETCH_CACHE_DIR = "./node_modules/.cache/timetiles-url-fetch-cache-unit";

    const cache = new UrlFetchCache() as unknown as {
      readResponseBody: (response: Response) => Promise<{ data: Buffer; headers: Record<string, string> }>;
    };
    const response = new Response("missing", { status: 404, headers: { "Content-Length": "100" } });

    await expect(cache.readResponseBody(response)).resolves.toMatchObject({ data: Buffer.from("missing") });
  });

  it("normalizes query params identically regardless of input order", () => {
    process.env.URL_FETCH_CACHE_DIR = "./node_modules/.cache/timetiles-url-fetch-cache-unit";

    const cache = new UrlFetchCache() as unknown as { normalizeUrl: (url: string) => string };

    expect(cache.normalizeUrl("https://example.com/p?b=2&a=1")).toBe(
      cache.normalizeUrl("https://example.com/p?a=1&b=2")
    );
  });

  it("sorts query params locale-independently so the cache key is stable across environments", () => {
    // Regression: query params were sorted with String.prototype.localeCompare,
    // whose ordering depends on the runtime locale/ICU. The cache key is persisted,
    // so two machines could key the same URL differently. Ordering must not depend
    // on localeCompare.
    process.env.URL_FETCH_CACHE_DIR = "./node_modules/.cache/timetiles-url-fetch-cache-unit";

    const cache = new UrlFetchCache() as unknown as { normalizeUrl: (url: string) => string };
    const url = "https://example.com/p?a=1&b=2";
    const expected = cache.normalizeUrl(url);

    const spy = vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (
      this: string,
      that: string
    ): number {
      if (this < that) return 1;
      if (this > that) return -1;
      return 0;
    });
    try {
      expect(cache.normalizeUrl(url)).toBe(expected);
    } finally {
      spy.mockRestore();
    }
  });
});
