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

import { isValidCoordinate } from "@/lib/geospatial/validation";
import { createLogger, logPerformance } from "@/lib/logger";
import { hashForLog } from "@/lib/security/hash";

import type { CacheManager } from "./cache-manager";
import type { ProviderManager } from "./provider-manager";
import { getProviderRateLimiter } from "./provider-rate-limiter";
import type { BatchGeocodingResult, GeocodingBias, GeocodingResult, GeocodingSettings, ProviderConfig } from "./types";
import { GeocodingError, isTransientError } from "./types";

const logger = createLogger("geocoding-operations");

/** Maximum time to wait for a provider test before timing out (ms). */
const GEOCODING_TEST_TIMEOUT_MS = 5000;

/** Maximum time to wait for a single geocoding operation (ms). */
const GEOCODING_OPERATION_TIMEOUT_MS = 10_000;

export class GeocodingOperations {
  /** Counter for weighted distribution of requests across providers */
  private distributionCounter = 0;

  /** Providers we already warned about dropping a geocoding bias for (once per process). */
  private readonly biasWarnedProviders = new Set<string>();

  constructor(
    private readonly providerManager: ProviderManager,
    private readonly cacheManager: CacheManager,
    private readonly settings: GeocodingSettings | null
  ) {}

  async geocode(address: string, bias?: GeocodingBias): Promise<GeocodingResult> {
    const startTime = Date.now();
    logger.debug("Starting geocoding request", { addressHash: hashForLog(address) });

    // Check cache first
    const cachedResult = await this.checkCache(address, startTime, bias);
    if (cachedResult != null) {
      return cachedResult;
    }

    // Try geocoding with enabled providers, sequential with retry on transient errors
    const result = await this.tryProviders(address, bias);
    if (result != null) {
      // Validate the result before accepting it
      if (!this.isResultAcceptable(result)) {
        throw new GeocodingError("Geocoding result failed validation", "VALIDATION_FAILED", false);
      }
      await this.cacheResult(address, result, bias);
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
  private async geocodeDistributed(address: string, bias?: GeocodingBias): Promise<GeocodingResult> {
    const startTime = Date.now();

    // Check cache first
    const cachedResult = await this.checkCache(address, startTime, bias);
    if (cachedResult != null) {
      return cachedResult;
    }

    const enabledProviders = this.providerManager.getEnabledProviders();
    const rateLimiter = getProviderRateLimiter();

    const available = enabledProviders.filter((p) => rateLimiter.isAvailable(p.name));
    if (available.length === 0) {
      return this.geocode(address, bias);
    }

    // Weighted selection: pick provider based on rateLimit proportions
    const primary = this.pickWeightedProvider(available);

    // Try the round-robin-selected provider first
    try {
      const result = await this.tryProviderWithRetry(primary, address, bias);
      if (result != null) {
        if (!this.isResultAcceptable(result)) {
          throw new GeocodingError("Geocoding result failed validation", "VALIDATION_FAILED", false);
        }
        await this.cacheResult(address, result, bias);
        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug("Primary provider failed, trying fallbacks", {
        provider: primary.name,
        error: errorMessage,
        // Addresses are PII; log a correlation hash instead of the raw value
        // (matches the rest of this service and geocode-batch-job).
        addressHash: hashForLog(address),
      });
    }

    // Primary failed — try remaining providers in priority order
    return this.tryFallbackProviders(available, primary.name, address, bias);
  }

  /** Try remaining providers in priority order after the primary failed. */
  private async tryFallbackProviders(
    available: ProviderConfig[],
    primaryName: string,
    address: string,
    bias?: GeocodingBias
  ): Promise<GeocodingResult> {
    const result = await this.iterateProviders(available, address, bias, {
      skipProviderName: primaryName,
      revalidateAvailability: true,
    });

    if (result != null) {
      await this.cacheResult(address, result, bias);
      return result;
    }

    throw new GeocodingError("All geocoding providers failed", "ALL_PROVIDERS_FAILED", false);
  }

  private async checkCache(address: string, startTime: number, bias?: GeocodingBias): Promise<GeocodingResult | null> {
    // The cache is keyed by address alone, so a biased lookup must not read a
    // (possibly unbiased) cached entry — but only when the bias can actually
    // change the answer. If no enabled provider accepts an object query the
    // bias is dropped before the request is sent, so the lookup is byte-for-byte
    // the unbiased one and the cache is exactly right.
    if (this.hasBias(bias) && this.biasIsEffective()) {
      return null;
    }

    if (this.settings?.caching?.enabled !== true) {
      return null;
    }

    const cached = await this.cacheManager.getCachedResult(address);
    if (cached != null) {
      const addressHash = hashForLog(address);
      logger.debug("Cache hit for address", { addressHash });
      logPerformance("Geocoding (cache hit)", Date.now() - startTime, { addressHash, provider: cached.provider });
      return cached;
    }
    return null;
  }

  private async cacheResult(address: string, result: GeocodingResult, bias?: GeocodingBias): Promise<void> {
    // Skip the write only when the bias actually reached the provider that
    // produced this result. A string-only provider (Photon/Google/OpenCage)
    // never saw the bias, so its answer is the plain-address answer and belongs
    // in the address-keyed cache — otherwise every lookup of a biased import
    // re-hit the provider forever and never populated the cache at all.
    if (this.hasBias(bias) && this.providerAppliesBias(result.provider)) {
      return;
    }
    await this.cacheManager.cacheResult(address, result);
  }

  private hasBias(bias?: GeocodingBias): boolean {
    return Object.keys(this.buildBiasParams(bias)).length > 0;
  }

  /** True when at least one enabled provider would actually send the bias. */
  private biasIsEffective(): boolean {
    return this.providerManager.getEnabledProviders().some((provider) => this.supportsObjectQuery(provider));
  }

  /** True when the named provider sends the bias rather than dropping it. */
  private providerAppliesBias(providerName: string): boolean {
    const provider = this.providerManager.getProviders().find((candidate) => candidate.name === providerName);
    // Unknown provider: assume the bias applied and keep the result out of the
    // address-keyed cache rather than risk poisoning it.
    return provider == null || this.supportsObjectQuery(provider);
  }

  /**
   * Choose which providers {@link tryProviders} should attempt, in order.
   *
   * Providers in backoff are skipped only while some other provider can serve
   * the request. When EVERY provider is backing off we wait instead of
   * skipping: `waitForSlot` sleeps out the remaining backoff, so the request
   * still completes a moment later. Skipping them all made `tryProviders`
   * return null immediately and `geocode` throw ALL_PROVIDERS_FAILED, which
   * turned a single transient 429 into a permanent failure for every address
   * in flight during the backoff window (and made geocodeDistributed's
   * "nothing available → fall back to geocode()" path a no-op, since geocode()
   * applied the very same filter).
   *
   * Only the soonest-available provider is tried in that case, so the wait is
   * bounded by one backoff window rather than the sum of all of them.
   */
  private selectProvidersToTry(
    enabledProviders: ProviderConfig[],
    rateLimiter: ReturnType<typeof getProviderRateLimiter>
  ): ProviderConfig[] {
    const available = enabledProviders.filter((provider) => rateLimiter.isAvailable(provider.name));
    if (available.length > 0 || enabledProviders.length === 0) {
      return available;
    }

    const soonest = [...enabledProviders].sort(
      (a, b) => rateLimiter.getTimeUntilAllowed(a.name) - rateLimiter.getTimeUntilAllowed(b.name)
    )[0]!;
    logger.debug("All providers in backoff, waiting for the soonest-available one", {
      provider: soonest.name,
      waitMs: rateLimiter.getTimeUntilAllowed(soonest.name),
    });
    return [soonest];
  }

  /**
   * Try providers sequentially by priority. Providers in the same group are
   * available as fallbacks but distribution happens at the batch level, not here.
   */
  private async tryProviders(address: string, bias?: GeocodingBias): Promise<GeocodingResult | null> {
    const enabledProviders = this.providerManager.getEnabledProviders();
    const rateLimiter = getProviderRateLimiter();
    const providers = this.selectProvidersToTry(enabledProviders, rateLimiter);

    return this.iterateProviders(providers, address, bias);
  }

  /**
   * Try each candidate provider in order until one returns an acceptable
   * result. Shared by tryProviders and tryFallbackProviders so error
   * handling and validation can't drift between the primary and fallback
   * lookup paths.
   *
   * `revalidateAvailability` re-checks the rate limiter per provider — needed
   * by tryFallbackProviders since availability can go stale while earlier
   * providers in the loop were awaited. tryProviders skips this because
   * `selectProvidersToTry` already computed the exact list to attempt,
   * including the deliberate one-provider "wait out the backoff" case.
   */
  private async iterateProviders(
    providers: ProviderConfig[],
    address: string,
    bias: GeocodingBias | undefined,
    options: { skipProviderName?: string; revalidateAvailability?: boolean } = {}
  ): Promise<GeocodingResult | null> {
    const rateLimiter = getProviderRateLimiter();

    for (const provider of providers) {
      if (provider.name === options.skipProviderName) continue;
      if (options.revalidateAvailability === true && !rateLimiter.isAvailable(provider.name)) continue;

      try {
        const result = await this.tryProviderWithRetry(provider, address, bias);
        if (result != null) {
          // Validate per provider so an unacceptable result (low confidence,
          // bogus coordinates) falls through to the next provider instead of
          // failing the whole lookup.
          if (this.isResultAcceptable(result)) {
            return result;
          }
          logger.debug("Provider result failed validation, trying next provider", {
            provider: provider.name,
            addressHash: hashForLog(address),
          });
        }
      } catch (error) {
        // Always log — silently swallowing a provider failure hides which
        // provider is failing, especially during the fallback path.
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Geocoding failed with provider ${provider.name}`, {
          error: errorMessage,
          addressHash: hashForLog(address),
        });
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
    bias?: GeocodingBias,
    maxRetries: number = 1
  ): Promise<GeocodingResult | null> {
    const rateLimiter = getProviderRateLimiter();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.tryProvider(provider, address, bias);
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

  /** Only Nominatim-protocol geocoders accept extra params spread into an
   *  object query ({ q, countrycodes, viewbox, ... }). Photon/Google/OpenCage
   *  are string-only — node-geocoder/our wrapper would coerce the object to
   *  the literal query "[object Object]". */
  private supportsObjectQuery(provider: ProviderConfig): boolean {
    return provider.type === "nominatim" || provider.type === "locationiq";
  }

  private async tryProvider(
    provider: ProviderConfig,
    address: string,
    bias?: GeocodingBias
  ): Promise<GeocodingResult | null> {
    const rateLimiter = getProviderRateLimiter();
    await rateLimiter.waitForSlot(provider.name);

    // Use object form if provider has extra geocode params (bbox, country codes, etc.)
    const supportsParams = this.supportsObjectQuery(provider);
    const hasBias = (bias?.countryCodes?.length ?? 0) > 0 || bias?.viewBox != null;
    if (hasBias && !supportsParams && !this.biasWarnedProviders.has(provider.name)) {
      this.biasWarnedProviders.add(provider.name);
      logger.warn("Geocoding bias ignored: provider only accepts plain string queries", {
        provider: provider.name,
        providerType: provider.type,
      });
    }
    const geocodeParams = supportsParams ? this.buildGeocodeParams(provider, bias) : {};
    const query: string | Record<string, string | number> =
      Object.keys(geocodeParams).length > 0 ? { q: address, ...geocodeParams } : address;

    const results = await this.geocodeWithProvider(provider.geocoder, query);
    if (this.hasValidResults(results)) {
      const firstResult = results[0];
      if (firstResult) {
        return this.convertNodeGeocoderResult(firstResult, provider);
      }
    }
    return null;
  }

  async batchGeocode(addresses: string[], batchSize: number = 10, bias?: GeocodingBias): Promise<BatchGeocodingResult> {
    const results = new Map<string, GeocodingResult | GeocodingError>();
    const summary = { total: addresses.length, successful: 0, failed: 0, cached: 0 };

    const batches = this.createBatches(addresses, batchSize);

    for (const batch of batches) {
      const batchPromises = batch.map(async (address) => {
        try {
          const result = await this.geocodeDistributed(address, bias);
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

  private buildGeocodeParams(provider: ProviderConfig, bias?: GeocodingBias): Record<string, string | number> {
    return { ...provider.geocodeParams, ...this.buildBiasParams(bias) };
  }

  private buildBiasParams(bias?: GeocodingBias): Record<string, string | number> {
    const params: Record<string, string | number> = {};

    const countryCodes = bias?.countryCodes?.map((code) => code.trim().toLowerCase()).filter(Boolean) ?? [];
    if (countryCodes.length > 0) {
      params.countrycodes = countryCodes.join(",");
    }

    if (bias?.viewBox != null) {
      const { minLon, minLat, maxLon, maxLat } = bias.viewBox;
      params.viewbox = `${minLon},${minLat},${maxLon},${maxLat}`;
    }

    if (bias?.bounded != null) {
      params.bounded = bias.bounded ? 1 : 0;
    }

    return params;
  }

  async testConfiguration(
    testAddress = "1600 Amphitheatre Parkway, Mountain View, CA"
  ): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};

    // Admin-only endpoint — still hash the address to match the rest of the
    // service. Admins using the default fixture get a stable correlation hash.
    logger.info("Testing geocoding configuration", { addressHash: hashForLog(testAddress) });

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
            const geocodingResult = this.convertNodeGeocoderResult(firstResult, provider);
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
    geocoder: { geocode: (address: string | Record<string, string | number>) => Promise<Entry[]> },
    address: string | Record<string, string | number>
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

  private convertNodeGeocoderResult(result: Entry, provider: Pick<ProviderConfig, "name" | "type">): GeocodingResult {
    const confidence = this.calculateConfidence(result, provider.type);

    return {
      latitude: result.latitude!,
      longitude: result.longitude!,
      confidence,
      provider: provider.name,
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
    // node-geocoder maps Google's location_type to a 0-1 number
    // (ROOFTOP:1, RANGE_INTERPOLATED:0.9, GEOMETRIC_CENTER:0.7,
    // APPROXIMATE:0.5, unknown:0) — 0 means "unknown grade", not "bad".
    const googleConfidence = (result.extra as { confidence?: number })?.confidence;
    return typeof googleConfidence === "number" && googleConfidence > 0 ? googleConfidence : 0.6;
  }

  private calculateOpenCageConfidence(result: Entry): number {
    // OpenCage confidence is 0-10 (10 = <0.25km error, 1 = coarse,
    // 0 = "unable to determine error") — normalize to 0-1; treat the
    // unknown grade like other providers' default.
    const openCageConfidence = (result.extra as { confidence?: number })?.confidence;
    if (typeof openCageConfidence !== "number" || openCageConfidence === 0) return 0.6;
    return Math.min(openCageConfidence / 10, 1);
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

  // Switches on the provider TYPE literal — `name` is the free-text display
  // name ("Photon (VersaTiles)") and would always fall into the default,
  // flattening every provider's confidence to 0.7.
  private calculateConfidence(result: Entry, providerType: string): number {
    let confidence: number;

    switch (providerType) {
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

  // isValidCoordinate additionally rejects NaN and the Null Island region.
  // Providers do return (0,0) for input they cannot resolve; without this the
  // bogus point was cached, persisted onto the ingest job and rendered as a
  // real event in the Gulf of Guinea. Rejecting it here lets the next provider
  // take the address instead.
  private isResultAcceptable(result: GeocodingResult): boolean {
    return (result.confidence ?? 0) >= 0.5 && isValidCoordinate(result.latitude, result.longitude);
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}
