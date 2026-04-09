/**
 * Manages the geocoding providers for the application.
 *
 * This class is responsible for loading geocoding provider configurations from the database
 * (or falling back to default environment variable-based configurations). It initializes
 * instances of the `node-geocoder` library for each active provider and makes them
 * available to the rest of the geocoding service.
 *
 * It handles the logic for selecting and prioritizing providers based on the system's
 * settings, ensuring that the geocoding operations can be performed in a configured,
 * resilient, and orderly manner.
 *
 * @module
 */
import NodeGeocoder, { type Options } from "node-geocoder";
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { createLogger } from "@/lib/logger";
import type { GeocodingProvider } from "@/payload-types";

import { createPhotonGeocoder } from "./photon-geocoder";
import { getProviderRateLimiter } from "./provider-rate-limiter";
import type { GeocodingSettings, ProviderConfig } from "./types";
import {
  DEFAULT_NOMINATIM_RATE_LIMIT,
  GEOCODING_ERROR_CODES,
  GeocodingError,
  NOMINATIM_BASE_URL,
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
        const retryAfter = response.headers.get("Retry-After");
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
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
    geocoder: NodeGeocoder.Geocoder,
    defaultPriority: number,
    defaultRateLimit: number = 10,
    geocodeParams?: Record<string, string | number>
  ): ProviderConfig {
    return {
      name: doc.name ?? doc.type,
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
      logger.error(`Failed to initialize provider ${doc.name}`, { error, provider: doc });
    }
  }

  // Helper method to create geocoder based on type
  // Default rate limits per provider type (if not configured in DB):
  // - Google: 50 req/sec (paid API, generous limits)
  // - LocationIQ: 2 req/sec (free tier)
  // - OpenCage: 10 req/sec (varies by plan)
  // - Nominatim: 1 req/sec (OSM usage policy)
  // - Photon: 10 req/sec (no published limit — fair use)
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
        const result = this.createOpenCageGeocoder(doc);
        if (!result) return null;
        return this.createProviderEntry(doc, result.geocoder, 5, 10, result.geocodeParams);
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

  private createGoogleGeocoder(doc: GeocodingProvider): NodeGeocoder.Geocoder | null {
    if (!this.hasApiKey(doc)) {
      logger.warn(`Google provider ${doc.name} has no API key configured`);
      return null;
    }

    return NodeGeocoder({
      provider: "google",
      apiKey: doc.apiKey,
      language: doc.language ?? undefined,
      region: this.getFirstCountryCode(doc),
      formatter: null,
      fetch: this.createStatusCheckingFetch(doc.userAgent ?? undefined),
    } as unknown as Options);
  }

  private createNominatimGeocoder(doc: GeocodingProvider): NodeGeocoder.Geocoder {
    const baseUrl = doc.baseUrl ?? NOMINATIM_BASE_URL;
    const userAgent = doc.userAgent ?? TIMETILES_USER_AGENT;

    logger.debug("Creating Nominatim geocoder", { baseUrl, userAgent });

    const viewbox = this.getViewboxString(doc);
    return NodeGeocoder({
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

  private createOpenCageGeocoder(
    doc: GeocodingProvider
  ): { geocoder: NodeGeocoder.Geocoder; geocodeParams?: Record<string, string | number> } | null {
    if (!this.hasApiKey(doc)) {
      logger.warn(`OpenCage provider ${doc.name} has no API key configured`);
      return null;
    }

    const bias = doc.locationBias;
    const geocodeParams =
      bias?.enabled && bias.lat != null && bias.lon != null ? { proximity: `${bias.lat},${bias.lon}` } : undefined;

    const geocoder = NodeGeocoder({
      provider: "opencage",
      apiKey: doc.apiKey,
      language: doc.language ?? undefined,
      countryCode: this.getFirstCountryCode(doc),
      bounds: this.getViewboxString(doc),
      formatter: null,
      fetch: this.createStatusCheckingFetch(doc.userAgent ?? undefined),
    } as unknown as Options);

    return { geocoder, geocodeParams };
  }

  private createLocationIQGeocoder(doc: GeocodingProvider): NodeGeocoder.Geocoder | null {
    if (!this.hasApiKey(doc)) {
      logger.warn(`LocationIQ provider ${doc.name} has no API key configured`);
      return null;
    }

    return NodeGeocoder({
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

  private createPhotonGeocoderInstance(doc: GeocodingProvider): NodeGeocoder.Geocoder {
    const baseUrl = doc.baseUrl ?? "https://photon.komoot.io";

    logger.debug("Creating Photon geocoder", { baseUrl });

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
    }) as unknown as NodeGeocoder.Geocoder;
  }
}
