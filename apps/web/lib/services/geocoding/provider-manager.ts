import NodeGeocoder, { type Options } from "node-geocoder";
import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";
import type { GeocodingProvider } from "@/payload-types";

import type { GeocodingSettings, ProviderConfig } from "./types";
import { NOMINATIM_BASE_URL } from "./types";

const logger = createLogger("geocoding-provider-manager");

export class ProviderManager {
  private providers: ProviderConfig[] = [];
  private payload: Payload;
  private settings: GeocodingSettings | null = null;

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
      if (strategy == "tag-based" && requiredTags.length > 0) {
        whereClause = {
          tags: {
            in: requiredTags,
          },
        };
      }

      const providerResults = await this.payload.find({
        collection: "geocoding-providers",
        where: whereClause,
        limit: 100,
      });

      if (providerResults.docs.length == 0) {
        logger.warn("No geocoding providers found in database, using default configuration");
        this.providers = this.buildDefaultProviderConfigs();
      } else {
        logger.info(`Found ${providerResults.docs.length} providers in database`);
        this.initializeProvidersFromDocs(providerResults.docs);
      }

      return this.providers;
    } catch (error) {
      logger.error("Error loading providers from database", { error });
      logger.info("Falling back to default provider configuration");
      this.providers = this.buildDefaultProviderConfigs();
      return this.providers;
    }
  }

  getEnabledProviders(): ProviderConfig[] {
    const enabledProviders = this.providers.filter((p) => p.enabled);
    if (enabledProviders.length == 0) {
      throw new Error("No enabled geocoding providers available");
    }
    // Sort by priority (lower number = higher priority)
    return enabledProviders.sort((a, b) => a.priority - b.priority);
  }

  getProviders(): ProviderConfig[] {
    return this.providers;
  }

  private buildDefaultProviderConfigs(): ProviderConfig[] {
    const configs: ProviderConfig[] = [];

    if (this.isGoogleApiKeyAvailable()) {
      configs.push(this.createGoogleProviderConfig());
    }

    if (this.isOpenCageApiKeyAvailable()) {
      configs.push(this.createOpenCageProviderConfig());
    }

    // Always add Nominatim as fallback
    configs.push(this.createNominatimProviderConfig());

    return configs;
  }

  private isGoogleApiKeyAvailable(): boolean {
    return (
      process.env.GEOCODING_GOOGLE_MAPS_API_KEY != null &&
      process.env.GEOCODING_GOOGLE_MAPS_API_KEY != undefined &&
      process.env.GEOCODING_GOOGLE_MAPS_API_KEY.trim() !== ""
    );
  }

  private isOpenCageApiKeyAvailable(): boolean {
    return (
      process.env.GEOCODING_OPENCAGE_API_KEY != null &&
      process.env.GEOCODING_OPENCAGE_API_KEY != undefined &&
      process.env.GEOCODING_OPENCAGE_API_KEY.trim() !== ""
    );
  }

  private createGoogleProviderConfig(): ProviderConfig {
    return {
      name: "google",
      geocoder: NodeGeocoder({
        provider: "google",
        apiKey: process.env.GEOCODING_GOOGLE_MAPS_API_KEY,
        formatter: null,
      }),
      priority: 1,
      enabled: true,
    };
  }

  private createNominatimProviderConfig(): ProviderConfig {
    return {
      name: "nominatim",
      geocoder: NodeGeocoder({
        provider: "openstreetmap",
        osmServer: NOMINATIM_BASE_URL,
        apiKey: undefined,
        formatter: null,
        // extraQueryParams removed due to type conflicts
      }),
      priority: 10,
      enabled: true,
    };
  }

  private createOpenCageProviderConfig(): ProviderConfig {
    return {
      name: "opencage",
      geocoder: NodeGeocoder({
        provider: "opencage",
        apiKey: process.env.GEOCODING_OPENCAGE_API_KEY,
        formatter: null,
      }),
      priority: 5,
      enabled: true,
    };
  }

  private initializeProvidersFromDocs(docs: GeocodingProvider[]): void {
    this.providers = [];

    for (const doc of docs) {
      if (doc.enabled !== true || doc.type == null || doc.type == undefined) {
        logger.debug(`Skipping disabled or invalid provider: ${doc.name}`);
        continue;
      }

      try {
        switch (doc.type) {
          case "google": {
            const googleGeocoder = this.createGoogleGeocoder(doc);
            if (!googleGeocoder) continue;
            this.providers.push({
              name: doc.name ?? "google",
              geocoder: googleGeocoder,
              priority: doc.priority ?? 1,
              enabled: doc.enabled,
            });
            break;
          }
          case "opencage": {
            const opencageGeocoder = this.createOpenCageGeocoder(doc);
            if (!opencageGeocoder) continue;
            this.providers.push({
              name: doc.name ?? "opencage",
              geocoder: opencageGeocoder,
              priority: doc.priority ?? 5,
              enabled: doc.enabled,
            });
            break;
          }
          case "nominatim": {
            const nominatimGeocoder = this.createNominatimGeocoder(doc);
            this.providers.push({
              name: doc.name ?? "nominatim",
              geocoder: nominatimGeocoder,
              priority: doc.priority ?? 10,
              enabled: doc.enabled,
            });
            break;
          }
          default:
            logger.warn(`Unknown provider type: ${String(doc.type)}`);
        }
      } catch (error) {
        logger.error(`Failed to initialize provider ${doc.name}`, { error, provider: doc });
      }
    }
  }

  private createGoogleGeocoder(doc: GeocodingProvider): NodeGeocoder.Geocoder | null {
    const googleConfig = doc.config?.google;
    if (
      googleConfig?.apiKey == null ||
      googleConfig?.apiKey == undefined ||
      (typeof googleConfig.apiKey == "string" && googleConfig.apiKey.trim() === "")
    ) {
      logger.warn(`Google provider ${doc.name} has no API key configured`);
      return null;
    }

    return NodeGeocoder({
      provider: "google",
      apiKey: googleConfig.apiKey,
      formatter: null,
    });
  }

  private createNominatimGeocoder(doc: GeocodingProvider): NodeGeocoder.Geocoder {
    const nominatimConfig = doc.config?.nominatim;
    const baseUrl = nominatimConfig?.baseUrl ?? NOMINATIM_BASE_URL;
    // const userAgent = nominatimConfig?.userAgent ?? TIMETILES_USER_AGENT; // Removed due to node-geocoder type constraints

    return NodeGeocoder({
      provider: "openstreetmap",
      osmServer: baseUrl,
      // httpAdapter: "https", // removed due to type conflicts
      apiKey: undefined,
      formatter: null,
      // extraQueryParams removed due to type conflicts
    });
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

    const config: Record<string, unknown> = {
      provider: "opencage",
      apiKey: openCageConfig.apiKey,
      formatter: null,
    };

    // Add bounds if configured - commented out due to type conflicts
    // TODO: Fix bounds configuration type definitions
    /*
    const bounds = (doc.config as any)?.bounds;
    if (
      bounds != null &&
      Boolean(bounds.enabled) &&
      bounds.northEast != null &&
      bounds.southWest != null
    ) {
      if (
        typeof bounds.northEast.lat == "number" &&
        typeof bounds.northEast.lng == "number" &&
        typeof bounds.southWest.lat == "number" &&
        typeof bounds.southWest.lng == "number"
      ) {
        config.bounds = `${bounds.southWest.lat},${bounds.southWest.lng},${bounds.northEast.lat},${bounds.northEast.lng}`;
      }
    }
    */

    return NodeGeocoder(config as unknown as Options);
  }
}
