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
import { compareCodeUnits } from "@/lib/utils/compare";
import { parseDateInput } from "@/lib/utils/date";
import { parseStrictInteger } from "@/lib/utils/event-params";

import { Cache } from "./cache";
import { FileSystemCacheStorage } from "./storage/file-system";

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
    expires?: Date;
    maxAge?: number;
    fetchedAt: Date;
    contentHash: string;
  };
}

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

    this.cache = new Cache({ storage, keyPrefix: "http:" });
  }

  /**
   * Parse Cache-Control header for max-age
   */
  private parseMaxAge(cacheControl?: string): number | undefined {
    if (!cacheControl) return undefined;
    const maxAgeDirective = cacheControl
      .split(",")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("max-age="));

    if (!maxAgeDirective) {
      return undefined;
    }

    const parsedMaxAge = parseStrictInteger(maxAgeDirective.slice("max-age=".length));
    return parsedMaxAge ?? undefined;
  }

  /**
   * Calculate TTL from response headers
   */
  private calculateTTL(headers: Record<string, string>, respectCacheControl?: boolean): number {
    if (!(respectCacheControl ?? this.respectCacheControl)) {
      return Math.min(this.defaultTTL, this.maxTTL);
    }

    const cacheControl = headers["cache-control"];
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
        if (ttl > 0) return Math.min(ttl, this.maxTTL);
      }
    }

    return Math.min(this.defaultTTL, this.maxTTL);
  }

  /**
   * Check if cached entry is stale
   */
  private isStale(entry: CachedEntry, respectCacheControl?: boolean): boolean {
    if (!(respectCacheControl ?? this.respectCacheControl)) return false;

    const metadata = entry.metadata;

    // Check explicit expiration
    if (metadata.expires && metadata.expires < new Date()) {
      return true;
    }

    // Check max-age
    if (metadata.maxAge !== undefined) {
      const age = (Date.now() - metadata.fetchedAt.getTime()) / 1000;
      if (age > metadata.maxAge) {
        return true;
      }
    }

    return false;
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
        await reader.cancel(`File too large (max: ${maxSize})`);
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
   * Helper to normalize cached data
   */
  private normalizeCachedEntry(cached: CachedEntry): CachedEntry {
    // Ensure dates are Date objects (deserialization might return strings)
    if (cached.metadata.fetchedAt && typeof cached.metadata.fetchedAt === "string") {
      cached.metadata.fetchedAt = parseDateInput(cached.metadata.fetchedAt) ?? new Date();
    }
    if (cached.metadata.expires && typeof cached.metadata.expires === "string") {
      cached.metadata.expires = parseDateInput(cached.metadata.expires) ?? undefined;
    }
    return cached;
  }

  /**
   * Helper to build cache response
   */
  private buildCacheResponse(cached: CachedEntry, cacheStatus: string): CachedResponse {
    let status = cached.status;
    if (cacheStatus === "REVALIDATED") {
      status = 200;
    }

    return {
      data: Buffer.isBuffer(cached.data) ? cached.data : Buffer.from(cached.data),
      headers: { ...cached.headers, "X-Cache": cacheStatus },
      status,
    };
  }

  /**
   * Helper to handle cached entry
   */
  private async handleCachedEntry(
    url: string,
    cacheKey: string,
    cached: CachedEntry,
    options?: RequestInit & {
      bypassCache?: boolean;
      forceRevalidate?: boolean;
      respectCacheControl?: boolean;
      maxSize?: number;
    }
  ): Promise<CachedResponse> {
    const normalizedCached = this.normalizeCachedEntry(cached);
    const isStale = this.isStale(normalizedCached, options?.respectCacheControl);

    // If not stale and not forced revalidation, return cached
    if (!isStale && !options?.forceRevalidate) {
      logger.debug("HTTP cache hit", { url });
      return this.buildCacheResponse(normalizedCached, "HIT");
    }

    // Try revalidation with conditional request
    if (normalizedCached.metadata.etag ?? normalizedCached.metadata.lastModified) {
      return this.revalidateCachedEntry(url, cacheKey, normalizedCached, options);
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
    options?: RequestInit & {
      bypassCache?: boolean;
      forceRevalidate?: boolean;
      respectCacheControl?: boolean;
      maxSize?: number;
    }
  ): Promise<CachedResponse> {
    logger.debug("HTTP cache stale, attempting revalidation", { url });
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
        logger.info("HTTP cache revalidated (304)", { url });
        // Per RFC 7234 §4.3.4, freshen the stored response from the 304's headers:
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
            expires: mergedHeaders["expires"]
              ? (parseDateInput(mergedHeaders["expires"]) ?? undefined)
              : cached.metadata.expires,
            maxAge: this.parseMaxAge(mergedHeaders["cache-control"]) ?? cached.metadata.maxAge,
            fetchedAt: new Date(),
          },
        };
        await this.cache.set(cacheKey, updatedCached, {
          ttl: this.calculateTTL(updatedCached.headers, respectCacheControl),
        });
        return this.buildCacheResponse(updatedCached, "REVALIDATED");
      }

      // An error status on revalidation must never overwrite the valid cached
      // body — treat it like a failed revalidation and serve the stale entry
      // (safeFetch does not throw on non-2xx, so this needs an explicit check).
      if (!response.ok) {
        logger.warn("Revalidation returned error status, returning stale cache", { url, status: response.status });
        // Release the connection — an unconsumed body keeps the socket reserved.
        try {
          await response.body?.cancel();
        } catch {
          // Ignore: cancellation is best-effort; the stale entry is returned regardless.
        }
        return this.buildCacheResponse(cached, "STALE");
      }

      // Got new content, cache and return it
      return await this.fetchAndCache(url, cacheKey, response, maxSize, respectCacheControl);
    } catch (error) {
      // On error during revalidation, return stale cache
      logger.warn("Revalidation failed, returning stale cache", { url, error });
      return this.buildCacheResponse(cached, "STALE");
    }
  }

  /**
   * Helper to fetch and cache response
   */
  private async fetchAndCache(
    _url: string,
    cacheKey: string,
    response: Response,
    maxSize?: number,
    respectCacheControl?: boolean
  ): Promise<CachedResponse> {
    const { data, headers: respHeaders } = await this.readResponseBody(response, maxSize);

    // Same guard as fetchFresh: only cache OK, cacheable responses (the
    // revalidation path was previously caching error bodies unconditionally).
    if (response.ok && this.isCacheable(response.status, respHeaders)) {
      await this.cacheResponse(cacheKey, data, respHeaders, response.status, respectCacheControl);
    }

    return { data, headers: { ...respHeaders, "X-Cache": "MISS" }, status: response.status };
  }

  /**
   * Helper to fetch fresh content
   */
  private async fetchFresh(
    url: string,
    cacheKey: string,
    options?: RequestInit & {
      bypassCache?: boolean;
      forceRevalidate?: boolean;
      respectCacheControl?: boolean;
      maxSize?: number;
    }
  ): Promise<CachedResponse> {
    const {
      bypassCache: _bypassCache,
      forceRevalidate: _forceRevalidate,
      respectCacheControl,
      maxSize,
      ...fetchOptions
    } = options ?? {};
    const response = await safeFetch(url, fetchOptions);

    const { data, headers } = await this.readResponseBody(response, maxSize);

    // Cache successful GET responses
    if (response.ok && this.isCacheable(response.status, headers)) {
      await this.cacheResponse(cacheKey, data, headers, response.status, respectCacheControl);
    }

    return { data, headers: { ...headers, "X-Cache": "MISS" }, status: response.status };
  }

  /**
   * Fetch with caching support including ETags and conditional requests.
   *
   * When `timeout` is provided, an AbortController is wired into the
   * underlying `fetch` calls so that the request aborts after the
   * specified number of milliseconds.
   */
  async fetch(
    url: string,
    options?: RequestInit & {
      bypassCache?: boolean;
      forceRevalidate?: boolean;
      /** Per-request override of the global cache.urlFetch.respectCacheControl config. */
      respectCacheControl?: boolean;
      userId?: string;
      /** Fingerprint of credential-bearing request headers; isolates cached responses per auth identity. */
      authFingerprint?: string;
      timeout?: number;
      maxSize?: number;
    }
  ): Promise<CachedResponse> {
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
        if ((error as Error).name === "AbortError") {
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
  private async fetchInner(
    url: string,
    options?: RequestInit & {
      bypassCache?: boolean;
      forceRevalidate?: boolean;
      respectCacheControl?: boolean;
      userId?: string;
      authFingerprint?: string;
      maxSize?: number;
    }
  ): Promise<CachedResponse> {
    const method = options?.method ?? "GET";
    const userId = options?.userId;
    const cacheKey = this.getCacheKey(url, method, userId, options?.authFingerprint);

    // Only cache GET requests
    if (method !== "GET") {
      logger.debug("Bypassing cache for non-GET request", { url, method });
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
      const cached = await this.cache.get<CachedEntry>(cacheKey);
      if (cached) {
        return this.handleCachedEntry(url, cacheKey, cached, options);
      }
    }

    logger.debug("HTTP cache miss", { url });
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

    // Don't cache if TTL is 0
    if (ttl === 0) {
      logger.debug("Response not cacheable", { cacheKey });
      return;
    }

    const now = new Date();
    const entry: CachedEntry = {
      data,
      headers,
      status,
      metadata: {
        etag: headers["etag"],
        lastModified: headers["last-modified"],
        expires: headers["expires"] ? (parseDateInput(headers["expires"]) ?? undefined) : undefined,
        maxAge: this.parseMaxAge(headers["cache-control"]),
        fetchedAt: now,
        contentHash: crypto.createHash("sha256").update(data).digest("hex"),
      },
    };

    await this.cache.set(cacheKey, entry, { ttl });
    logger.info("HTTP response cached", {
      url: cacheKey.replace(/^GET:/, ""),
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

      // Lowercase hostname
      parsed.hostname = parsed.hostname.toLowerCase();

      // Remove default ports
      if (
        (parsed.protocol === "http:" && parsed.port === "80") ||
        (parsed.protocol === "https:" && parsed.port === "443")
      ) {
        parsed.port = "";
      }

      // Remove trailing slash from pathname (but keep "/" for root)
      if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }

      // Sort query parameters by UTF-16 code unit (NOT localeCompare) so the
      // cache key is identical across machines regardless of runtime locale/ICU.
      if (parsed.search) {
        const params = new URLSearchParams(parsed.search);
        const sortedParams = new URLSearchParams(
          Array.from(params.entries()).sort(([a], [b]) => compareCodeUnits(a, b))
        );
        parsed.search = sortedParams.toString();
      }

      // Remove fragment (hash)
      parsed.hash = "";

      return parsed.toString();
    } catch (error) {
      // If URL parsing fails, return original URL
      logger.warn("Failed to normalize URL, using original", { url, error });
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
    const cacheControl = headers["cache-control"];
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
    // Get all cache keys and filter for this user
    const allKeys = await this.cache.keys();
    const userKeys = allKeys.filter((k) => k.includes(`:user:${userId}`));

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
