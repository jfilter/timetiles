import type { Entry } from "node-geocoder";

import { createLogger, logError, logPerformance } from "@/lib/logger";

import type { CacheManager } from "./cache-manager";
import type { ProviderManager } from "./provider-manager";
import type { BatchGeocodingResult, GeocodingResult, GeocodingSettings } from "./types";
import { GeocodingError } from "./types";

const logger = createLogger("geocoding-operations");

export class GeocodingOperations {
  constructor(
    private readonly providerManager: ProviderManager,
    private readonly cacheManager: CacheManager,
    private readonly settings: GeocodingSettings | null,
  ) {}

  async geocode(address: string): Promise<GeocodingResult> {
    const startTime = Date.now();
    logger.debug("Starting geocoding request", { address });

    // Check cache first
    const cachedResult = await this.checkCache(address, startTime);
    if (cachedResult != null) {
      return cachedResult;
    }

    // Try geocoding with enabled providers
    const result = await this.tryProvidersSequentially(address);
    if (result != null) {
      // Validate the result before accepting it
      if (!this.isResultAcceptable(result)) {
        throw new GeocodingError("Geocoding result failed validation", "VALIDATION_FAILED", false);
      }
      await this.cacheManager.cacheResult(address, result);
      return result;
    }

    // If all providers failed
    throw new GeocodingError("All geocoding providers failed", "ALL_PROVIDERS_FAILED", false);
  }

  private async checkCache(address: string, startTime: number): Promise<GeocodingResult | null> {
    if (this.settings?.caching?.enabled !== true) {
      return null;
    }

    const cached = await this.cacheManager.getCachedResult(address);
    if (cached != null) {
      logger.debug("Cache hit for address", { address });
      logPerformance("Geocoding (cache hit)", Date.now() - startTime, {
        address,
        provider: cached.provider,
      });
      return cached;
    }
    return null;
  }

  private async tryProvidersSequentially(address: string): Promise<GeocodingResult | null> {
    const enabledProviders = this.providerManager.getEnabledProviders();

    for (const provider of enabledProviders) {
      try {
        const result = await this.tryProvider(provider, address);
        if (result != null) {
          return result;
        }

        if (!this.shouldContinueWithFallback()) {
          break;
        }
      } catch (error) {
        logger.warn(`Geocoding failed with provider ${provider.name}`, { error, address });

        if (!this.shouldContinueWithFallback()) {
          this.handleGeocodingError(error, address);
        }
      }
    }

    return null;
  }

  private async tryProvider(
    provider: { geocoder: { geocode: (address: string) => Promise<Entry[]> }; name: string },
    address: string,
  ): Promise<GeocodingResult | null> {
    const results = await this.geocodeWithProvider(provider.geocoder, address);
    if (this.hasValidResults(results)) {
      const firstResult = results[0];
      if (firstResult) {
        return this.convertNodeGeocoderResult(firstResult, provider.name);
      }
    }
    return null;
  }

