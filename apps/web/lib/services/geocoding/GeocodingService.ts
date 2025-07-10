import NodeGeocoder from "node-geocoder";
import type { Payload } from "payload";

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  confidence: number;
  provider: string;
  normalizedAddress: string;
  components: {
    streetNumber?: string;
    streetName?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  };
  metadata?: any;
  fromCache?: boolean;
}

export interface BatchGeocodingResult {
  results: Map<string, GeocodingResult | GeocodingError>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    cached: number;
  };
}

export class GeocodingError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = "GeocodingError";
  }
}

export class GeocodingService {
  private googleGeocoder: NodeGeocoder.Geocoder | null = null;
  private nominatimGeocoder: NodeGeocoder.Geocoder;
  private payload: Payload;

  constructor(payload: Payload) {
    this.payload = payload;

    // Initialize Google Maps geocoder if API key is available
    if (process.env.GOOGLE_MAPS_API_KEY) {
      this.googleGeocoder = NodeGeocoder({
        provider: "google",
        apiKey: process.env.GOOGLE_MAPS_API_KEY,
        formatter: null,
      });
    }

    // Initialize Nominatim geocoder
    this.nominatimGeocoder = NodeGeocoder({
      provider: "openstreetmap",
      formatter: null,
    });
  }

  async geocode(address: string): Promise<GeocodingResult> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cached = await this.getCachedResult(address);
      if (cached) {
        // Update hit count and last used
        await this.updateCacheHit(cached.id);
        return {
          ...cached,
          fromCache: true,
        };
      }

      // Try providers in order: Google first (if available), then Nominatim
      const providers = [];
      if (this.googleGeocoder) {
        providers.push({ name: "google", geocoder: this.googleGeocoder });
      }
      providers.push({ name: "nominatim", geocoder: this.nominatimGeocoder });

      for (const { name, geocoder } of providers) {
        try {
          const results = await geocoder.geocode(address);
          const responseTime = Date.now() - startTime;

          if (results && results.length > 0) {
            const result = this.convertNodeGeocoderResult(results[0], name);

            // Validate result quality
            if (this.isResultAcceptable(result)) {
              // Cache the result
              await this.cacheResult(address, result);
              return result;
            }
          }
        } catch (error) {
          console.warn(`Geocoding failed with ${name}:`, error);
          // Continue to next provider
          continue;
        }
      }

