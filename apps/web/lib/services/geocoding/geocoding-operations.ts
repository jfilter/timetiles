/**
 * Implements the core operational logic for the geocoding service.
 *
 * This class orchestrates the entire geocoding process. It integrates the provider manager
 * and cache manager to perform geocoding lookups efficiently and resiliently.
 *
 * Its responsibilities include:
 * - Checking the cache for an address before querying external providers.
 * - Sequentially trying configured geocoding providers based on their priority.
 * - Handling provider fallbacks in case of failures.
 * - Managing batch geocoding requests.
 * - Providing a method to test the configuration of all active providers.
 *
 * @module
 */
import type { Entry } from "node-geocoder";

import { createLogger, logError, logPerformance } from "@/lib/logger";

import type { CacheManager } from "./cache-manager";
import type { ProviderManager } from "./provider-manager";
import { getProviderRateLimiter } from "./provider-rate-limiter";
import type { BatchGeocodingResult, GeocodingResult, GeocodingSettings, ProviderConfig } from "./types";
import { GeocodingError, isTransientError } from "./types";

const logger = createLogger("geocoding-operations");

/** Maximum time to wait for a provider test before timing out (ms). */
const GEOCODING_TEST_TIMEOUT_MS = 5000;

/** Maximum time to wait for a single geocoding operation (ms). */
const GEOCODING_OPERATION_TIMEOUT_MS = 10_000;

export class GeocodingOperations {
  /** Counter for weighted distribution of requests across providers */
  private distributionCounter = 0;

  constructor(
    private readonly providerManager: ProviderManager,
    private readonly cacheManager: CacheManager,
    private readonly settings: GeocodingSettings | null
  ) {}

