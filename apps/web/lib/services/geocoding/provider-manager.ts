/**
 * Loads geocoding providers from Payload and initializes their adapters.
 *
 * Applies tag filtering, provider priority, and process-local rate-limit configuration.
 * Providers must be configured in the geocoding-providers collection.
 *
 * @module
 */
import NodeGeocoder, { type Options } from "node-geocoder";
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { createLogger } from "@/lib/logger";
import { defaultIfEmpty } from "@/lib/utils/strings";
import type { GeocodingProvider } from "@/payload-types";

import { createPhotonGeocoder } from "./photon-geocoder";
import { getProviderRateLimiter } from "./provider-rate-limiter";
import type { GeocodingAdapter, GeocodingSettings, ProviderConfig } from "./types";
import {
  DEFAULT_NOMINATIM_RATE_LIMIT,
  GEOCODING_ERROR_CODES,
  GeocodingError,
  NOMINATIM_BASE_URL,
  retryAfterMillisecondsSchema,
  TIMETILES_USER_AGENT,
} from "./types";

const logger = createLogger("geocoding-provider-manager");

export class ProviderManager {
  private providers: ProviderConfig[] = [];
  private readonly payload: Payload;
  private readonly settings: GeocodingSettings | null = null;

  constructor(payload: Payload, settings: GeocodingSettings | null) {
    this.payload = payload;
    this.settings = settings;
  }

  async loadProviders(): Promise<ProviderConfig[]> {
    try {
      const strategy = this.settings?.providerSelection?.strategy;
      const requiredTags = this.settings?.providerSelection?.requiredTags ?? [];

      // Filter providers based on strategy
      let whereClause = {};
      if (strategy === "tag-based" && requiredTags.length > 0) {
        whereClause = { tags: { in: requiredTags } };
      }

      const providerResults = await this.payload.find({
        collection: COLLECTION_NAMES.GEOCODING_PROVIDERS,
        overrideAccess: true,
        where: whereClause,
        limit: 100,
        pagination: false,
      });

      if (providerResults.docs.length === 0) {
        throw new Error(
          "No geocoding providers configured. Add providers at /dashboard/collections/geocoding-providers"
        );
      }

      logger.info(`Found ${providerResults.docs.length} providers in database`);
      this.initializeProvidersFromDocs(providerResults.docs);
      this.configureRateLimiter();

      return this.providers;
    } catch (error) {
      if (error instanceof Error && error.message.includes("No geocoding providers configured")) {
        throw error;
      }
      logger.error("Error loading providers from database", { error });
      throw new Error("Failed to load geocoding providers from database");
    }
  }

  getEnabledProviders(): ProviderConfig[] {
    const enabledProviders = this.providers.filter((p) => p.enabled);
    if (enabledProviders.length === 0) {
      throw new Error("No enabled geocoding providers available");
    }
    // Sort by priority (lower number = higher priority)
    return enabledProviders.sort((a, b) => a.priority - b.priority);
  }

  getProviders(): ProviderConfig[] {
    return this.providers;
  }

  /**
   * Configure the rate limiter with rate limits from all loaded providers.
   */
  private configureRateLimiter(): void {
    const rateLimiter = getProviderRateLimiter();
    for (const provider of this.providers) {
      rateLimiter.configure(provider.name, provider.rateLimit);
    }
    logger.debug("Configured rate limiter for providers", {
      providers: this.providers.map((p) => ({ name: p.name, rateLimit: p.rateLimit })),
    });
  }

  /**
   * Creates a fetch wrapper that sets User-Agent and intercepts HTTP error status codes
   * (429, 503) before node-geocoder's fetch adapter can silently parse them as valid JSON.
   * Used for all node-geocoder-based providers.
   */
  private createStatusCheckingFetch(userAgent: string = TIMETILES_USER_AGENT): typeof fetch {
    return async (url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("User-Agent", userAgent);
      const response = await fetch(url, { ...init, headers });

      if (response.status === 429) {
        const retryAfterMs = retryAfterMillisecondsSchema.safeParse(response.headers.get("Retry-After")).data;
        throw new GeocodingError("Rate limited", GEOCODING_ERROR_CODES.RATE_LIMITED, true, 429, retryAfterMs);
      }
      if (response.status === 503) {
        throw new GeocodingError("Service unavailable", GEOCODING_ERROR_CODES.SERVICE_UNAVAILABLE, true, 503);
      }
      if (!response.ok) {
        throw new GeocodingError(
          `Provider returned HTTP ${response.status}`,
          GEOCODING_ERROR_CODES.SERVICE_UNAVAILABLE,
          response.status >= 500,
          response.status
        );
      }

      return response;
    };
  }

