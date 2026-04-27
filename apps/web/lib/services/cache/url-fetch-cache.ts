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
  private calculateTTL(headers: Record<string, string>): number {
    if (!this.respectCacheControl) {
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
  private isStale(entry: CachedEntry): boolean {
    if (!this.respectCacheControl) return false;

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

  private async readResponseBody(response: Response): Promise<{ data: Buffer; headers: Record<string, string> }> {
    const headers = this.collectResponseHeaders(response);
    const data = Buffer.from(await response.arrayBuffer());
    this.assertCompleteResponseBody(data, headers, response.status);
    return { data, headers };
  }

  /**
   * Helper to fetch without caching
   */
  private async fetchWithoutCache(url: string, options?: RequestInit): Promise<CachedResponse> {
    const response = await safeFetch(url, options);
    const { data, headers } = await this.readResponseBody(response);
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
    options?: RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean }
  ): Promise<CachedResponse> {
    const normalizedCached = this.normalizeCachedEntry(cached);
    const isStale = this.isStale(normalizedCached);

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
    options?: RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean }
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
      const { bypassCache: _bypassCache, forceRevalidate: _forceRevalidate, ...fetchOptions } = options ?? {};
      const response = await safeFetch(url, { ...fetchOptions, headers });

      // Handle 304 Not Modified
      if (response.status === 304) {
        logger.info("HTTP cache revalidated (304)", { url });
        // Update metadata and re-cache
        const updatedCached = { ...cached, metadata: { ...cached.metadata, fetchedAt: new Date() } };
        await this.cache.set(cacheKey, updatedCached, { ttl: this.calculateTTL(updatedCached.headers) });
        return this.buildCacheResponse(updatedCached, "REVALIDATED");
      }

      // Got new content, cache and return it
      return await this.fetchAndCache(url, cacheKey, response);
    } catch (error) {
      // On error during revalidation, return stale cache
      logger.warn("Revalidation failed, returning stale cache", { url, error });
      return this.buildCacheResponse(cached, "STALE");
    }
  }

  /**
   * Helper to fetch and cache response
   */
  private async fetchAndCache(_url: string, cacheKey: string, response: Response): Promise<CachedResponse> {
    const { data, headers: respHeaders } = await this.readResponseBody(response);

    await this.cacheResponse(cacheKey, data, respHeaders, response.status);

    return { data, headers: { ...respHeaders, "X-Cache": "MISS" }, status: response.status };
  }

  /**
   * Helper to fetch fresh content
   */
  private async fetchFresh(
    url: string,
    cacheKey: string,
    options?: RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean }
  ): Promise<CachedResponse> {
    const { bypassCache: _bypassCache, forceRevalidate: _forceRevalidate, ...fetchOptions } = options ?? {};
    const response = await safeFetch(url, fetchOptions);

    const { data, headers } = await this.readResponseBody(response);

    // Cache successful GET responses
    if (response.ok && this.isCacheable(response.status, headers)) {
      await this.cacheResponse(cacheKey, data, headers, response.status);
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
    options?: RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean; userId?: string; timeout?: number }
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
    options?: RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean; userId?: string }
  ): Promise<CachedResponse> {
    const method = options?.method ?? "GET";
    const userId = options?.userId;
    const cacheKey = this.getCacheKey(url, method, userId);

    // Only cache GET requests
    if (method !== "GET") {
      logger.debug("Bypassing cache for non-GET request", { url, method });
      const { bypassCache: _bypassCache, forceRevalidate: _forceRevalidate, ...fetchOptions } = options ?? {};
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
    status: number
  ): Promise<void> {
    const ttl = this.calculateTTL(headers);

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

      // Sort query parameters alphabetically
      if (parsed.search) {
        const params = new URLSearchParams(parsed.search);
        const sortedParams = new URLSearchParams(Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)));
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

  private getCacheKey(url: string, method: string, userId?: string): string {
    const normalizedUrl = this.normalizeUrl(url);
    const userSegment = userId ? `:user:${userId}` : ":anonymous";
    return `${method}:${normalizedUrl}${userSegment}`;
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