  async batchGeocode(addresses: string[], batchSize: number = 10): Promise<BatchGeocodingResult> {
    const results = new Map<string, GeocodingResult | GeocodingError>();
    const summary = {
      total: addresses.length,
      successful: 0,
      failed: 0,
      cached: 0,
    };

    const batches = this.createBatches(addresses, batchSize);

    for (const batch of batches) {
      const batchPromises = batch.map(async (address) => {
        try {
          const result = await this.geocode(address);
          if (result.fromCache === true) summary.cached++;
          summary.successful++;
          return { address, result };
        } catch (error) {
          summary.failed++;
          return { address, error: error as GeocodingError };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      for (const settledResult of batchResults) {
        if (settledResult.status === "fulfilled") {
          const { address, result, error } = settledResult.value;
          if (result != null) {
            results.set(address, result);
          } else if (error != null) {
            results.set(address, error);
          }
        }
      }

      // Add delay between batches to respect rate limits
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(1000);
      }
    }

    return { results, summary };
  }

  async testConfiguration(testAddress?: string): Promise<Record<string, unknown>> {
    const address = testAddress ?? "1600 Amphitheatre Parkway, Mountain View, CA";
    const results: Record<string, unknown> = {};

    logger.info("Testing geocoding configuration", { address });

    for (const provider of this.providerManager.getProviders().filter((p) => Boolean(p.enabled))) {
      try {
        const geocodePromise = this.geocodeWithProvider(provider.geocoder, address);
        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error("Geocoding timeout")), 5000),
        );

        const providerResults = (await Promise.race([geocodePromise, timeoutPromise])) as Entry[];

        if (this.hasValidResults(providerResults)) {
          const firstResult = providerResults[0];
          if (firstResult) {
            const geocodingResult = this.convertNodeGeocoderResult(firstResult, provider.name);
            results[provider.name] = {
              success: true,
              result: geocodingResult,
            };
          } else {
            results[provider.name] = {
              success: false,
              error: "No valid results",
              latency: 0,
            };
          }
        } else {
          results[provider.name] = {
            success: false,
            error: "No valid results returned",
          };
        }
      } catch (error) {
        results[provider.name] = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    return results;
  }

  private async geocodeWithProvider(
    geocoder: { geocode: (address: string) => Promise<Entry[]> },
    address: string,
  ): Promise<Entry[]> {
    const geocodePromise = geocoder.geocode(address);
    const timeoutPromise = new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error("Provider timeout")), 10000),
    );

    return (await Promise.race([geocodePromise, timeoutPromise])) as Entry[];
  }

  private hasValidResults(results: Entry[]): boolean {
    return (
      Array.isArray(results) &&
      results.length > 0 &&
      results[0] != null &&
      typeof results[0].latitude === "number" &&
      typeof results[0].longitude === "number"
    );
  }

  private shouldContinueWithFallback(): boolean {
    return this.settings?.fallbackEnabled === true;
  }

  private convertNodeGeocoderResult(result: Entry, providerName: string): GeocodingResult {
    const confidence = this.calculateConfidence(result, providerName);

    return {
      latitude: result.latitude!,
      longitude: result.longitude!,
      confidence,
      provider: providerName,
      normalizedAddress: result.formattedAddress ?? `${result.latitude}, ${result.longitude}`,
      components: {
        streetNumber: result.streetNumber ?? null,
        streetName: result.streetName ?? null,
        city: result.city ?? null,
        region: result.administrativeLevels?.level1short ?? result.state ?? null,
        postalCode: result.zipcode ?? null,
        country: result.country ?? null,
      },
      metadata: {
        requestTimestamp: new Date().toISOString(),
        responseTime: null,
        accuracy: (result.extra as { accuracy?: string })?.accuracy ?? null,
        formattedAddress: result.formattedAddress ?? null,
      },
      // fromCache is only set to true for cached results, undefined for fresh results
    };
  }

  // Helper methods to reduce complexity in calculateConfidence
  private calculateGoogleConfidence(result: Entry): number {
    const googleConfidence = (result.extra as { confidence?: string })?.confidence;

    switch (googleConfidence) {
      case "exact_match":
        return 0.95;
      case "high":
        return 0.85;
      case "medium":
        return 0.7;
      default:
        return 0.6;
    }
  }

  private calculateOpenCageConfidence(result: Entry): number {
    return (result.extra as { confidence?: number })?.confidence ?? 0.7;
  }

  private calculateNominatimConfidence(result: Entry): number {
    let confidence = 0.6;

    const hasStreetInfo = (result.streetNumber?.length ?? 0) > 0 && (result.streetName?.length ?? 0) > 0;
    if (hasStreetInfo) {
      confidence += 0.2;
    }

    const hasCityStateInfo = (result.city?.length ?? 0) > 0 && (result.state?.length ?? 0) > 0;
    if (hasCityStateInfo) {
      confidence += 0.1;
    }

    return confidence;
  }

  private calculateConfidence(result: Entry, providerName: string): number {
    let confidence: number;

    switch (providerName) {
      case "google":
        confidence = this.calculateGoogleConfidence(result);
        break;
      case "opencage":
        confidence = this.calculateOpenCageConfidence(result);
        break;
      case "nominatim":
        confidence = this.calculateNominatimConfidence(result);
        break;
      default:
        confidence = 0.7;
    }

    return Math.min(Math.max(confidence, 0.0), 1.0);
  }

  private handleGeocodingError(error: unknown, address: string): never {
    if (error instanceof GeocodingError) {
      throw error;
    }
    logError(error, "Unexpected geocoding error", { address });
    throw new GeocodingError("Geocoding failed", "GEOCODING_FAILED", false);
  }

  private isResultAcceptable(result: GeocodingResult): boolean {
    return (
      result.latitude != null &&
      result.longitude != null &&
      (result.confidence ?? 0) >= 0.5 &&
      Math.abs(result.latitude) <= 90 &&
      Math.abs(result.longitude) <= 180
    );
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
