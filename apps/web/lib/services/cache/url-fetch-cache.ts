/**
 * URL fetch cache for scheduled ingests.
 *
 * Caches HTTP responses from external URLs with support for ETags, conditional requests,
 * and Cache-Control directives. Works directly with buffers instead of Response objects
 * to avoid complexity of Response body handling in Node.js.
 *
 * @module
 * @category Services/Cache
 */

import crypto from "node:crypto";

import { getAppConfig } from "@/lib/config/app-config";
import { logger } from "@/lib/logger";
import { safeFetch } from "@/lib/security/safe-fetch";
import { parseDateInput } from "@/lib/utils/date";
import { parseStrictInteger } from "@/lib/utils/event-params";

import { Cache } from "./cache";
import { FileSystemCacheStorage } from "./storage/file-system";
import type { UrlFetchCacheOptions } from "./types";

interface CacheRequestOptions extends RequestInit, Omit<UrlFetchCacheOptions, "useCache"> {
  userId?: string;
  /** Fingerprint of credential-bearing request headers; isolates cached responses per auth identity. */
  authFingerprint?: string;
  maxSize?: number;
}

interface CachedResponse {
  data: Buffer;
  headers: Record<string, string>;
  status: number;
}

interface CachedEntry {
  data: Buffer;
  headers: Record<string, string>;
  status: number;
  metadata: {
    etag?: string;
    lastModified?: string;
    /** Absolute freshness deadline; absent on legacy entries, which must be revalidated. */
    freshUntil?: number;
    contentHash: string;
  };
}

/**
 * Whether a cache key belongs to exactly this user.
 *
 * Keys are `GET:<url>:user:<id>` with an optional `:auth:<fingerprint>` suffix, so the user id
 * is a whole segment at the end, not arbitrary URL text. Matching inside the URL can
 * invalidate another user's entries and force unnecessary external fetches.
 */
export const belongsToUser = (key: string, userId: string): boolean => {
  const segments = key.split(":");
  if (segments.at(-2) === "auth") segments.splice(-2);
  return segments.at(-2) === "user" && segments.at(-1) === userId;
};

export class UrlFetchCache {
  private readonly cache: Cache;
  private readonly defaultTTL: number;
  private readonly maxTTL: number;
  private readonly respectCacheControl: boolean;

  constructor() {
    const { urlFetch } = getAppConfig().cache;
    const cacheDir = urlFetch.dir;
    const maxSize = urlFetch.maxSizeBytes;
    this.defaultTTL = urlFetch.defaultTtlSeconds;
    this.maxTTL = urlFetch.maxTtlSeconds;
    this.respectCacheControl = urlFetch.respectCacheControl;

    const storage = new FileSystemCacheStorage({ cacheDir, maxSize, defaultTTL: this.defaultTTL });

    // Do not reuse legacy entries that conflated paths and reordered query strings.
    this.cache = new Cache({ storage, keyPrefix: "http:v2:" });
  }

  /**
   * Parse Cache-Control header for max-age
   */
  private parseMaxAge(cacheControl?: string): number | undefined {
    if (!cacheControl) return undefined;
    const maxAgeDirective = cacheControl
      .split(",")
      .map((directive) => directive.trim().toLowerCase())
      .find((directive) => directive.startsWith("max-age="));

    if (!maxAgeDirective) {
      return undefined;
    }

    const argument = maxAgeDirective.slice("max-age=".length);
    const value = argument.startsWith('"') && argument.endsWith('"') ? argument.slice(1, -1) : argument;
    const parsedMaxAge = parseStrictInteger(value);
    return parsedMaxAge ?? undefined;
  }

  /**
   * Calculate TTL from response headers
   */
  private calculateTTL(headers: Record<string, string>, respectCacheControl?: boolean): number {
    if (!(respectCacheControl ?? this.respectCacheControl)) {
      return Math.min(this.defaultTTL, this.maxTTL);
    }

    const cacheControl = headers["cache-control"]?.toLowerCase();
    if (cacheControl) {
      // Check for no-store or no-cache
      if (cacheControl.includes("no-store") || cacheControl.includes("no-cache")) {
        return 0; // Don't cache
      }

      // Parse max-age
      const maxAge = this.parseMaxAge(cacheControl);
      if (maxAge !== undefined) {
        // Enforce maximum TTL to prevent indefinite caching
        return Math.min(maxAge, this.maxTTL);
      }
    }

    // Check Expires header
    if (headers["expires"]) {
      const expires = parseDateInput(headers["expires"]);
      if (expires) {
        const ttl = Math.floor((expires.getTime() - Date.now()) / 1000);
        return Math.max(0, Math.min(ttl, this.maxTTL));
      }
    }

    return Math.min(this.defaultTTL, this.maxTTL);
  }

