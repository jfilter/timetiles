import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";
import type { LocationCache } from "@/payload-types";

import type { GeocodingResult, GeocodingSettings } from "./types";
import { LOCATION_CACHE_COLLECTION } from "./types";

const logger = createLogger("geocoding-cache-manager");

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
        where: {
          normalizedAddress: {
            equals: normalizedAddress,
          },
        },
        limit: 1,
      });

      if (results.docs.length === 0) return null;

      const cached = results.docs[0] as LocationCache;
      if (cached == null) return null;

      if (this.isCacheExpired(cached)) {
        // Optionally clean up expired entries
        await this.payload.delete({
          collection: LOCATION_CACHE_COLLECTION,
          id: cached.id,
        });
        return null;
      }

      // Update hit count and last used timestamp
      await this.payload.update({
        collection: LOCATION_CACHE_COLLECTION,
        id: cached.id,
        data: {
          hitCount: (cached.hitCount ?? 0) + 1,
          lastUsed: new Date().toISOString(),
        },
      });

      return this.convertCachedResult(cached);
    } catch (error) {
      logger.warn("Failed to retrieve cached result", { error, address: normalizedAddress });
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

      logger.debug("Cached geocoding result", { address: normalizedAddress, provider: result.provider });
    } catch (error) {
      logger.warn("Failed to cache geocoding result", { error, address: normalizedAddress });
    }
  }

  async cleanupCache(): Promise<void> {
    if (this.settings?.caching?.enabled !== true) {
      return;
    }

    const ttlDays = this.settings.caching.ttlDays ?? 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ttlDays);

    try {
      const oldEntries = await this.payload.find({
        collection: LOCATION_CACHE_COLLECTION,
        where: {
          createdAt: {
            less_than: cutoffDate.toISOString(),
          },
        },
        limit: 1000,
      });

      for (const entry of oldEntries.docs) {
        await this.payload.delete({
          collection: LOCATION_CACHE_COLLECTION,
          id: entry.id,
        });
      }

      logger.info(`Cleaned up ${oldEntries.docs.length} expired cache entries`);
    } catch (error) {
      logger.error("Failed to cleanup cache", { error });
    }
  }

  private normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ") // Replace multiple spaces with single space
      .replace(/[^\w\s,.-]/g, "") // Remove special characters except common punctuation
      .replace(/,{2,}/g, ",") // Replace multiple commas with single comma (more specific regex)
      .replace(/^[\s,]+/, "") // Remove leading whitespace and commas
      .trimEnd()
      .replace(/,$/, ""); // Remove single trailing comma
  }

  private isCacheExpired(cached: LocationCache): boolean {
    if (cached.createdAt == null || cached.createdAt == undefined) return true;

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
}
