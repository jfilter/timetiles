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
        logger.warn("No geocoding providers found in database, using default configuration");
        this.providers = this.buildDefaultProviderConfigs();
      } else {
        logger.info(`Found ${providerResults.docs.length} providers in database`);
        this.initializeProvidersFromDocs(providerResults.docs);
      }

      // Configure rate limiter for each provider
      this.configureRateLimiter();

      return this.providers;
    } catch (error) {
      logger.error("Error loading providers from database", { error });
      logger.info("Falling back to default provider configuration");
      this.providers = this.buildDefaultProviderConfigs();
      this.configureRateLimiter();
      return this.providers;
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

  private buildDefaultProviderConfigs(): ProviderConfig[] {
    // Return only Nominatim as default fallback
    // Providers should be configured through the Payload admin panel
    return [this.createNominatimProviderConfig()];
  }

  private createNominatimProviderConfig(): ProviderConfig {
    return {
      name: "nominatim",
      geocoder: NodeGeocoder({
        provider: "openstreetmap",
        osmServer: NOMINATIM_BASE_URL,
        apiKey: undefined,
        formatter: null,
        fetch: this.createStatusCheckingFetch(),
        // as unknown as Options: @types/node-geocoder expects node-fetch Response,
        // but we pass standard web fetch — the runtime behavior is compatible.
      } as unknown as Options),
      priority: 10,
      enabled: true,
      rateLimit: DEFAULT_NOMINATIM_RATE_LIMIT,
    };
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
    defaultRateLimit: number = 10
  ): ProviderConfig {
    return {
      name: doc.name ?? doc.type,
      geocoder,
      priority: doc.priority ?? defaultPriority,
      enabled: doc.enabled ?? false,
      rateLimit: doc.rateLimit ?? defaultRateLimit,
      group: doc.group ?? undefined,
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
        return geocoder ? this.createProviderEntry(doc, geocoder, 5, 2) : null;
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

  private createGoogleGeocoder(doc: GeocodingProvider): NodeGeocoder.Geocoder | null {
    const googleConfig = doc.config?.google;
    if (
      googleConfig?.apiKey == null ||
      googleConfig?.apiKey == undefined ||
      (typeof googleConfig.apiKey === "string" && googleConfig.apiKey.trim() === "")
    ) {
      logger.warn(`Google provider ${doc.name} has no API key configured`);
      return null;
    }

    return NodeGeocoder({
      provider: "google",
      apiKey: googleConfig.apiKey,
      formatter: null,
      fetch: this.createStatusCheckingFetch(),
    } as unknown as Options);
  }

  private createNominatimGeocoder(doc: GeocodingProvider): NodeGeocoder.Geocoder {
    const nominatimConfig = doc.config?.nominatim;
    const baseUrl = nominatimConfig?.baseUrl ?? NOMINATIM_BASE_URL;
    const userAgent = nominatimConfig?.userAgent ?? TIMETILES_USER_AGENT;

    logger.debug("Creating Nominatim geocoder", { baseUrl, userAgent });

    return NodeGeocoder({
      provider: "openstreetmap",
      osmServer: baseUrl,
      apiKey: undefined,
      formatter: null,
      fetch: this.createStatusCheckingFetch(userAgent),
      // as unknown as Options: @types/node-geocoder expects node-fetch Response,
      // but we pass standard web fetch — the runtime behavior is compatible.
    } as unknown as Options);
  }

  private getOpenCageBoundsString(
    bounds:
      | {
          enabled?: boolean | null;
          southwest?: { lat?: number | null; lng?: number | null };
          northeast?: { lat?: number | null; lng?: number | null };
        }
      | undefined
  ): string | null {
    if (!bounds?.enabled) return null;
    const { southwest, northeast } = bounds;
    if (southwest?.lat == null || southwest?.lng == null) return null;
    if (northeast?.lat == null || northeast?.lng == null) return null;
    return `${southwest.lat},${southwest.lng},${northeast.lat},${northeast.lng}`;
  }

  private createOpenCageGeocoder(doc: GeocodingProvider): NodeGeocoder.Geocoder | null {
    const openCageConfig = (doc.config as Record<string, unknown>)?.opencage as Record<string, unknown> | undefined;
    if (
      openCageConfig?.apiKey == null ||
      openCageConfig?.apiKey == undefined ||
      (typeof openCageConfig?.apiKey === "string" && openCageConfig.apiKey.trim() === "")
    ) {
      logger.warn(`OpenCage provider ${doc.name} has no API key configured`);
      return null;
    }

    const config: { provider: "opencage"; apiKey: unknown; formatter: null; bounds?: string } = {
      provider: "opencage",
      apiKey: openCageConfig.apiKey,
      formatter: null,
    };

    const boundsString = this.getOpenCageBoundsString(
      openCageConfig.bounds as Parameters<ProviderManager["getOpenCageBoundsString"]>[0]
    );
    if (boundsString) {
      config.bounds = boundsString;
    }

    return NodeGeocoder({ ...config, fetch: this.createStatusCheckingFetch() } as unknown as Options);
  }

  private createLocationIQGeocoder(doc: GeocodingProvider): NodeGeocoder.Geocoder | null {
    const locationiqConfig = doc.config?.locationiq;
    if (
      locationiqConfig?.apiKey == null ||
      locationiqConfig?.apiKey == undefined ||
      (typeof locationiqConfig.apiKey === "string" && locationiqConfig.apiKey.trim() === "")
    ) {
      logger.warn(`LocationIQ provider ${doc.name} has no API key configured`);
      return null;
    }

    return NodeGeocoder({
      provider: "locationiq",
      apiKey: locationiqConfig.apiKey,
      formatter: null,
      fetch: this.createStatusCheckingFetch(),
    } as unknown as Options);
  }

  private createPhotonGeocoderInstance(doc: GeocodingProvider): NodeGeocoder.Geocoder {
    const photonConfig = doc.config?.photon;
    if (!photonConfig?.baseUrl) {
      logger.warn(`Photon provider ${doc.name} has no base URL configured`);
      return createPhotonGeocoder({ baseUrl: "https://photon.komoot.io" }) as unknown as NodeGeocoder.Geocoder;
    }

    logger.debug("Creating Photon geocoder", { baseUrl: photonConfig.baseUrl });

    const locationBias = photonConfig.locationBias;
    const bbox = photonConfig.bbox;

    return createPhotonGeocoder({
      baseUrl: photonConfig.baseUrl,
      language: photonConfig.language ?? undefined,
      limit: photonConfig.limit ?? 5,
      locationBias:
        locationBias?.enabled && locationBias.lat != null && locationBias.lon != null
          ? { lat: locationBias.lat, lon: locationBias.lon, zoom: locationBias.zoom ?? undefined }
          : undefined,
      bbox:
        bbox?.enabled && bbox.minLon != null && bbox.minLat != null && bbox.maxLon != null && bbox.maxLat != null
          ? { minLon: bbox.minLon, minLat: bbox.minLat, maxLon: bbox.maxLon, maxLat: bbox.maxLat }
          : undefined,
      osmTag: photonConfig.osmTag ?? undefined,
      layer: (photonConfig.layer as string[] | undefined)?.length ? (photonConfig.layer as string[]) : undefined,
    }) as unknown as NodeGeocoder.Geocoder;
  }
}
