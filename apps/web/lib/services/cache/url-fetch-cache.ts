/**
 * URL fetch cache for scheduled imports.
 *
 * Caches HTTP responses from external URLs with support for ETags, conditional requests,
 * and Cache-Control directives. Works directly with buffers instead of Response objects
 * to avoid complexity of Response body handling in Node.js.
 *
 * @module
 * @category Services/Cache
 */

import crypto from "node:crypto";

import { logger } from "@/lib/logger";

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
    // eslint-disable-next-line sonarjs/publicly-writable-directories
    const cacheDir = process.env.URL_FETCH_CACHE_DIR ?? "/tmp/url-fetch-cache";
    const maxSize = parseInt(process.env.URL_FETCH_CACHE_MAX_SIZE ?? "104857600", 10);
    this.defaultTTL = parseInt(process.env.URL_FETCH_CACHE_TTL ?? "3600", 10);
    this.maxTTL = parseInt(process.env.URL_FETCH_CACHE_MAX_TTL ?? "2592000", 10); // 30 days default
    this.respectCacheControl = process.env.URL_FETCH_CACHE_RESPECT_CACHE_CONTROL !== "false";

    const storage = new FileSystemCacheStorage({
      cacheDir,
      maxSize,
      defaultTTL: this.defaultTTL,
    });

    this.cache = new Cache({
      storage,
      keyPrefix: "http:",
    });
  }

  /**
   * Parse Cache-Control header for max-age
   */
  private parseMaxAge(cacheControl?: string): number | undefined {
    if (!cacheControl) return undefined;
    const match = /max-age=(\d+)/.exec(cacheControl);
    return match?.[1] ? parseInt(match[1], 10) : undefined;
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
      const expires = new Date(headers["expires"]);
      const ttl = Math.floor((expires.getTime() - Date.now()) / 1000);
      if (ttl > 0) return Math.min(ttl, this.maxTTL);
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

  /**
   * Helper to fetch without caching
   */
  private async fetchWithoutCache(url: string, options?: RequestInit): Promise<CachedResponse> {
    const response = await fetch(url, options);
    const data = Buffer.from(await response.arrayBuffer());
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return { data, headers, status: response.status };
  }

  /**
   * Helper to normalize cached data
   */
  private normalizeCachedEntry(cached: CachedEntry): CachedEntry {
    // Ensure dates are Date objects (deserialization might return strings)
    if (cached.metadata.fetchedAt && typeof cached.metadata.fetchedAt === "string") {
      cached.metadata.fetchedAt = new Date(cached.metadata.fetchedAt);
    }
    if (cached.metadata.expires && typeof cached.metadata.expires === "string") {
      cached.metadata.expires = new Date(cached.metadata.expires);
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
      const { bypassCache, forceRevalidate, ...fetchOptions } = options ?? {};
      const response = await fetch(url, { ...fetchOptions, headers });

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
    const data = Buffer.from(await response.arrayBuffer());
    const respHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      respHeaders[key.toLowerCase()] = value;
    });

    await this.cacheResponse(cacheKey, data, respHeaders, response.status);

    return {
      data,
      headers: { ...respHeaders, "X-Cache": "MISS" },
      status: response.status,
    };
  }

  /**
   * Helper to fetch fresh content
   */
  private async fetchFresh(
    url: string,
    cacheKey: string,
    options?: RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean }
  ): Promise<CachedResponse> {
    const { bypassCache, forceRevalidate, ...fetchOptions } = options ?? {};
    const response = await fetch(url, fetchOptions);

    const data = Buffer.from(await response.arrayBuffer());
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Cache successful GET responses
    if (response.ok && this.isCacheable(response.status, headers)) {
      await this.cacheResponse(cacheKey, data, headers, response.status);
    }

    return {
      data,
      headers: { ...headers, "X-Cache": "MISS" },
      status: response.status,
    };
  }

  /**
   * Fetch with caching support including ETags and conditional requests
   */
  async fetch(
    url: string,
    options?: RequestInit & { bypassCache?: boolean; forceRevalidate?: boolean; userId?: string }
  ): Promise<CachedResponse> {
    const method = options?.method ?? "GET";
    const userId = options?.userId;
    const cacheKey = this.getCacheKey(url, method, userId);

    // Only cache GET requests
    if (method !== "GET") {
      logger.debug("Bypassing cache for non-GET request", { url, method });
      const { bypassCache, forceRevalidate, ...fetchOptions } = options ?? {};
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
        expires: headers["expires"] ? new Date(headers["expires"]) : undefined,
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

    logger.info("Invalidated user cache", {
      userId,
      count: userKeys.length,
    });
  }
}

// Singleton instance
let instance: UrlFetchCache | null = null;

export const getUrlFetchCache = (): UrlFetchCache => {
  instance ??= new UrlFetchCache();
  return instance;
};
