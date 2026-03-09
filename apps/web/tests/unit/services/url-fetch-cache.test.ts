/**
 * Unit tests for URL fetch cache header parsing.
 *
 * @module
 * @category Tests
 */
import { afterEach, describe, expect, it } from "vitest";

import { UrlFetchCache } from "@/lib/services/cache/url-fetch-cache";

describe("UrlFetchCache", () => {
  afterEach(() => {
    delete process.env.URL_FETCH_CACHE_DIR;
    delete process.env.URL_FETCH_CACHE_TTL;
  });

  it("ignores malformed Cache-Control max-age directives", () => {
    process.env.URL_FETCH_CACHE_DIR = "./node_modules/.cache/timetiles-url-fetch-cache-unit";

    const cache = new UrlFetchCache() as unknown as {
      parseMaxAge: (cacheControl?: string) => number | undefined;
    };

    expect(cache.parseMaxAge("public, max-age=60abc")).toBeUndefined();
  });

  it("falls back to the default TTL when env TTL is malformed", () => {
    process.env.URL_FETCH_CACHE_DIR = "./node_modules/.cache/timetiles-url-fetch-cache-unit";
    process.env.URL_FETCH_CACHE_TTL = "60abc";

    const cache = new UrlFetchCache() as unknown as {
      calculateTTL: (headers: Record<string, string>) => number;
    };

    expect(cache.calculateTTL({})).toBe(3600);
  });
});