  /**
   * Check if cached entry is stale
   */
  private isStale(entry: CachedEntry): boolean {
    return entry.metadata.freshUntil === undefined || entry.metadata.freshUntil <= Date.now();
  }

  private collectResponseHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return headers;
  }

  private assertCompleteResponseBody(data: Buffer, headers: Record<string, string>, status: number): void {
    if (status < 200 || status >= 300) {
      return;
    }

    if (headers["content-encoding"]) {
      return;
    }

    const expectedLength = parseStrictInteger(headers["content-length"]);
    if (expectedLength == null) {
      return;
    }

    if (data.length !== expectedLength) {
      throw new Error(`Incomplete response body: received ${data.length} bytes, expected ${expectedLength} bytes`);
    }
  }

  private async readResponseBody(
    response: Response,
    maxSize?: number
  ): Promise<{ data: Buffer; headers: Record<string, string> }> {
    const headers = this.collectResponseHeaders(response);
    const data = await this.readBodyWithLimit(response, maxSize);
    this.assertCompleteResponseBody(data, headers, response.status);
    return { data, headers };
  }

  /**
   * Read the response body without buffering an unbounded payload into memory.
   *
   * When a size limit is provided, reject up-front via Content-Length and
   * otherwise stream chunk-by-chunk with a running guard, aborting as soon as
   * the limit is exceeded — a malicious/compromised endpoint must not be able
   * to force a body far larger than the limit into memory before it is checked.
   */
  private async readBodyWithLimit(response: Response, maxSize?: number): Promise<Buffer> {
    if (maxSize == null || maxSize <= 0) {
      return Buffer.from(await response.arrayBuffer());
    }

    const declaredLength = parseStrictInteger(response.headers.get("content-length") ?? undefined);
    if (declaredLength != null && declaredLength > maxSize) {
      try {
        await response.body?.cancel();
      } catch {
        // Releasing the connection must not mask the deterministic size error.
      }
      throw new Error(`File too large: ${declaredLength} bytes (max: ${maxSize})`);
    }

    const body = response.body;
    if (body == null) {
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > maxSize) {
        throw new Error(`File too large: ${data.length} bytes (max: ${maxSize})`);
      }
      return data;
    }

    const reader = body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxSize) {
        try {
          await reader.cancel(`File too large (max: ${maxSize})`);
        } catch {
          // Releasing the connection must not mask the deterministic size error.
        }
        throw new Error(`File too large: ${total} bytes (max: ${maxSize})`);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Helper to fetch without caching
   */
  private async fetchWithoutCache(url: string, options?: RequestInit & { maxSize?: number }): Promise<CachedResponse> {
    const { maxSize, ...fetchOptions } = options ?? {};
    const response = await safeFetch(url, fetchOptions);
    const { data, headers } = await this.readResponseBody(response, maxSize);
    return { data, headers, status: response.status };
  }

  /**
   * Helper to build cache response
   */
  private buildCacheResponse(cached: CachedEntry, cacheStatus: string): CachedResponse {
    return {
      data: Buffer.isBuffer(cached.data) ? cached.data : Buffer.from(cached.data),
      headers: { ...cached.headers, "X-Cache": cacheStatus },
      status: cached.status,
    };
  }

  /**
   * Helper to handle cached entry
   */
  private async handleCachedEntry(
    url: string,
    cacheKey: string,
    cached: CachedEntry,
    options?: CacheRequestOptions
  ): Promise<CachedResponse> {
    const isStale = this.isStale(cached);

    // If not stale and not forced revalidation, return cached
    if (!isStale && !options?.forceRevalidate) {
      logger.debug("HTTP cache hit");
      return this.buildCacheResponse(cached, "HIT");
    }

    // Try revalidation with conditional request
    if (cached.metadata.etag ?? cached.metadata.lastModified) {
      return this.revalidateCachedEntry(url, cacheKey, cached, options);
    }

    // Stale without revalidation headers - fetch fresh
    return this.fetchFresh(url, cacheKey, options);
  }

  /**
   * Helper to revalidate cached entry
   */
  private async revalidateCachedEntry(
    url: string,
    cacheKey: string,
    cached: CachedEntry,
    options?: CacheRequestOptions
  ): Promise<CachedResponse> {
    logger.debug("HTTP cache stale, attempting revalidation");
    const mustRevalidate = cached.headers["cache-control"]
      ?.split(",")
      .some((directive) => directive.trim().toLowerCase() === "must-revalidate");
    const headers = new Headers(options?.headers);

    if (cached.metadata.etag) {
      headers.set("If-None-Match", cached.metadata.etag);
    }
    if (cached.metadata.lastModified) {
      headers.set("If-Modified-Since", cached.metadata.lastModified);
    }

    try {
      const {
        bypassCache: _bypassCache,
        forceRevalidate: _forceRevalidate,
        respectCacheControl,
        maxSize,
        ...fetchOptions
      } = options ?? {};
      const response = await safeFetch(url, { ...fetchOptions, headers });

      // Handle 304 Not Modified
      if (response.status === 304) {
        logger.info("HTTP cache revalidated (304)");
        // Per RFC 9111 §4.3.4, freshen the stored response from the 304's headers:
        // merge updated freshness/validator headers while preserving the original
        // body, status, and contentHash.
        const respHeaders = this.collectResponseHeaders(response);
        const mergedHeaders = { ...cached.headers };
        for (const key of ["cache-control", "expires", "etag", "last-modified"]) {
          if (respHeaders[key] !== undefined) mergedHeaders[key] = respHeaders[key];
        }
        const updatedCached: CachedEntry = {
          ...cached,
          headers: mergedHeaders,
          metadata: {
            ...cached.metadata,
            etag: mergedHeaders["etag"] ?? cached.metadata.etag,
            lastModified: mergedHeaders["last-modified"] ?? cached.metadata.lastModified,
          },
        };
        // Apply the same cacheability policy as a fresh response. A zero TTL
        // must not reach storage, where it means "never expires".
        const revalidatedTtl = this.calculateTTL(updatedCached.headers, respectCacheControl);
        updatedCached.metadata.freshUntil = Date.now() + revalidatedTtl * 1000;
        if (revalidatedTtl === 0 || !this.isCacheable(updatedCached.status, updatedCached.headers)) {
          await this.cache.delete(cacheKey);
        } else {
          await this.cache.set(cacheKey, updatedCached, { ttl: revalidatedTtl });
        }
        return this.buildCacheResponse(updatedCached, "REVALIDATED");
      }

      // safeFetch does not throw on non-2xx. Route these failures through the
      // same fallback policy as network errors without retaining their bodies.
      if (!response.ok) {
        // Release the connection — an unconsumed body keeps the socket reserved.
        try {
          await response.body?.cancel();
        } catch {
          // Cancellation is best-effort and must not mask the HTTP status.
        }
        throw new Error(`HTTP ${response.status}: cache revalidation failed`);
      }

      // Got new content, cache and return it
      return await this.fetchAndCache(cacheKey, response, maxSize, respectCacheControl);
    } catch (error) {
      if (mustRevalidate && this.isStale(cached)) throw error;
      // On error during revalidation, return stale cache
      logger.warn("Revalidation failed, returning stale cache");
      return this.buildCacheResponse(cached, "STALE");
    }
  }

  /**
   * Helper to fetch and cache response
   */
  private async fetchAndCache(
    cacheKey: string,
    response: Response,
    maxSize?: number,
    respectCacheControl?: boolean
  ): Promise<CachedResponse> {
    const { data, headers: respHeaders } = await this.readResponseBody(response, maxSize);

    // Error responses must not replace a previously successful cached body.
    if (response.ok) {
      await this.cacheResponse(cacheKey, data, respHeaders, response.status, respectCacheControl);
    }

    return { data, headers: { ...respHeaders, "X-Cache": "MISS" }, status: response.status };
  }

  /**
   * Helper to fetch fresh content
   */
  private async fetchFresh(url: string, cacheKey: string, options?: CacheRequestOptions): Promise<CachedResponse> {
    const {
      bypassCache: _bypassCache,
      forceRevalidate: _forceRevalidate,
      respectCacheControl,
      maxSize,
      ...fetchOptions
    } = options ?? {};
    const response = await safeFetch(url, fetchOptions);

    return this.fetchAndCache(cacheKey, response, maxSize, respectCacheControl);
  }

  /**
   * Fetch with caching support including ETags and conditional requests.
   *
   * When `timeout` is provided, an AbortController is wired into the
   * underlying `fetch` calls so that the request aborts after the
   * specified number of milliseconds.
   */
  async fetch(url: string, options?: CacheRequestOptions & { timeout?: number }): Promise<CachedResponse> {
    const { timeout, ...rest } = options ?? {};

    // Wrap the real work so we can apply a timeout uniformly
    if (timeout && timeout > 0) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Combine timeout signal with any caller-provided signal
      const signals = [controller.signal, rest.signal].filter(Boolean) as AbortSignal[];
      const optionsWithSignal: typeof rest = { ...rest, signal: AbortSignal.any(signals) };

      try {
        return await this.fetchInner(url, optionsWithSignal);
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError" &&
          controller.signal.aborted &&
          optionsWithSignal.signal?.reason === controller.signal.reason
        ) {
          throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return this.fetchInner(url, rest);
  }

  /**
   * Core fetch implementation (timeout handling is in the public `fetch` method).
   */
  private async fetchInner(url: string, options?: CacheRequestOptions): Promise<CachedResponse> {
    const method = options?.method ?? "GET";
    const userId = options?.userId;
    const cacheKey = this.getCacheKey(url, method, userId, options?.authFingerprint);

    // Only cache GET requests
    if (method !== "GET") {
      logger.debug("Bypassing cache for non-GET request", { method });
      const {
        bypassCache: _bypassCache,
        forceRevalidate: _forceRevalidate,
        respectCacheControl: _respectCacheControl,
        ...fetchOptions
      } = options ?? {};
      return this.fetchWithoutCache(url, fetchOptions);
    }

    // Check cache first (unless bypassed)
    if (!options?.bypassCache) {
      // Expiration ends freshness, not the usefulness of validators. Cleanup and
      // size-based eviction still bound retention of these expired entries.
      const cached = await this.cache.get<CachedEntry>(cacheKey, { allowExpired: true });
      if (cached) {
        return this.handleCachedEntry(url, cacheKey, cached, options);
      }
    }

    logger.debug("HTTP cache miss");
    return this.fetchFresh(url, cacheKey, options);
  }

  /**
   * Cache a response with metadata
   */
  private async cacheResponse(
    cacheKey: string,
    data: Buffer,
    headers: Record<string, string>,
    status: number,
    respectCacheControl?: boolean
  ): Promise<void> {
    const ttl = this.calculateTTL(headers, respectCacheControl);

    // A successful replacement supersedes old content even when it cannot be cached.
    if (ttl === 0 || !this.isCacheable(status, headers)) {
      await this.cache.delete(cacheKey);
      logger.debug("Response not cacheable");
      return;
    }

    const entry: CachedEntry = {
      data,
      headers,
      status,
      metadata: {
        etag: headers["etag"],
        lastModified: headers["last-modified"],
        freshUntil: Date.now() + ttl * 1000,
        contentHash: crypto.createHash("sha256").update(data).digest("hex"),
      },
    };

    await this.cache.set(cacheKey, entry, { ttl });
    logger.info("HTTP response cached", {
      size: data.length,
      ttl,
      hasEtag: !!entry.metadata.etag,
      hasLastModified: !!entry.metadata.lastModified,
    });
  }

  /**
   * Normalize URL for consistent cache keys
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);

      // URL already normalizes host casing and default ports. Only fragments are
      // omitted from HTTP requests; path, query order and encoding remain significant.
      parsed.hash = "";

      return parsed.toString();
    } catch {
      // If URL parsing fails, return original URL
      logger.warn("Failed to normalize URL, using original");
      return url;
    }
  }

  private getCacheKey(url: string, method: string, userId?: string, authFingerprint?: string): string {
    const normalizedUrl = this.normalizeUrl(url);
    const userSegment = userId ? `:user:${userId}` : ":anonymous";
    // Auth identity is part of the key: without it, two callers fetching the same
    // URL with DIFFERENT credentials (e.g. two scheduled ingests owned by
    // different users) would share one cache entry and leak each other's
    // authenticated responses. No-auth requests share a single bucket (correct).
    const authSegment = authFingerprint ? `:auth:${authFingerprint}` : "";
    return `${method}:${normalizedUrl}${userSegment}${authSegment}`;
  }

  private isCacheable(status: number, headers: Record<string, string>): boolean {
    const cacheControl = headers["cache-control"]?.toLowerCase();
    if (cacheControl) {
      if (cacheControl.includes("no-store")) return false;
      if (cacheControl.includes("private")) return false;
    }
    return status >= 200 && status < 300;
  }

  async clear(): Promise<number> {
    return this.cache.clear();
  }

  async cleanup(): Promise<number> {
    return this.cache.cleanup();
  }

  async getStats() {
    return this.cache.getStats();
  }

  /**
   * Invalidate all cached entries for a specific user
   */
  async invalidateForUser(userId: string): Promise<void> {
    const allKeys = await this.cache.keys();
    const userKeys = allKeys.filter((k) => belongsToUser(k, userId));

    for (const key of userKeys) {
      await this.cache.delete(key);
    }

    logger.info("Invalidated user cache", { userId, count: userKeys.length });
  }
}

// Singleton instance
let instance: UrlFetchCache | null = null;

export const getUrlFetchCache = (): UrlFetchCache => {
  instance ??= new UrlFetchCache();
  return instance;
};

/** Drop the singleton so a subsequent caller uses the current application configuration. */
export const resetUrlFetchCache = (): void => {
  instance = null;
};
