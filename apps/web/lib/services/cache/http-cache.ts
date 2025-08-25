/**
 * HTTP-specific cache wrapper for caching HTTP responses.
 *
 * This module provides specialized caching for HTTP responses with support for
 * ETags, Last-Modified headers, conditional requests, and Cache-Control directives.
 *
 * @module
 * @category Services/Cache
 */

import crypto from "crypto";

import { logger } from "@/lib/logger";

import { Cache } from "./cache";
import { CacheManager } from "./manager";
import type { HttpCacheEntry, HttpCacheMetadata, HttpCacheOptions, CacheSetOptions } from "./types";

/**
 * HTTP cache service for caching external HTTP responses
 */
export class HttpCache {
  private cache: Cache;
  private respectCacheControl: boolean;
  private defaultTTL: number;

  constructor(cache?: Cache, respectCacheControl: boolean = true) {
    this.cache = cache || CacheManager.getCache("http");
    this.respectCacheControl = respectCacheControl;
    this.defaultTTL = parseInt(process.env.HTTP_CACHE_DEFAULT_TTL || "3600", 10);
  }

  /**
   * Generate cache key for HTTP request
   */
  private generateCacheKey(url: string, method: string = "GET"): string {
    return `${method}:${url}`;
  }

  /**
   * Parse Cache-Control header for max-age
   */
  private parseMaxAge(cacheControl?: string): number | undefined {
    if (!cacheControl) return undefined;
    const match = cacheControl.match(/max-age=(\d+)/);
    return match && match[1] ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Calculate TTL from response headers
   */
  private calculateTTL(headers: Record<string, string>): number {
    if (!this.respectCacheControl) {
      return this.defaultTTL;
    }

    const cacheControl = headers["cache-control"];
    if (cacheControl) {
      // Check for no-store
      if (cacheControl.includes("no-store")) {
        return 0; // Don't cache
      }

      // Check for no-cache
      if (cacheControl.includes("no-cache")) {
        return 0; // Don't cache
      }

      // Parse max-age
      const maxAge = this.parseMaxAge(cacheControl);
      if (maxAge !== undefined) {
        return maxAge;
      }
    }

    // Check Expires header
    if (headers["expires"]) {
      const expires = new Date(headers["expires"]);
      const ttl = Math.floor((expires.getTime() - Date.now()) / 1000);
      if (ttl > 0) return ttl;
    }

    return this.defaultTTL;
  }

  /**
   * Check if cached entry is stale
   */
  private isStale(entry: HttpCacheEntry): boolean {
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
   * Get cached response
   */
  async get(url: string, method: string = "GET"): Promise<HttpCacheEntry | null> {
    const key = this.generateCacheKey(url, method);
    const httpEntry = await this.cache.get<HttpCacheEntry>(key);

    if (!httpEntry) {
      logger.debug("HTTP cache miss", { url, method });
      return null;
    }

    // Check if stale
    if (this.isStale(httpEntry)) {
      logger.debug("HTTP cache entry is stale", { url, method });
      // Don't delete - it can be revalidated
      return httpEntry; // Return stale entry for revalidation
    }

    logger.debug("HTTP cache hit", { url, method });
    return httpEntry;
  }

  /**
   * Store response in cache
   */
  async set(
    url: string,
    data: Buffer,
    headers: Record<string, string>,
    statusCode: number = 200,
    method: string = "GET"
  ): Promise<void> {
    const ttl = this.calculateTTL(headers);

    // Don't cache if TTL is 0
    if (ttl === 0) {
      logger.debug("HTTP response not cacheable", { url, method });
      return;
    }

    const key = this.generateCacheKey(url, method);
    const now = new Date();

    const entry: HttpCacheEntry = {
      url,
      method,
      data,
      headers,
      statusCode,
      metadata: {
        etag: headers["etag"],
        lastModified: headers["last-modified"],
        expires: headers["expires"] ? new Date(headers["expires"]) : undefined,
        maxAge: this.parseMaxAge(headers["cache-control"]),
        fetchedAt: now,
        contentHash: crypto.createHash("sha256").update(data).digest("hex"),
        size: data.length,
      },
    };

    const cacheOptions: CacheSetOptions = {
      ttl,
      tags: ["http", method.toLowerCase()],
      metadata: {
        url,
        method,
        statusCode,
      },
    };

    await this.cache.set(key, entry, cacheOptions);
    logger.info("HTTP response cached", {
      url,
      method,
      ttl,
      size: data.length,
    });
  }

  /**
   * Get conditional request headers for revalidation
   */
  async getConditionalHeaders(url: string, method: string = "GET"): Promise<Record<string, string>> {
    const entry = await this.get(url, method);
    if (!entry) return {};

    const headers: Record<string, string> = {};

    if (entry.metadata.etag) {
      headers["If-None-Match"] = entry.metadata.etag;
    }

    if (entry.metadata.lastModified) {
      headers["If-Modified-Since"] = entry.metadata.lastModified;
    }

    return headers;
  }

  /**
   * Handle 304 Not Modified response
   */
  async handleNotModified(url: string, method: string = "GET"): Promise<HttpCacheEntry | null> {
    const entry = await this.get(url, method);
    if (!entry) return null;

    // Update the fetchedAt timestamp
    entry.metadata.fetchedAt = new Date();

    // Re-cache with updated metadata
    const key = this.generateCacheKey(url, method);
    const ttl = this.calculateTTL(entry.headers);

    await this.cache.set(key, entry, {
      ttl,
      tags: ["http", method.toLowerCase(), "revalidated"],
    });

    logger.debug("HTTP cache entry revalidated", { url, method });
    return entry;
  }

  /**
   * Check if we should use cache for this request
   */
  shouldUseCache(options?: HttpCacheOptions): boolean {
    if (!options) return true;

    if (options.bypassCache) return false;
    if (options.useCache === false) return false;

    return true;
  }

  /**
   * Check if we should revalidate
   */
  shouldRevalidate(entry: HttpCacheEntry, options?: HttpCacheOptions): boolean {
    if (options?.forceRevalidate) return true;
    if (this.isStale(entry)) return true;

    return false;
  }

  /**
   * Invalidate cached responses by URL pattern
   */
  async invalidateByUrl(urlPattern: string): Promise<number> {
    const pattern = `.*:${urlPattern}`;
    return await this.cache.clear(pattern);
  }

  /**
   * Invalidate cached responses by method
   */
  async invalidateByMethod(method: string): Promise<number> {
    return await this.cache.invalidateByTags([method.toLowerCase()]);
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    return await this.cache.getStats();
  }

  /**
   * Clear all HTTP cache entries
   */
  async clear(): Promise<number> {
    return await this.cache.clear();
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<number> {
    return await this.cache.cleanup();
  }

  /**
   * Fetch with caching support
   * 
   * This is the main entry point for cached HTTP requests.
   * It handles cache lookups, conditional requests, and cache updates.
   */
  async fetch(url: string, options?: RequestInit & HttpCacheOptions): Promise<Response> {
    const method = options?.method || "GET";
    
    // Only cache GET requests by default
    if (method !== "GET" && method !== "HEAD") {
      logger.debug("Bypassing cache for non-GET request", { url, method });
      return fetch(url, options);
    }

    // Check if we should bypass cache
    if (!this.shouldUseCache(options)) {
      logger.debug("Bypassing cache", { url, method });
      return fetch(url, options);
    }

    // Check cache
    const cachedEntry = await this.get(url, method);
    
    if (cachedEntry && !this.shouldRevalidate(cachedEntry, options)) {
      // Return cached response
      logger.info("HTTP cache hit", { url, method });
      return this.createResponseFromCache(cachedEntry, true);
    }

    // Prepare request headers
    const headers = new Headers(options?.headers);
    
    // Add conditional headers if we have a stale entry
    if (cachedEntry) {
      if (cachedEntry.metadata.etag) {
        headers.set("If-None-Match", cachedEntry.metadata.etag);
      }
      if (cachedEntry.metadata.lastModified) {
        headers.set("If-Modified-Since", cachedEntry.metadata.lastModified);
      }
    }

    // Make the request
    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle 304 Not Modified
      if (response.status === 304 && cachedEntry) {
        logger.info("HTTP cache revalidated (304)", { url, method });
        await this.handleNotModified(url, method);
        return this.createResponseFromCache(cachedEntry, true, true);
      }

      // Cache successful responses (2xx)
      if (response.ok) {
        const responseHeaders = this.headersToObject(response.headers);
        
        // Check if response is cacheable
        if (this.isCacheable(response.status, responseHeaders)) {
          // Clone response before consuming it
          const cloned = response.clone();
          const data = Buffer.from(await cloned.arrayBuffer());
          
          await this.set(url, data, responseHeaders, response.status, method);
          
          // Return new response with cache headers
          return this.createResponseWithCacheHeaders(response, false);
        }
      }

      // Return response as-is for non-cacheable responses
      return response;
    } catch (error) {
      // On network error, return stale cache if available
      if (cachedEntry && options?.returnStaleOnError) {
        logger.warn("Returning stale cache due to network error", { url, error });
        return this.createResponseFromCache(cachedEntry, true, false, true);
      }
      throw error;
    }
  }

  /**
   * Check if response is cacheable
   */
  private isCacheable(status: number, headers: Record<string, string>): boolean {
    // Don't cache if explicitly told not to
    const cacheControl = headers["cache-control"];
    if (cacheControl) {
      if (cacheControl.includes("no-store")) return false;
      if (cacheControl.includes("private")) return false;
    }

    // Only cache successful responses
    return status >= 200 && status < 300;
  }

  /**
   * Convert Headers to plain object
   */
  private headersToObject(headers: Headers): Record<string, string> {
    const obj: Record<string, string> = {};
    headers.forEach((value, key) => {
      obj[key.toLowerCase()] = value;
    });
    return obj;
  }

  /**
   * Create Response from cached entry
   */
  private createResponseFromCache(
    entry: HttpCacheEntry, 
    isHit: boolean, 
    isRevalidated: boolean = false,
    isStale: boolean = false
  ): Response {
    const headers = new Headers(entry.headers);
    
    // Add cache status headers
    headers.set("X-Cache", isHit ? "HIT" : "MISS");
    if (isRevalidated) {
      headers.set("X-Cache-Revalidated", "true");
    }
    if (isStale) {
      headers.set("X-Cache-Stale", "true");
    }
    headers.set("X-Cache-Key", this.generateCacheKey(entry.url, entry.method));
    
    return new Response(entry.data, {
      status: entry.statusCode,
      statusText: this.getStatusText(entry.statusCode),
      headers,
    });
  }

  /**
   * Add cache headers to response
   */
  private createResponseWithCacheHeaders(response: Response, isHit: boolean): Response {
    const headers = new Headers(response.headers);
    headers.set("X-Cache", isHit ? "HIT" : "MISS");
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  /**
   * Get status text for status code
   */
  private getStatusText(status: number): string {
    const statusTexts: Record<number, string> = {
      200: "OK",
      201: "Created",
      204: "No Content",
      304: "Not Modified",
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      500: "Internal Server Error",
    };
    return statusTexts[status] || "Unknown";
  }
}

// Singleton instance
let httpCacheInstance: HttpCache | null = null;

/**
 * Get the default HTTP cache instance
 */
export function getHttpCache(): HttpCache {
  if (!httpCacheInstance) {
    httpCacheInstance = new HttpCache();
  }
  return httpCacheInstance;
}