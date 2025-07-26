import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";

import { CacheManager } from "./cache-manager";
import { GeocodingOperations } from "./geocoding-operations";
import { ProviderManager } from "./provider-manager";
import type { BatchGeocodingResult, GeocodingResult, GeocodingSettings } from "./types";

const logger = createLogger("geocoding-service");

export class GeocodingService {
  private readonly payload: Payload;
  private settings: GeocodingSettings | null = null;
  private initialized = false;
  private providerManager: ProviderManager;
  private cacheManager: CacheManager;
  private geocodingOperations: GeocodingOperations;

  constructor(payload: Payload) {
    this.payload = payload;
    this.providerManager = new ProviderManager(payload, this.settings);
    this.cacheManager = new CacheManager(payload, this.settings);
    this.geocodingOperations = new GeocodingOperations(this.providerManager, this.cacheManager, this.settings);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info("Initializing geocoding service");

    try {
      // Load settings from database
      this.loadSettings();
      logger.info("Settings loaded successfully");

      // Update components with settings
      this.providerManager = new ProviderManager(this.payload, this.settings);
      this.cacheManager = new CacheManager(this.payload, this.settings);
      this.geocodingOperations = new GeocodingOperations(this.providerManager, this.cacheManager, this.settings);

      // Load and initialize providers from collection
      const providers = await this.providerManager.loadProviders();
      logger.info(`Loaded ${providers.length} providers`);

      this.initialized = true;

      logger.info(
        {
          activeProviders: providers.filter((p) => p.enabled).map((p) => p.name),
          totalProviders: providers.length,
        },
        "Geocoding service initialized",
      );
    } catch (error) {
      logger.error({ error }, "Failed to initialize geocoding service");
      throw error;
    }
  }

  async geocode(address: string): Promise<GeocodingResult> {
    await this.initialize();
    return this.geocodingOperations.geocode(address);
  }

  async batchGeocode(addresses: string[], batchSize: number = 10): Promise<BatchGeocodingResult> {
    await this.initialize();
    return this.geocodingOperations.batchGeocode(addresses, batchSize);
  }

  async testConfiguration(testAddress?: string): Promise<Record<string, unknown>> {
    await this.initialize();
    return this.geocodingOperations.testConfiguration(testAddress);
  }

  async refreshConfiguration(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }

  async cleanupCache(): Promise<void> {
    await this.initialize();
    await this.cacheManager.cleanupCache();
  }

  private loadSettings(): void {
    // Default settings - in a real implementation, these would be loaded from database
    this.settings = {
      enabled: true,
      fallbackEnabled: true,
      providerSelection: {
        strategy: "priority",
        requiredTags: [],
      },
      caching: {
        enabled: true,
        ttlDays: 30,
      },
    };

    // Override with environment variables if present
    if (process.env.GEOCODING_ENABLED === "false") {
      this.settings.enabled = false;
    }

    if (process.env.GEOCODING_FALLBACK_ENABLED === "false") {
      this.settings.fallbackEnabled = false;
    }

    if (process.env.GEOCODING_CACHE_ENABLED === "false") {
      this.settings.caching.enabled = false;
    }

    if (process.env.GEOCODING_CACHE_TTL_DAYS != null && process.env.GEOCODING_CACHE_TTL_DAYS.length > 0) {
      const ttl = parseInt(process.env.GEOCODING_CACHE_TTL_DAYS, 10);
      if (!isNaN(ttl) && ttl > 0) {
        this.settings.caching.ttlDays = ttl;
      }
    }

    logger.debug("Geocoding settings loaded", { settings: this.settings });
  }
}

// Re-export types for convenience
export type { BatchGeocodingResult, GeocodingResult } from "./types";
export { GeocodingError } from "./types";