  async geocode(address: string): Promise<GeocodingResult> {
    const startTime = Date.now();
    logger.debug("Starting geocoding request", { address });

    // Check cache first
    const cachedResult = await this.checkCache(address, startTime);
    if (cachedResult != null) {
      return cachedResult;
    }

    // Try geocoding with enabled providers, sequential with retry on transient errors
    const result = await this.tryProviders(address);
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

  /**
   * Geocode with weighted distribution across providers.
   * Providers with higher rateLimit get proportionally more requests.
   * E.g. VersaTiles(15 req/s) + Komoot(10 req/s) → VersaTiles gets 60%, Komoot 40%.
   * On failure, falls back to remaining providers in priority order.
   */
  private async geocodeDistributed(address: string): Promise<GeocodingResult> {
    const startTime = Date.now();

    // Check cache first
    const cachedResult = await this.checkCache(address, startTime);
    if (cachedResult != null) {
      return cachedResult;
    }

    const enabledProviders = this.providerManager.getEnabledProviders();
    const rateLimiter = getProviderRateLimiter();

    const available = enabledProviders.filter((p) => rateLimiter.isAvailable(p.name));
    if (available.length === 0) {
      return this.geocode(address);
    }

    // Weighted selection: pick provider based on rateLimit proportions
    const primary = this.pickWeightedProvider(available);

    // Try the round-robin-selected provider first
    try {
      const result = await this.tryProviderWithRetry(primary, address);
      if (result != null) {
        if (!this.isResultAcceptable(result)) {
          throw new GeocodingError("Geocoding result failed validation", "VALIDATION_FAILED", false);
        }
        await this.cacheManager.cacheResult(address, result);
        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug("Primary provider failed, trying fallbacks", {
        provider: primary.name,
        error: errorMessage,
        address,
      });
    }

    // Primary failed — try remaining providers in priority order
    return this.tryFallbackProviders(available, primary.name, address);
  }

  /** Try remaining providers in priority order after the primary failed. */
  private async tryFallbackProviders(
    available: ProviderConfig[],
    primaryName: string,
    address: string
  ): Promise<GeocodingResult> {
    const rateLimiter = getProviderRateLimiter();

    for (const provider of available) {
      if (provider.name === primaryName) continue;
      if (!rateLimiter.isAvailable(provider.name)) continue;

      try {
        const result = await this.tryProviderWithRetry(provider, address);
        if (result != null) {
          if (!this.isResultAcceptable(result)) continue;
          await this.cacheManager.cacheResult(address, result);
          return result;
        }
      } catch {
        // Try next provider
      }

      if (!this.shouldContinueWithFallback()) break;
    }

    throw new GeocodingError("All geocoding providers failed", "ALL_PROVIDERS_FAILED", false);
  }

  private async checkCache(address: string, startTime: number): Promise<GeocodingResult | null> {
    if (this.settings?.caching?.enabled !== true) {
      return null;
    }

    const cached = await this.cacheManager.getCachedResult(address);
    if (cached != null) {
      logger.debug("Cache hit for address", { address });
      logPerformance("Geocoding (cache hit)", Date.now() - startTime, { address, provider: cached.provider });
      return cached;
    }
    return null;
  }

  /**
   * Try providers sequentially by priority. Providers in the same group are
   * available as fallbacks but distribution happens at the batch level, not here.
   */
  private async tryProviders(address: string): Promise<GeocodingResult | null> {
    const enabledProviders = this.providerManager.getEnabledProviders();
    const rateLimiter = getProviderRateLimiter();

    for (const provider of enabledProviders) {
      if (!rateLimiter.isAvailable(provider.name)) {
        logger.debug("Skipping provider in backoff", { provider: provider.name });
        continue;
      }

      try {
        const result = await this.tryProviderWithRetry(provider, address);
        if (result != null) {
          return result;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Geocoding failed with provider ${provider.name}`, { error: errorMessage, address });
      }

      if (!this.shouldContinueWithFallback()) {
        break;
      }
    }

    return null;
  }

  /**
   * Try a single provider with 1 retry for transient errors (429/503/404).
   */
  private async tryProviderWithRetry(
    provider: ProviderConfig,
    address: string,
    maxRetries: number = 1
  ): Promise<GeocodingResult | null> {
    const rateLimiter = getProviderRateLimiter();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.tryProvider(provider, address);
        rateLimiter.reportSuccess(provider.name);
        return result;
      } catch (error) {
        if (isTransientError(error) && attempt < maxRetries) {
          const geocodingError = error as GeocodingError;
          rateLimiter.reportThrottle(provider.name, geocodingError.retryAfterMs);
          logger.debug("Retrying provider after transient error", {
            provider: provider.name,
            attempt: attempt + 1,
            code: geocodingError.code,
          });
          await rateLimiter.waitForSlot(provider.name);
          continue;
        }
        if (isTransientError(error)) {
          rateLimiter.reportThrottle(provider.name, (error as GeocodingError).retryAfterMs);
        }
        throw error;
      }
    }
    return null;
  }

  /**
   * Pick a provider using weighted distribution based on rateLimit.
   * Higher rateLimit = more requests routed to that provider.
   * Deterministic via counter (not random) for predictable distribution.
   */
  private pickWeightedProvider(providers: ProviderConfig[]): ProviderConfig {
    if (providers.length === 1) return providers[0]!;

    const totalWeight = providers.reduce((sum, p) => sum + p.rateLimit, 0);
    const position = this.distributionCounter++ % totalWeight;

    let cumulative = 0;
    for (const provider of providers) {
      cumulative += provider.rateLimit;
      if (position < cumulative) {
        return provider;
      }
    }

    return providers[0]!;
  }

  private async tryProvider(provider: ProviderConfig, address: string): Promise<GeocodingResult | null> {
    const rateLimiter = getProviderRateLimiter();
    await rateLimiter.waitForSlot(provider.name);

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
    const summary = { total: addresses.length, successful: 0, failed: 0, cached: 0 };

    const batches = this.createBatches(addresses, batchSize);

    for (const batch of batches) {
      const batchPromises = batch.map(async (address) => {
        try {
          const result = await this.geocodeDistributed(address);
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
    }

    return { results, summary };
  }

  async testConfiguration(
    testAddress = "1600 Amphitheatre Parkway, Mountain View, CA"
  ): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};

    logger.info("Testing geocoding configuration", { address: testAddress });

    for (const provider of this.providerManager.getProviders().filter((p) => Boolean(p.enabled))) {
      try {
        const geocodePromise = this.geocodeWithProvider(provider.geocoder, testAddress);
        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error("Geocoding timeout")), GEOCODING_TEST_TIMEOUT_MS)
        );

        const providerResults = (await Promise.race([geocodePromise, timeoutPromise])) as Entry[];

        if (this.hasValidResults(providerResults)) {
          const firstResult = providerResults[0];
          if (firstResult) {
            const geocodingResult = this.convertNodeGeocoderResult(firstResult, provider.name);
            results[provider.name] = { success: true, result: geocodingResult };
          } else {
            results[provider.name] = { success: false, error: "No valid results", latency: 0 };
          }
        } else {
          results[provider.name] = { success: false, error: "No valid results returned" };
        }
      } catch (error) {
        results[provider.name] = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
      }
    }

    return results;
  }

  private async geocodeWithProvider(
    geocoder: { geocode: (address: string) => Promise<Entry[]> },
    address: string
  ): Promise<Entry[]> {
    const geocodePromise = geocoder.geocode(address);
    const timeoutPromise = new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error("Provider timeout")), GEOCODING_OPERATION_TIMEOUT_MS)
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

  private calculatePhotonConfidence(result: Entry): number {
    return (result.extra as { confidence?: number })?.confidence ?? 0.6;
  }

  private calculateConfidence(result: Entry, providerName: string): number {
    let confidence: number;

    switch (providerName) {
      case "google":
        confidence = this.calculateGoogleConfidence(result);
        break;
      case "locationiq":
        // LocationIQ uses OSM data — same heuristic as Nominatim
        confidence = this.calculateNominatimConfidence(result);
        break;
      case "opencage":
        confidence = this.calculateOpenCageConfidence(result);
        break;
      case "nominatim":
        confidence = this.calculateNominatimConfidence(result);
        break;
      case "photon":
        confidence = this.calculatePhotonConfidence(result);
        break;
      default:
        confidence = 0.7;
    }

    return Math.min(Math.max(confidence, 0), 1);
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
}
