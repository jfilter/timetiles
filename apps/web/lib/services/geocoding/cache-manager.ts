/**
 * Manages the caching layer for the geocoding service.
 *
 * This class is responsible for all interactions with the geocoding cache. Its primary
 * purpose is to reduce redundant API calls to external geocoding providers by storing
 * and retrieving results from a local database collection (`location-cache`).
 *
 * Key functionalities include:
 * - Retrieving a cached geocoding result for a given address.
 * - Storing a new geocoding result in the cache.
 * - Handling cache expiration and cleanup of old entries.
 * - Normalizing addresses to improve cache hit rates.
 *
 * @module
 */
import { inArray, lt, sql } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";
import { hashForLog } from "@/lib/security/hash";
import { location_cache } from "@/payload-generated-schema";
import type { LocationCache } from "@/payload-types";

import type { GeocodingResult, GeocodingSettings } from "./types";
import { LOCATION_CACHE_COLLECTION } from "./types";

const logger = createLogger("geocoding-cache-manager");

/**
 * Normalize an address string for cache deduplication.
 *
 * Lowercases, trims, collapses whitespace, and strips special characters
 * so that variants like "123 Main St", "  123 main st  ", and "123 MAIN ST"
 * map to the same cache key.
 */
export const normalizeGeocodingAddress = (address: string): string =>
  address
    .toLowerCase()
    .trim()
    .replaceAll(/\s+/g, " ")
    .replaceAll(/[^\w\s,.-]/g, "")
    .replaceAll(/,{2,}/g, ",")
    .replace(/^[\s,]+/, "")
    .trimEnd()
    .replace(/,$/, "");

export class CacheManager {
  private readonly payload: Payload;
  private readonly settings: GeocodingSettings | null = null;

  constructor(payload: Payload, settings: GeocodingSettings | null) {
    this.payload = payload;
    this.settings = settings;
  }

  async getCachedResult(address: string): Promise<GeocodingResult | null> {
    if (this.settings?.caching?.enabled !== true) {
      return null;
    }

    const normalizedAddress = this.normalizeAddress(address);

    try {
      const results = await this.payload.find({
        collection: LOCATION_CACHE_COLLECTION,
        overrideAccess: true,
        where: { normalizedAddress: { equals: normalizedAddress } },
        limit: 1,
      });

      if (results.docs.length === 0) return null;

      const cached = results.docs[0] as LocationCache;
      if (cached == null) return null;

      if (this.isCacheExpired(cached)) {
        // Optionally clean up expired entries
        await this.payload.delete({ collection: LOCATION_CACHE_COLLECTION, overrideAccess: true, id: cached.id });
        return null;
      }

      // Update hit count and last used timestamp
      await this.payload.update({
        collection: LOCATION_CACHE_COLLECTION,
        overrideAccess: true,
        id: cached.id,
        data: { hitCount: (cached.hitCount ?? 0) + 1, lastUsed: new Date().toISOString() },
      });

      return this.convertCachedResult(cached);
    } catch (error) {
      logger.warn("Failed to retrieve cached result", { error, addressHash: hashForLog(normalizedAddress) });
      return null;
    }
  }

  /**
   * Batch lookup of multiple addresses in a single query.
   *
   * Normalizes all addresses, queries the cache with an `in` clause,
   * filters expired entries, and batch-updates hit counts for all hits.
   */
  async getCachedResults(addresses: string[]): Promise<Map<string, GeocodingResult>> {
    if (this.settings?.caching?.enabled !== true || addresses.length === 0) {
      return new Map();
    }

    // Build a map from normalized address back to the original address
    const normalizedMap = new Map<string, string>();
    for (const addr of addresses) {
      normalizedMap.set(this.normalizeAddress(addr), addr);
    }
    const normalizedAddresses = Array.from(normalizedMap.keys());

    try {
      const results = await this.payload.find({
        collection: LOCATION_CACHE_COLLECTION,
        overrideAccess: true,
        where: { normalizedAddress: { in: normalizedAddresses } },
        limit: normalizedAddresses.length,
        pagination: false,
      });

      const cachedResults = new Map<string, GeocodingResult>();
      const hitIds: number[] = [];
      const expiredIds: number[] = [];

      for (const cached of results.docs) {
        const doc = cached;

        if (this.isCacheExpired(doc)) {
          expiredIds.push(doc.id);
          continue;
        }

        const originalAddress = normalizedMap.get(doc.normalizedAddress);
        if (originalAddress) {
          cachedResults.set(originalAddress, this.convertCachedResult(doc));
          hitIds.push(doc.id);
        }
      }

      // Batch update hit counts for all cache hits
      if (hitIds.length > 0) {
        await this.batchUpdateHitCounts(hitIds);
      }

      // Clean up expired entries in the background (fire-and-forget)
      if (expiredIds.length > 0) {
        void this.batchDeleteExpired(expiredIds);
      }

      return cachedResults;
    } catch (error) {
      logger.warn("Failed to batch retrieve cached results", { error, addressCount: addresses.length });
      return new Map();
    }
  }

