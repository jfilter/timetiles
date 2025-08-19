/**
 * @module Manages the geocoding providers for the application.
 *
 * This class is responsible for loading geocoding provider configurations from the database
 * (or falling back to default environment variable-based configurations). It initializes
 * instances of the `node-geocoder` library for each active provider and makes them
 * available to the rest of the geocoding service.
 *
 * It handles the logic for selecting and prioritizing providers based on the system's
 * settings, ensuring that the geocoding operations can be performed in a configured,
 * resilient, and orderly manner.
 */
import NodeGeocoder, { type Options } from "node-geocoder";
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/import-constants";
import { createLogger } from "@/lib/logger";
import type { GeocodingProvider } from "@/payload-types";

import type { GeocodingSettings, ProviderConfig } from "./types";
import { NOMINATIM_BASE_URL } from "./types";

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
      if (strategy == "tag-based" && requiredTags.length > 0) {
        whereClause = {
          tags: {
            in: requiredTags,
          },
        };
      }

      const providerResults = await this.payload.find({
        collection: COLLECTION_NAMES.GEOCODING_PROVIDERS,
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

  // Helper method to check if provider doc is valid
  private isProviderDocValid(doc: GeocodingProvider): boolean {
    return doc.enabled === true && doc.type != null;
  }

  // Helper method to create provider entry
  private createProviderEntry(doc: GeocodingProvider, geocoder: NodeGeocoder.Geocoder, defaultPriority: number) {
    return {
      name: doc.name ?? doc.type,
      geocoder,
      priority: doc.priority ?? defaultPriority,
      enabled: doc.enabled ?? false,
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
  private createGeocoderForType(doc: GeocodingProvider) {
    switch (doc.type) {
      case "google": {
        const geocoder = this.createGoogleGeocoder(doc);
        return geocoder ? this.createProviderEntry(doc, geocoder, 1) : null;
      }
      case "opencage": {
        const geocoder = this.createOpenCageGeocoder(doc);
        return geocoder ? this.createProviderEntry(doc, geocoder, 5) : null;
      }
      case "nominatim": {
        const geocoder = this.createNominatimGeocoder(doc);
        return this.createProviderEntry(doc, geocoder, 10);
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