  // Helper method to check if provider doc is valid
  private isProviderDocValid(doc: GeocodingProvider): boolean {
    return doc.enabled === true && doc.type != null;
  }

  // Helper method to create provider entry
  private createProviderEntry(
    doc: GeocodingProvider,
    geocoder: GeocodingAdapter,
    defaultPriority: number,
    defaultRateLimit: number = 10,
    geocodeParams?: Record<string, string | number>
  ): ProviderConfig {
    return {
      name: doc.name ?? doc.type,
      type: doc.type,
      geocoder,
      priority: doc.priority ?? defaultPriority,
      enabled: doc.enabled ?? false,
      rateLimit: doc.rateLimit ?? defaultRateLimit,
      group: doc.group ?? undefined,
      geocodeParams,
    };
  }

  // Helper method to initialize a single provider
  private initializeSingleProvider(doc: GeocodingProvider): void {
    if (!this.isProviderDocValid(doc)) {
      logger.debug(`Skipping disabled or invalid provider: ${doc.name}`);
      return;
    }

    try {
      const result = this.createGeocoderForType(doc);
      if (result) {
        this.providers.push(result);
      }
    } catch (error) {
      logger.error("Failed to initialize provider", { error, providerId: doc.id, providerType: doc.type });
    }
  }

  // Rate defaults below are local pacing settings, not provider quotas or usage permission.
  private createGeocoderForType(doc: GeocodingProvider): ProviderConfig | null {
    switch (doc.type) {
      case "google": {
        const geocoder = this.createGoogleGeocoder(doc);
        return geocoder ? this.createProviderEntry(doc, geocoder, 1, 50) : null;
      }
      case "locationiq": {
        const geocoder = this.createLocationIQGeocoder(doc);
        return geocoder ? this.createProviderEntry(doc, geocoder, 5, 2, this.buildGeocodeParams(doc)) : null;
      }
      case "opencage": {
        const geocoder = this.createOpenCageGeocoder(doc);
        return geocoder ? this.createProviderEntry(doc, geocoder, 5, 10) : null;
      }
      case "nominatim": {
        const geocoder = this.createNominatimGeocoder(doc);
        return this.createProviderEntry(doc, geocoder, 10, DEFAULT_NOMINATIM_RATE_LIMIT);
      }
      case "photon": {
        const geocoder = this.createPhotonGeocoderInstance(doc);
        return this.createProviderEntry(doc, geocoder, 10, 10);
      }
      default:
        logger.warn(`Unknown provider type: ${String(doc.type)}`);
        return null;
    }
  }

  private initializeProvidersFromDocs(docs: GeocodingProvider[]): void {
    this.providers = [];
    docs.forEach((doc) => this.initializeSingleProvider(doc));
  }

  /** Extract the first country code from the comma-separated list (for providers that only accept one). */
  private getFirstCountryCode(doc: GeocodingProvider): string | undefined {
    return doc.countryCodes?.split(",")[0]?.trim() ?? undefined;
  }

  /** Convert generic boundingBox to "minLon,minLat,maxLon,maxLat" (OpenCage/Nominatim viewbox format). */
  private getViewboxString(doc: GeocodingProvider): string | undefined {
    const bb = doc.boundingBox;
    if (!bb?.enabled || bb.minLon == null || bb.minLat == null || bb.maxLon == null || bb.maxLat == null) {
      return undefined;
    }
    return `${bb.minLon},${bb.minLat},${bb.maxLon},${bb.maxLat}`;
  }

  /** Build geocodeParams for providers that need object-form geocode() calls. */
  private buildGeocodeParams(doc: GeocodingProvider): Record<string, string | number> | undefined {
    const params: Record<string, string | number> = {};

    const viewbox = this.getViewboxString(doc);
    if (viewbox) {
      params.viewbox = viewbox;
      params.bounded = 1;
    }
    if (doc.countryCodes) {
      params.countrycodes = doc.countryCodes;
    }
    if (doc.language) {
      params["accept-language"] = doc.language;
    }

    return Object.keys(params).length > 0 ? params : undefined;
  }

  /** Check if the doc has a valid API key. */
  private hasApiKey(doc: GeocodingProvider): boolean {
    return typeof doc.apiKey === "string" && doc.apiKey.trim() !== "";
  }

  /** Bind a fresh transport to each request so concurrent abort signals cannot leak. */
  private createNodeGeocoder(options: Options): GeocodingAdapter {
    return {
      geocode: (query, signal) => {
        const requestOptions = { ...options, signal };
        return NodeGeocoder(requestOptions).geocode(query);
      },
    };
  }