      throw new GeocodingError(
        "All geocoding providers failed",
        "ALL_PROVIDERS_FAILED",
      );
    } catch (error) {
      if (error instanceof GeocodingError) {
        throw error;
      }
      throw new GeocodingError(
        `Geocoding error: ${error.message}`,
        "UNKNOWN_ERROR",
        true,
      );
    }
  }

  async batchGeocode(
    addresses: string[],
    batchSize: number = 10,
  ): Promise<BatchGeocodingResult> {
    const results: Map<string, GeocodingResult | GeocodingError> = new Map();
    const batches = this.createBatches(addresses, batchSize);

    let totalSuccessful = 0;
    let totalFailed = 0;
    let totalCached = 0;

    for (const batch of batches) {
      const batchPromises = batch.map(async (address) => {
        try {
          const result = await this.geocode(address);
          if (result.fromCache) totalCached++;
          totalSuccessful++;
          return { address, result };
        } catch (error) {
          totalFailed++;
          return { address, error: error as GeocodingError };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((settledResult) => {
        if (settledResult.status === "fulfilled") {
          const { address, result, error } = settledResult.value;
          results.set(address, result || error);
        }
      });

      // Rate limiting between batches (1 second)
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(1000);
      }
    }

    return {
      results,
      summary: {
        total: addresses.length,
        successful: totalSuccessful,
        failed: totalFailed,
        cached: totalCached,
      },
    };
  }

  private async getCachedResult(address: string): Promise<any> {
    try {
      const normalizedAddress = this.normalizeAddress(address);

      // Try exact match first
      const exactMatch = await this.payload.find({
        collection: "location-cache",
        where: {
          or: [
            { address: { equals: address } },
            { normalizedAddress: { equals: normalizedAddress } },
          ],
        },
        limit: 1,
      });

      if (exactMatch.docs.length > 0) {
        const cached = exactMatch.docs[0];
        return {
          id: cached.id,
          latitude: cached.latitude,
          longitude: cached.longitude,
          confidence: cached.confidence,
          provider: cached.provider,
          normalizedAddress: cached.normalizedAddress,
          components: cached.components || {},
          metadata: cached.metadata,
        };
      }

      return null;
    } catch (error) {
      console.warn("Cache lookup failed:", error);
      return null;
    }
  }

  private async cacheResult(
    address: string,
    result: GeocodingResult,
  ): Promise<void> {
    try {
      await this.payload.create({
        collection: "location-cache",
        data: {
          address,
          normalizedAddress: this.normalizeAddress(address),
          latitude: result.latitude,
          longitude: result.longitude,
          provider: result.provider as "google" | "nominatim",
          confidence: result.confidence,
          hitCount: 1,
          lastUsed: new Date().toISOString(),
          components: result.components,
          metadata: result.metadata,
        },
      });
    } catch (error) {
      console.warn("Failed to cache geocoding result:", error);
      // Don't throw - caching failure shouldn't break geocoding
    }
  }

  private async updateCacheHit(cacheId: string): Promise<void> {
    try {
      // Get current hit count and increment it
      const current = await this.payload.findByID({
        collection: "location-cache",
        id: cacheId,
      });

      await this.payload.update({
        collection: "location-cache",
        id: cacheId,
        data: {
          hitCount: (current.hitCount || 0) + 1,
          lastUsed: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.warn("Failed to update cache hit:", error);
    }
  }

  private convertNodeGeocoderResult(
    result: any,
    provider: string,
  ): GeocodingResult {
    return {
      latitude: result.latitude,
      longitude: result.longitude,
      confidence: this.calculateConfidence(result, provider),
      provider,
      normalizedAddress:
        result.formattedAddress ||
        `${result.streetName || ""} ${result.streetNumber || ""}, ${result.city || ""}, ${result.country || ""}`.trim(),
      components: {
        streetNumber: result.streetNumber,
        streetName: result.streetName,
        city: result.city,
        region: result.administrativeLevels?.level1short || result.state,
        postalCode: result.zipcode,
        country: result.country,
      },
      metadata: {
        extra: result.extra,
        raw: result,
      },
    };
  }

  private calculateConfidence(result: any, provider: string): number {
    let confidence = 0.5;

    // Provider-specific confidence calculation
    if (provider === "google") {
      if (result.extra?.googlePlaceId) confidence += 0.2;
      if (result.extra?.confidence >= 0.8) confidence += 0.2;
    } else if (provider === "nominatim") {
      if (result.extra?.osmId) confidence += 0.1;
      if (result.extra?.importance > 0.5) confidence += 0.2;
    }

    // General quality indicators
    if (result.streetNumber && result.streetName) confidence += 0.2;
    if (result.city && result.country) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private isResultAcceptable(result: GeocodingResult): boolean {
    // Minimum confidence threshold
    if (result.confidence < 0.3) return false;

    // Basic coordinate validation
    if (Math.abs(result.latitude) > 90 || Math.abs(result.longitude) > 180)
      return false;

    // Must have at least latitude and longitude
    if (!result.latitude || !result.longitude) return false;

    return true;
  }

  private normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s]/g, "");
  }

  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Cleanup old cache entries
  async cleanupCache(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago

      await this.payload.delete({
        collection: "location-cache",
        where: {
          and: [
            { hitCount: { less_than: 3 } },
            { lastUsed: { less_than: cutoffDate.toISOString() } },
          ],
        },
      });
    } catch (error) {
      console.warn("Cache cleanup failed:", error);
    }
  }
}