  async cacheResult(address: string, result: GeocodingResult): Promise<void> {
    if (this.settings?.caching?.enabled !== true) {
      return;
    }

    const normalizedAddress = this.normalizeAddress(address);

    try {
      await this.payload.create({
        collection: LOCATION_CACHE_COLLECTION,
        overrideAccess: true,
        data: {
          originalAddress: address,
          normalizedAddress: normalizedAddress || address,
          latitude: result.latitude,
          longitude: result.longitude,
          confidence: result.confidence,
          provider: result.provider,
          components: result.components,
          metadata: result.metadata,
        },
      });

      logger.debug("Cached geocoding result", {
        addressHash: hashForLog(normalizedAddress),
        provider: result.provider,
      });
    } catch (error) {
      logger.warn("Failed to cache geocoding result", { error, addressHash: hashForLog(normalizedAddress) });
    }
  }

  async cleanupCache(): Promise<void> {
    if (this.settings?.caching?.enabled !== true) {
      return;
    }

    const ttlDays = this.settings.caching.ttlDays ?? 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ttlDays);
    const cutoffIso = cutoffDate.toISOString();

    try {
      // Single bulk DELETE; no row-level hooks needed for cache cleanup.
      // Replaces the previous find+per-row-delete loop (up to 1000 queries → 1).
      const db = this.payload.db.drizzle;
      const result = await db
        .delete(location_cache)
        .where(lt(location_cache.createdAt, cutoffIso))
        .returning({ id: location_cache.id });
      const deletedCount = result.length;

      logger.info(`Cleaned up ${deletedCount} expired cache entries`);
    } catch (error) {
      logger.error("Failed to cleanup cache", { error });
    }
  }

  private normalizeAddress(address: string): string {
    return normalizeGeocodingAddress(address);
  }

  private isCacheExpired(cached: LocationCache): boolean {
    if (cached.createdAt == null) return true;

    const ttlDays = this.settings?.caching?.ttlDays ?? 30;
    const cacheDate = new Date(cached.createdAt);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ttlDays);

    return cacheDate < cutoffDate;
  }

  private convertCachedResult(cached: LocationCache): GeocodingResult {
    return {
      latitude: cached.latitude,
      longitude: cached.longitude,
      confidence: cached.confidence,
      provider: cached.provider,
      normalizedAddress: cached.normalizedAddress,
      components: cached.components ?? {
        streetNumber: null,
        streetName: null,
        city: null,
        region: null,
        postalCode: null,
        country: null,
      },
      metadata: cached.metadata ?? {
        requestTimestamp: cached.createdAt,
        responseTime: null,
        accuracy: null,
        formattedAddress: null,
      },
      fromCache: true,
    };
  }

  /**
   * Batch update hit counts and last-used timestamps for multiple cache entries
   * in a single SQL statement.
   */
  private async batchUpdateHitCounts(ids: number[]): Promise<void> {
    try {
      const db = this.payload.db.drizzle;
      await db
        .update(location_cache)
        .set({ hitCount: sql`COALESCE(${location_cache.hitCount}, 0) + 1`, lastUsed: sql`NOW()` })
        .where(inArray(location_cache.id, ids));
    } catch (error) {
      logger.warn("Failed to batch update hit counts", { error, count: ids.length });
    }
  }

  /**
   * Batch delete expired cache entries in a single SQL statement.
   */
  private async batchDeleteExpired(ids: number[]): Promise<void> {
    try {
      const db = this.payload.db.drizzle;
      await db.delete(location_cache).where(inArray(location_cache.id, ids));
    } catch (error) {
      logger.warn("Failed to batch delete expired cache entries", { error, count: ids.length });
    }
  }
}