  private createGoogleGeocoder(doc: GeocodingProvider): GeocodingAdapter | null {
    if (!this.hasApiKey(doc)) {
      logger.warn(`Google provider ${doc.name} has no API key configured`);
      return null;
    }

    return this.createNodeGeocoder({
      provider: "google",
      apiKey: doc.apiKey,
      language: doc.language ?? undefined,
      region: this.getFirstCountryCode(doc),
      formatter: null,
      fetch: this.createStatusCheckingFetch(doc.userAgent ?? undefined),
    } as unknown as Options);
  }

  private createNominatimGeocoder(doc: GeocodingProvider): GeocodingAdapter {
    // These fields have defaults but an admin can clear them to "", which `??`
    // would keep — an empty osmServer breaks every request and an empty
    // User-Agent gets the provider blocked (Nominatim/Photon require one).
    // defaultIfEmpty falls back on "" too.
    const baseUrl = defaultIfEmpty(doc.baseUrl, NOMINATIM_BASE_URL);
    const userAgent = defaultIfEmpty(doc.userAgent, TIMETILES_USER_AGENT);

    const viewbox = this.getViewboxString(doc);
    return this.createNodeGeocoder({
      provider: "openstreetmap",
      osmServer: baseUrl,
      language: doc.language ?? undefined,
      ...(viewbox ? { viewbox, bounded: doc.boundingBox?.enabled ? 1 : 0 } : {}),
      ...(doc.countryCodes ? { countrycodes: doc.countryCodes } : {}),
      apiKey: undefined,
      formatter: null,
      fetch: this.createStatusCheckingFetch(userAgent),
    } as unknown as Options);
  }

  private createOpenCageGeocoder(doc: GeocodingProvider): GeocodingAdapter | null {
    if (!this.hasApiKey(doc)) {
      logger.warn(`OpenCage provider ${doc.name} has no API key configured`);
      return null;
    }

    // node-geocoder's OpenCage wrapper has no proximity passthrough (its
    // object-query shape is {address, bounds, countryCode, ...}), so a
    // configured lat/lon bias cannot be sent. Warn instead of silently
    // dropping the admin's setting; bounding box + country bias DO apply via
    // the constructor options below.
    const bias = doc.locationBias;
    if (bias?.enabled && bias.lat != null && bias.lon != null) {
      logger.warn("OpenCage does not support lat/lon location bias; configure a bounding box instead", {
        provider: doc.name,
      });
    }

    return this.createNodeGeocoder({
      provider: "opencage",
      apiKey: doc.apiKey,
      language: doc.language ?? undefined,
      countryCode: this.getFirstCountryCode(doc),
      bounds: this.getViewboxString(doc),
      formatter: null,
      fetch: this.createStatusCheckingFetch(doc.userAgent ?? undefined),
    } as unknown as Options);
  }

  private createLocationIQGeocoder(doc: GeocodingProvider): GeocodingAdapter | null {
    if (!this.hasApiKey(doc)) {
      logger.warn(`LocationIQ provider ${doc.name} has no API key configured`);
      return null;
    }

    return this.createNodeGeocoder({
      provider: "locationiq",
      apiKey: doc.apiKey,
      formatter: null,
      fetch: this.createStatusCheckingFetch(doc.userAgent ?? undefined),
    } as unknown as Options);
  }

  /** Convert generic locationBias to Photon format. */
  private getLocationBias(doc: GeocodingProvider): { lat: number; lon: number; zoom?: number } | undefined {
    const bias = doc.locationBias;
    if (!bias?.enabled || bias.lat == null || bias.lon == null) return undefined;
    return { lat: bias.lat, lon: bias.lon, zoom: bias.zoom ?? undefined };
  }

  /** Convert generic boundingBox to Photon bbox format. */
  private getBoundingBox(
    doc: GeocodingProvider
  ): { minLon: number; minLat: number; maxLon: number; maxLat: number } | undefined {
    const bb = doc.boundingBox;
    if (!bb?.enabled || bb.minLon == null || bb.minLat == null || bb.maxLon == null || bb.maxLat == null) {
      return undefined;
    }
    return { minLon: bb.minLon, minLat: bb.minLat, maxLon: bb.maxLon, maxLat: bb.maxLat };
  }

  private createPhotonGeocoderInstance(doc: GeocodingProvider): GeocodingAdapter {
    const baseUrl = defaultIfEmpty(doc.baseUrl, "https://photon.komoot.io");

    return createPhotonGeocoder({
      baseUrl,
      language: doc.language ?? undefined,
      limit: doc.resultLimit ?? 5,
      locationBias: this.getLocationBias(doc),
      bbox: this.getBoundingBox(doc),
      osmTag: doc.config?.photon?.osmTag ?? undefined,
      layer: (doc.config?.photon?.layer as string[] | undefined)?.length
        ? (doc.config?.photon?.layer as string[])
        : undefined,
    });
  }
}
