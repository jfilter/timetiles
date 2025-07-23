import NodeGeocoder, { type Entry } from "node-geocoder";
import type { Payload } from "payload";
import type {
  Config,
  GeocodingProvider,
  LocationCache,
} from "../../../payload-types";
import { createLogger, logError, logPerformance } from "../../logger";
import type { Where } from "payload";

const logger = createLogger("geocoding-service");

export interface GeocodingResult
  extends Pick<
    LocationCache,
    "latitude" | "longitude" | "confidence" | "provider" | "normalizedAddress"
  > {
  components: LocationCache["components"];
  metadata: LocationCache["metadata"];
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

interface ProviderConfig {
  name: string;
  geocoder: NodeGeocoder.Geocoder;
  priority: number;
  enabled: boolean;
}

interface GeocodingSettings {
  enabled: boolean;
  fallbackEnabled: boolean;
  providerSelection: {
    strategy: string;
    requiredTags: string[];
  };
  caching: {
    enabled: boolean;
    ttlDays: number;
  };
}

export class GeocodingService {
  private providers: ProviderConfig[] = [];
  private payload: Payload;
  private settings: GeocodingSettings | null = null;
  private initialized = false;

  constructor(payload: Payload) {
    this.payload = payload;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info("Initializing geocoding service");

    try {
      // Load settings from database
      await this.loadSettings();
      logger.info("Settings loaded successfully");

      // Load and initialize providers from collection
      await this.loadProviders();
      logger.info(`Loaded ${this.providers.length} providers`);

      // Sort providers by priority
      this.providers.sort((a, b) => a.priority - b.priority);

      this.initialized = true;

      logger.info(
        {
          activeProviders: this.providers
            .filter((p) => p.enabled)
            .map((p) => p.name),
          totalProviders: this.providers.length,
        },
        "Geocoding service initialized",
      );
    } catch (error) {
      logger.error({ error }, "Failed to initialize geocoding service");
      throw error;
    }
  }

  private async loadSettings(): Promise<void> {
    // Use environment variables or defaults instead of globals
    logger.info("Loading geocoding settings from environment");
    this.settings = {
      enabled: process.env.GEOCODING_ENABLED !== "false",
      fallbackEnabled: process.env.GEOCODING_FALLBACK_ENABLED !== "false",
      providerSelection: {
        strategy: process.env.GEOCODING_PROVIDER_STRATEGY || "priority",
        requiredTags: process.env.GEOCODING_REQUIRED_TAGS?.split(",") || [],
      },
      caching: {
        enabled: process.env.GEOCODING_CACHING_ENABLED !== "false",
        ttlDays: parseInt(process.env.GEOCODING_CACHE_TTL_DAYS || "365"),
      },
    };
  }

  private async loadProviders(): Promise<void> {
    const strategy = this.settings?.providerSelection?.strategy || "priority";
    const requiredTags = this.settings?.providerSelection?.requiredTags || [];

    // Query providers from collection
    const query: {
      collection: keyof Config["collections"];
      where: Where;
      limit: number;
    } = {
      collection: "geocoding-providers",
      where: {
        enabled: { equals: true },
      },
      limit: 1000,
    };

    // Add tag filtering if using tag-based strategy
    if (strategy === "tag-based" && requiredTags.length > 0) {
      query.where.tags = { in: requiredTags };
    }

    try {
      logger.info({ query }, "Querying providers from collection");
      const providerResults = await this.payload.find(query);
      logger.info(
        `Found ${providerResults.docs.length} providers in collection`,
      );

      if (providerResults.docs.length === 0) {
        logger.info("No providers found, creating default providers");
        // Create default providers from environment variables
        await this.createDefaultProviders();
        // Re-query
        const newResults = await this.payload.find(query);
        logger.info(
          `After creating defaults, found ${newResults.docs.length} providers`,
        );
        this.initializeProvidersFromDocs(
          newResults.docs as GeocodingProvider[],
        );
      } else {
        this.initializeProvidersFromDocs(
          providerResults.docs as GeocodingProvider[],
        );
      }
    } catch (error) {
      logger.warn(
        { error },
        "Failed to query geocoding providers, using hardcoded defaults",
      );
      // Fallback to hardcoded providers if collection query fails
      const hardcodedProviders = [
        {
          name: "Default Nominatim",
          type: "nominatim",
          enabled: true,
          priority: 1,
          rateLimit: 1,
          config: {
            nominatim: {
              baseUrl: "https://nominatim.openstreetmap.org",
              userAgent: "TimeTiles-Test/1.0",
              addressdetails: true,
            },
          },
          tags: ["testing"],
        },
      ];
      logger.info(
        `Using ${hardcodedProviders.length} hardcoded providers as fallback`,
      );
      this.initializeProvidersFromDocs(
        hardcodedProviders as GeocodingProvider[],
      );
    }
  }

  private async createDefaultProviders(): Promise<void> {
    const defaultProviders = [];

    // Add Google provider if API key is available
    if (process.env.GOOGLE_MAPS_API_KEY) {
      defaultProviders.push({
        name: "Google Maps (Default)",
        type: "google" as const,
        enabled: true,
        priority: 1,
        rateLimit: 50,
        config: {
          google: {
            apiKey: process.env.GOOGLE_MAPS_API_KEY,
            language: "en",
          },
        },
        tags: ["primary" as const, "production" as const],
      });
    }

    // Add default Nominatim provider
    defaultProviders.push({
      name: "Nominatim (Default)",
      type: "nominatim" as const,
      enabled: true,
      priority: process.env.GOOGLE_MAPS_API_KEY ? 2 : 1,
      rateLimit: 1,
      config: {
        nominatim: {
          baseUrl: "https://nominatim.openstreetmap.org",
          userAgent: "TimeTiles-App/1.0",
          addressdetails: true,
          extratags: false,
        },
      },
      tags: ["primary" as const, "free-tier" as const],
    });

    // Add OpenCage provider if API key is available
    if (process.env.OPENCAGE_API_KEY) {
      defaultProviders.push({
        name: "OpenCage (Default)",
        type: "opencage" as const,
        enabled: true,
        priority: 3,
        rateLimit: 10,
        config: {
          opencage: {
            apiKey: process.env.OPENCAGE_API_KEY,
            language: "en",
            annotations: true,
            abbrv: false,
          },
        },
        tags: ["primary" as const],
      });
    }

    // Create providers in database
    for (const provider of defaultProviders) {
      try {
        await this.payload.create({
          collection: "geocoding-providers",
          data: provider,
        });
        logger.info(`Created default provider: ${provider.name}`);
      } catch (error) {
        logger.warn(
          { error, provider: provider.name },
          "Failed to create default provider",
        );
      }
    }
  }

  private initializeProvidersFromDocs(docs: GeocodingProvider[]): void {
    logger.info(`Initializing ${docs.length} providers from docs`);

    for (const doc of docs) {
      if (!doc.enabled || !doc.type) {
        logger.warn(`Skipping disabled or invalid provider: ${doc.name}`);
        continue;
      }

      try {
        logger.info(
          `Initializing provider '${doc.name}' of type '${doc.type}'`,
        );
        let geocoder: NodeGeocoder.Geocoder;

        switch (doc.type) {
          case "google":
            if (!doc.config?.google?.apiKey) {
              logger.warn(`Google provider '${doc.name}' missing API key`);
              continue;
            }
            logger.info(`Creating Google geocoder for '${doc.name}'`);
            geocoder = NodeGeocoder({
              provider: "google",
              apiKey: doc.config.google.apiKey,
              formatter: null,
              region: doc.config.google.region ?? undefined,
              language: doc.config.google.language ?? "en",
            });
            break;

          case "nominatim": {
            const nominatimConfig = doc.config?.nominatim || {};
            logger.info(`Creating Nominatim geocoder for '${doc.name}'`);
            geocoder = NodeGeocoder({
              provider: "openstreetmap",
              formatter: null,
              osmServer:
                (nominatimConfig as any).baseUrl ||
                "https://nominatim.openstreetmap.org",
              countrycodes: (nominatimConfig as any).countrycodes,
              addressdetails: (nominatimConfig as any).addressdetails !== false,
              extratags: (nominatimConfig as any).extratags === true,
            } as NodeGeocoder.Options);
            break;
          }

          case "opencage": {
            if (!doc.config?.opencage?.apiKey) {
              logger.warn(`OpenCage provider '${doc.name}' missing API key`);
              continue;
            }
            logger.info(`Creating OpenCage geocoder for '${doc.name}'`);
            const opencageConfig = doc.config.opencage;
            const geocoderOptions: NodeGeocoder.Options = {
              provider: "opencage",
              apiKey: opencageConfig.apiKey,
              formatter: null,
              language: opencageConfig.language || "en",
            } as NodeGeocoder.Options;

            // Add bounds if configured
            if (
              opencageConfig.bounds?.enabled &&
              opencageConfig.bounds.southwest &&
              opencageConfig.bounds.northeast
            ) {
              const { southwest, northeast } = opencageConfig.bounds;
              if (
                southwest.lat != null &&
                southwest.lng != null &&
                northeast.lat != null &&
                northeast.lng != null
              ) {
                (geocoderOptions as any).bounds =
                  `${southwest.lat},${southwest.lng},${northeast.lat},${northeast.lng}`;
              }
            }

            geocoder = NodeGeocoder(geocoderOptions);
            break;
          }

          default:
            logger.warn(`Unknown provider type: ${doc.type}`);
            continue;
        }

        this.providers.push({
          name: doc.name,
          geocoder,
          priority: doc.priority || 1,
          enabled: true,
        });

        logger.info(
          `Successfully initialized provider '${doc.name}' (${doc.type})`,
        );
      } catch (error) {
        logger.error(
          { error, providerName: doc.name, providerType: doc.type },
          `Failed to initialize provider '${doc.name}'`,
        );
      }
    }

    logger.info(
      `Finished initializing providers. Total: ${this.providers.length} active providers`,
    );
  }

  async geocode(address: string): Promise<GeocodingResult> {
    await this.initialize();

    const startTime = Date.now();
    logger.debug({ address }, "Starting geocoding request");

    try {
      // Check cache first
      if (this.settings?.caching?.enabled) {
        const cached = await this.getCachedResult(address);
        if (cached) {
          await this.updateCacheHit(cached.id);
          logPerformance("Geocoding (cache hit)", Date.now() - startTime, {
            address,
          });

          return this.convertCachedResult(cached);
        }
      }

      // Try providers in order
      const enabledProviders = this.providers.filter((p) => p.enabled);

      if (enabledProviders.length === 0) {
        throw new GeocodingError(
          "No geocoding providers available",
          "NO_PROVIDERS_AVAILABLE",
        );
      }

      for (const provider of enabledProviders) {
        try {
          logger.debug(
            { provider: provider.name, address },
            "Attempting geocoding",
          );

          // Add timeout to prevent hanging
          const geocodePromise = provider.geocoder.geocode(address);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Provider timeout")), 10000),
          );

          const results = (await Promise.race([
            geocodePromise,
            timeoutPromise,
          ])) as Entry[];

          if (results && results.length > 0 && results[0]) {
            const result = this.convertNodeGeocoderResult(
              results[0],
              provider.name,
            );

            if (this.isResultAcceptable(result)) {
              logger.info(
                {
                  provider: provider.name,
                  address,
                  confidence: result.confidence,
                  coordinates: { lat: result.latitude, lng: result.longitude },
                },
                "Geocoding successful",
              );

              // Cache the result
              if (this.settings?.caching?.enabled) {
                await this.cacheResult(address, result);
              }

              logPerformance("Geocoding (API call)", Date.now() - startTime, {
                address,
                provider: provider.name,
              });

              return result;
            }
          }
        } catch (error) {
          logger.warn(
            { error, provider: provider.name, address },
            "Provider failed",
          );

          // If fallback is disabled, throw error
          if (!this.settings?.fallbackEnabled) {
            throw error;
          }
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
      logError(error, "Unexpected geocoding error", { address });
      throw new GeocodingError(
        `Geocoding error: ${(error as Error).message}`,
        "UNKNOWN_ERROR",
        true,
      );
    }
  }

  async batchGeocode(
    addresses: string[],
    batchSize: number = 10,
  ): Promise<BatchGeocodingResult> {
    await this.initialize();

    const startTime = Date.now();
    logger.info(
      { addressCount: addresses.length, batchSize },
      "Starting batch geocoding",
    );

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

      // Rate limiting between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(1000);
      }
    }

    logger.info(
      {
        total: addresses.length,
        successful: totalSuccessful,
        failed: totalFailed,
        cached: totalCached,
        duration: Date.now() - startTime,
      },
      "Batch geocoding completed",
    );

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

  async testConfiguration(
    testAddress?: string,
  ): Promise<Record<string, unknown>> {
    await this.initialize();

    const address = testAddress || "London, UK";
    const results: Record<string, unknown> = {};

    for (const provider of this.providers.filter((p) => p.enabled)) {
      try {
        // Add timeout to prevent hanging
        const geocodePromise = provider.geocoder.geocode(address);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Geocoding timeout")), 5000),
        );

        const geocodeResults = (await Promise.race([
          geocodePromise,
          timeoutPromise,
        ])) as Entry[];
        const result = geocodeResults[0];

        if (result) {
          results[provider.name] = {
            success: true,
            result: {
              latitude: result.latitude,
              longitude: result.longitude,
              confidence: this.calculateConfidence(result, provider.name),
              normalizedAddress: result.formattedAddress || address,
            },
          };
        } else {
          results[provider.name] = {
            success: false,
            error: "No results found",
          };
        }
      } catch (error) {
        results[provider.name] = {
          success: false,
          error: (error as Error).message,
        };
      }
    }

    // Note: Test results could be saved to the provider statistics in the future

    return results;
  }

  async refreshConfiguration(): Promise<void> {
    logger.info("Refreshing geocoding configuration");
    this.providers = [];
    this.initialized = false;
    await this.initialize();
  }

  // Helper methods
  private convertNodeGeocoderResult(
    result: Entry,
    providerName: string,
  ): GeocodingResult {
    return {
      latitude: result.latitude!,
      longitude: result.longitude!,
      confidence: this.calculateConfidence(result, providerName),
      provider: providerName,
      normalizedAddress:
        result.formattedAddress || (result as any).display_name || "",
      components: {
        streetNumber: result.streetNumber,
        streetName: result.streetName,
        city: result.city,
        region: result.administrativeLevels?.level1short || result.state,
        postalCode: result.zipcode,
        country: result.country,
      },
      metadata: {
        importance: (result as any).importance,
        placeId: result.extra?.googlePlaceId,
        osmId: (result.extra as any)?.osm_id,
        confidence: result.extra?.confidence,
      },
    };
  }

  private calculateConfidence(result: Entry, providerName: string): number {
    let confidence = 0.7; // Base confidence

    switch (providerName) {
      case "google":
        if ((result.extra as any)?.confidence === "exact_match")
          confidence = 0.95;
        else if ((result.extra as any)?.confidence === "approximate")
          confidence = 0.8;
        break;

      case "opencage":
        confidence = ((result as any).confidence || 5) / 10; // OpenCage uses 1-10 scale
        break;

      case "nominatim":
        confidence = (result as any).importance
          ? Math.min((result as any).importance * 0.8, 0.9)
          : 0.6;
        break;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private convertCachedResult(cached: LocationCache): GeocodingResult {
    return {
      latitude: cached.latitude,
      longitude: cached.longitude,
      confidence: cached.confidence || 0,
      provider: cached.provider,
      normalizedAddress: cached.normalizedAddress,
      components: {
        streetNumber: cached.components?.streetNumber || undefined,
        streetName: cached.components?.streetName || undefined,
        city: cached.components?.city || undefined,
        region: cached.components?.region || undefined,
        postalCode: cached.components?.postalCode || undefined,
        country: cached.components?.country || undefined,
      },
      metadata: cached.metadata,
      fromCache: true,
    };
  }

  private normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .replace(/[^\w\s]/g, "") // Remove punctuation
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();
  }

  private async getCachedResult(
    address: string,
  ): Promise<LocationCache | null> {
    try {
      const normalizedAddress = this.normalizeAddress(address);

      const results = await this.payload.find({
        collection: "location-cache",
        where: { normalizedAddress: { equals: normalizedAddress } },
        limit: 1,
        sort: "-hitCount",
      });

      if (results.docs.length === 0) return null;

      const cached = results.docs[0];
      if (!cached) return null;

      if (this.isCacheExpired(cached)) {
        await this.payload.delete({
          collection: "location-cache",
          id: cached.id,
        });
        return null;
      }

      return cached;
    } catch (error) {
      logger.warn({ error, address }, "Failed to check cache");
      return null;
    }
  }

  private isCacheExpired(cached: LocationCache): boolean {
    if (!cached.createdAt) return true;
    const ttl = (this.settings?.caching?.ttlDays || 365) * 24 * 60 * 60 * 1000;
    return Date.now() - new Date(cached.createdAt).getTime() > ttl;
  }

  private async updateCacheHit(cacheId: string | number): Promise<void> {
    try {
      const cached = await this.payload.findByID({
        collection: "location-cache",
        id: cacheId,
      });

      await this.payload.update({
        collection: "location-cache",
        id: cacheId,
        data: {
          hitCount: (cached.hitCount || 0) + 1,
          lastUsed: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.warn({ error, cacheId }, "Failed to update cache hit count");
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
          originalAddress: address,
          normalizedAddress: this.normalizeAddress(address),
          latitude: result.latitude,
          longitude: result.longitude,
          confidence: result.confidence,
          provider: result.provider,
          components: result.components,
          metadata: result.metadata,
          hitCount: 0,
        },
      });
    } catch (error) {
      logger.warn({ error, address }, "Failed to cache result");
    }
  }

  private isResultAcceptable(result: GeocodingResult): boolean {
    return (
      typeof result.latitude === "number" &&
      typeof result.longitude === "number" &&
      !isNaN(result.latitude) &&
      !isNaN(result.longitude) &&
      result.latitude >= -90 &&
      result.latitude <= 90 &&
      result.longitude >= -180 &&
      result.longitude <= 180 &&
      (result.confidence ?? 0) >= 0.1 &&
      !(result.latitude === 0 && result.longitude === 0)
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

  async cleanupCache(): Promise<void> {
    try {
      const ttl =
        (this.settings?.caching?.ttlDays || 365) * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(Date.now() - ttl);

      // Find old cache entries based on lastUsed date
      const oldEntries = await this.payload.find({
        collection: "location-cache",
        where: {
          lastUsed: {
            less_than: cutoffDate.toISOString(),
          },
        },
        limit: 1000,
      });

      // Delete old entries
      for (const entry of oldEntries.docs) {
        await this.payload.delete({
          collection: "location-cache",
          id: entry.id,
        });
      }

      logger.info(
        { deletedEntries: oldEntries.docs.length },
        "Cache cleanup completed",
      );
    } catch (error) {
      logger.warn({ error }, "Failed to cleanup cache");
    }
  }
}
