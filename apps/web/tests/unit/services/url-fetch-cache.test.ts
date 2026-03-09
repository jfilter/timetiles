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
  });

  it("ignores malformed Cache-Control max-age directives", () => {
    process.env.URL_FETCH_CACHE_DIR = "./node_modules/.cache/timetiles-url-fetch-cache-unit";

    const cache = new UrlFetchCache() as unknown as {
      parseMaxAge: (cacheControl?: string) => number | undefined;
    };

    expect(cache.parseMaxAge("public, max-age=60abc")).toBeUndefined();
  });
});
