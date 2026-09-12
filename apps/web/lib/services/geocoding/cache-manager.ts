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
import { eq, lt, sql } from "@payloadcms/db-postgres/drizzle";
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
 *
 * The strip class is Unicode-aware (\p{L}/\p{N}, not ASCII \w): the
 * normalized string is also what gets SENT to the geocoding providers, so an
 * ASCII-only class mangled every non-ASCII address ("Müllerstraße 12, Köln"
 * → "mllerstrae 12, kln"), emptied fully non-Latin addresses out of the
 * geocode set entirely, and collided cache keys for addresses differing only
 * in non-ASCII letters.
 *
 * Slashes separate address parts ("12/1 Main St", "Apt 3/B") and become a space rather than
 * being dropped: dropping them fused the parts into a different house number, so "12/1 Main
 * St" normalized to "121 main st" — the same key as the genuinely different "121 Main St",
 * and, because this string is also what gets sent to the provider, the wrong lookup. Other
 * punctuation keeps being dropped, which is what an apostrophe ("O'Brien" → "obrien") wants.
 */
export const normalizeGeocodingAddress = (address: string): string =>
  address
    .toLowerCase()
    .trim()
    .replaceAll(/[/\\|]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .replaceAll(/[^\p{L}\p{N}_\s,.-]/gu, "")
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

      const cached = results.docs[0];
      if (cached == null) return null;

      if (this.isCacheExpired(cached)) {
        // Optionally clean up expired entries
        await this.payload.delete({ collection: LOCATION_CACHE_COLLECTION, overrideAccess: true, id: cached.id });
        return null;
      }

      // Atomic increment (COALESCE(hitCount,0)+1) so two concurrent lookups of
      // the same cached address don't clobber each other via a read-modify-write
      // (both reading 5, both writing 6).
      await this.recordCacheHit(cached.id);

      return this.convertCachedResult(cached);
    } catch (error) {
      logger.warn("Failed to retrieve cached result", { error, addressHash: hashForLog(normalizedAddress) });
      return null;
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
   * Atomically increment the hit count and refresh the last-used timestamp.
   */
  private async recordCacheHit(id: number): Promise<void> {
    try {
      const db = this.payload.db.drizzle;
      await db
        .update(location_cache)
        .set({ hitCount: sql`COALESCE(${location_cache.hitCount}, 0) + 1`, lastUsed: sql`NOW()` })
        .where(eq(location_cache.id, id));
    } catch (error) {
      logger.warn("Failed to record cache hit", { error, id });
    }
  }
}
