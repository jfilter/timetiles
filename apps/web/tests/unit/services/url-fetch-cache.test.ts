/**
 * Unit tests for URL fetch cache header parsing.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Cache } from "@/lib/services/cache/cache";
import { UrlFetchCache } from "@/lib/services/cache/url-fetch-cache";
import { TEST_SECRETS } from "@/tests/constants/test-credentials";
import { mockLogger } from "@/tests/mocks/services/logger";

describe("UrlFetchCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hashes URL credentials while preserving URL identity and user isolation", () => {
    const cache = new UrlFetchCache() as unknown as {
      getCacheKey: (url: string, method: string, userId?: string, authFingerprint?: string) => string;
    };
    const url = `https://example.com/feed?token=${TEST_SECRETS.payloadSecret}`;
    const key = cache.getCacheKey(url, "GET", "7", "auth-fingerprint");

    expect(key).toMatch(/^GET:[a-f0-9]{64}:user:7:auth:auth-fingerprint$/);
    expect(key).not.toContain(TEST_SECRETS.payloadSecret);
    expect(cache.getCacheKey(`${url}#fragment`, "GET", "7", "auth-fingerprint")).toBe(key);
    expect(cache.getCacheKey(`${url}&page=2`, "GET", "7", "auth-fingerprint")).not.toBe(key);
    expect(cache.getCacheKey(url, "GET", "8", "auth-fingerprint")).not.toBe(key);
    expect(cache.getCacheKey(url, "GET", "7", "other-fingerprint")).not.toBe(key);
  });

  it("uses the stored freshness deadline and treats legacy entries as stale", () => {
    const cache = new UrlFetchCache() as unknown as {
      isStale: (entry: { metadata: { freshUntil?: number } }) => boolean;
    };
    expect(cache.isStale({ metadata: {} })).toBe(true);
    expect(cache.isStale({ metadata: { freshUntil: Date.now() - 1 } })).toBe(true);
    expect(cache.isStale({ metadata: { freshUntil: Date.now() + 60_000 } })).toBe(false);
  });

  it("does not log invalid URL input or the parser's error object", () => {
    const cache = new UrlFetchCache() as unknown as { normalizeUrl: (url: string) => string };
    const url = `invalid-${TEST_SECRETS.payloadSecret}`;

    expect(cache.normalizeUrl(url)).toBe(url);
    expect(mockLogger.logger.warn).toHaveBeenCalledWith("Failed to normalize URL, using original");
  });

  it.each(["public, max-age=60", "no-store"])("does not log cache keys (%s)", async (cacheControl) => {
    vi.spyOn(Cache.prototype, "set").mockResolvedValue();
    vi.spyOn(Cache.prototype, "delete").mockResolvedValue(true);
    const cache = new UrlFetchCache() as unknown as {
      cacheResponse: (key: string, data: Buffer, headers: Record<string, string>, status: number) => Promise<void>;
    };
    const key = `GET:https://example.com/${TEST_SECRETS.payloadSecret}?key=${TEST_SECRETS.payloadSecret}:anonymous`;

    await cache.cacheResponse(key, Buffer.from("data"), { "cache-control": cacheControl }, 200);

    expect(JSON.stringify(mockLogger.logger.info.mock.calls)).not.toContain(TEST_SECRETS.payloadSecret);
    expect(JSON.stringify(mockLogger.logger.debug.mock.calls)).not.toContain(TEST_SECRETS.payloadSecret);
    if (cacheControl === "no-store") {
      expect(mockLogger.logger.debug).toHaveBeenCalledWith("Response not cacheable");
    } else {
      expect(mockLogger.logger.info).toHaveBeenCalledWith("HTTP response cached", {
        size: 4,
        ttl: 60,
        hasEtag: false,
        hasLastModified: false,
      });
    }
  });

  it.each(["No-Store", "No-Cache", "Private"])("does not retain responses with %s", async (directive) => {
    const set = vi.spyOn(Cache.prototype, "set").mockResolvedValue();
    vi.spyOn(Cache.prototype, "delete").mockResolvedValue(true);
    const cache = new UrlFetchCache() as unknown as {
      cacheResponse: (key: string, data: Buffer, headers: Record<string, string>, status: number) => Promise<void>;
    };
    await cache.cacheResponse("case-test", Buffer.from("data"), { "cache-control": directive }, 200);
    expect(set).not.toHaveBeenCalled();
  });

  it("accepts mixed-case max-age directives", () => {
    const cache = new UrlFetchCache() as unknown as { parseMaxAge: (value: string) => number | undefined };
    expect(cache.parseMaxAge("public, MAX-AGE=60")).toBe(60);
  });

  it("ignores malformed Cache-Control max-age directives", () => {
    const cache = new UrlFetchCache() as unknown as { parseMaxAge: (cacheControl?: string) => number | undefined };

    expect(cache.parseMaxAge("public, max-age=60abc")).toBeUndefined();
  });

  it.each([0, 60])("honors quoted max-age=%s instead of the default TTL", (seconds) => {
    const cache = new UrlFetchCache() as unknown as { calculateTTL: (headers: Record<string, string>) => number };
    expect(cache.calculateTTL({ "cache-control": `max-age="${seconds}"` })).toBe(seconds);
  });

  it("uses the default TTL when freshness headers are absent", () => {
    const cache = new UrlFetchCache() as unknown as { calculateTTL: (headers: Record<string, string>) => number };

    expect(cache.calculateTTL({})).toBe(3600);
  });

  it.each([
    ["45", 15],
    ["60", 0],
    ["120", 0],
    ["9007199254740992", 0],
    ["9".repeat(400), 0],
  ])("subtracts upstream Age=%s from max-age", (age, remaining) => {
    const cache = new UrlFetchCache() as unknown as { calculateTTL: (headers: Record<string, string>) => number };
    expect(cache.calculateTTL({ "cache-control": "max-age=60", age })).toBe(remaining);
  });

  it("accounts for server dates, request duration, and Expires using the same response age", () => {
    const now = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const cache = new UrlFetchCache() as unknown as {
      calculateTTL: (headers: Record<string, string>, respect?: boolean, requestTime?: number) => number;
    };
    const date = new Date(now - 40_000).toUTCString();
    expect(cache.calculateTTL({ "cache-control": "max-age=60", date, age: "10" })).toBe(20);
    expect(cache.calculateTTL({ "cache-control": "max-age=60", age: "45" }, true, now - 5000)).toBe(10);
    expect(cache.calculateTTL({ date, expires: new Date(now + 20_000).toUTCString(), age: "50" })).toBe(10);
    expect(cache.calculateTTL({ age: "45" }, false, now - 5000)).toBe(3600);
  });

  it("uses RFC-1123 Expires headers to calculate cache TTL", () => {
    const cache = new UrlFetchCache() as unknown as { calculateTTL: (headers: Record<string, string>) => number };

    expect(cache.calculateTTL({ expires: "Wed, 21 Oct 2030 07:28:00 GMT" })).toBe(2_592_000);
  });

  it("does not assign a fresh default TTL to an already expired response", () => {
    const cache = new UrlFetchCache() as unknown as { calculateTTL: (headers: Record<string, string>) => number };

    expect(cache.calculateTTL({ expires: "Thu, 01 Jan 1970 00:00:00 GMT" })).toBe(0);
  });

  it("rejects truncated successful responses", async () => {
    const cache = new UrlFetchCache() as unknown as {
      readResponseBody: (response: Response) => Promise<{ data: Buffer; headers: Record<string, string> }>;
    };
    const response = new Response("short", { status: 200, headers: { "Content-Length": "100" } });

    await expect(cache.readResponseBody(response)).rejects.toThrow(/Incomplete response body/);
  });

  it("preserves HTTP error status even when error body is truncated", async () => {
    const cache = new UrlFetchCache() as unknown as {
      readResponseBody: (response: Response) => Promise<{ data: Buffer; headers: Record<string, string> }>;
    };
    const response = new Response("missing", { status: 404, headers: { "Content-Length": "100" } });

    await expect(cache.readResponseBody(response)).resolves.toMatchObject({ data: Buffer.from("missing") });
  });

  type ReadResponseBody = {
    readResponseBody: (
      response: Response,
      maxSize?: number
    ) => Promise<{ data: Buffer; headers: Record<string, string> }>;
  };

  it("rejects an oversized declared Content-Length before reading the body", async () => {
    const cache = new UrlFetchCache() as unknown as ReadResponseBody;
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      status: 200,
      headers: { "Content-Length": "100000" },
    });

    await expect(cache.readResponseBody(response, 100)).rejects.toThrow(/File too large/);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("aborts a streamed body once it exceeds the size limit", async () => {
    const cache = new UrlFetchCache() as unknown as ReadResponseBody;
    // No Content-Length header: the cap must be enforced during streaming.
    const body = new Uint8Array(5000);
    const response = new Response(body, { status: 200 });

    await expect(cache.readResponseBody(response, 1000)).rejects.toThrow(/File too large/);
  });

  it("returns the body unchanged when it is within the size limit", async () => {
    const cache = new UrlFetchCache() as unknown as ReadResponseBody;
    const response = new Response("hello world", { status: 200 });

    await expect(cache.readResponseBody(response, 1000)).resolves.toMatchObject({ data: Buffer.from("hello world") });
  });

  it.each([false, true])("preserves the size error when cancellation fails (declared length: %s)", async (declared) => {
    const cache = new UrlFetchCache() as unknown as ReadResponseBody;
    const cancel = vi.fn(() => {
      throw new Error("Cancellation failed");
    });
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(new Uint8Array(5000));
      },
      cancel,
    });
    const response = new Response(body, { headers: declared ? { "Content-Length": "5000" } : {} });

    await expect(cache.readResponseBody(response, 1000)).rejects.toThrow("File too large: 5000 bytes (max: 1000)");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("keeps different query parameter orders distinct", () => {
    const cache = new UrlFetchCache() as unknown as { normalizeUrl: (url: string) => string };

    expect(cache.normalizeUrl("https://example.com/p?b=2&a=1")).not.toBe(
      cache.normalizeUrl("https://example.com/p?a=1&b=2")
    );
  });

  it.each([
    "https://example.com/p/",
    "https://example.com/p?b=2&a=1",
    "https://example.com/p?q=a%20b",
    "https://example.com/p?q=a+b",
    "https://example.com/p?a=2&a=1",
  ])("preserves request identity for %s", (url) => {
    const cache = new UrlFetchCache() as unknown as { normalizeUrl: (url: string) => string };
    expect(cache.normalizeUrl(url)).toBe(url);
  });
});
