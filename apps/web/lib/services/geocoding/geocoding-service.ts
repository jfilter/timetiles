/**
 * Coordinates provider loading, caching, and single-address or batch geocoding.
 *
 * Each factory call creates a new instance that initializes lazily from Payload
 * settings and provider records. Configuration can be refreshed on that instance.
 *
 * @module
 */
import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";

import { CacheManager } from "./cache-manager";
import { GeocodingOperations } from "./geocoding-operations";
import { ProviderManager } from "./provider-manager";
import type { BatchGeocodingResult, GeocodingBias, GeocodingResult, GeocodingSettings } from "./types";

const logger = createLogger("geocoding-service");

export class GeocodingService {
  private readonly payload: Payload;
  private settings: GeocodingSettings | null = null;
  private initialized = false;
  private providerManager: ProviderManager | null = null;
  private cacheManager: CacheManager | null = null;
  private geocodingOperations: GeocodingOperations | null = null;

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

      // Update components with settings
      this.providerManager = new ProviderManager(this.payload, this.settings);
      this.cacheManager = new CacheManager(this.payload, this.settings);
      this.geocodingOperations = new GeocodingOperations(this.providerManager, this.cacheManager, this.settings);

      // Load and initialize providers from collection
      const providers = await this.providerManager.loadProviders();
      logger.info(`Loaded ${providers.length} providers`);

      this.initialized = true;

      logger.info(
        { activeProviders: providers.filter((p) => p.enabled).map((p) => p.name), totalProviders: providers.length },
        "Geocoding service initialized"
      );
    } catch (error) {
      logger.error({ error }, "Failed to initialize geocoding service");
      throw error;
    }
  }

  async geocode(address: string): Promise<GeocodingResult> {
    await this.initialize();
    return this.geocodingOperations!.geocode(address);
  }

  async batchGeocode(addresses: string[], batchSize: number = 10, bias?: GeocodingBias): Promise<BatchGeocodingResult> {
    await this.initialize();
    return this.geocodingOperations!.batchGeocode(addresses, batchSize, bias);
  }

  /**
   * Whether geocoding is globally enabled for event imports
   * (Settings → Geocoding → "Enable Geocoding").
   *
   * Import jobs must consult this before geocoding; the admin test endpoint
   * intentionally does not, so providers stay testable while disabled.
   */
  async isEnabled(): Promise<boolean> {
    // Read the kill switch without requiring configured providers. Settings read errors
    // still propagate so imports cannot geocode with an unknown enabled state.
    if (!this.initialized) {
      await this.loadSettings();
    }
    return this.settings?.enabled !== false;
  }

  async testConfiguration(testAddress?: string): Promise<Record<string, unknown>> {
    await this.initialize();
    return this.geocodingOperations!.testConfiguration(testAddress);
  }

  async refreshConfiguration(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }

  async cleanupCache(): Promise<number> {
    // Database maintenance needs settings, not configured geocoding providers.
    if (!this.initialized) {
      await this.loadSettings();
    }
    const cacheManager = new CacheManager(this.payload, this.settings);
    return cacheManager.cleanupCache();
  }

  private async loadSettings(): Promise<void> {
    try {
      const settingsGlobal = await this.payload.findGlobal({ slug: "settings", overrideAccess: true });

      const geocodingSettings = settingsGlobal.geocoding;

      this.settings = {
        enabled: geocodingSettings?.enabled ?? true,
        fallbackEnabled: geocodingSettings?.fallbackEnabled ?? true,
        providerSelection: {
          strategy: geocodingSettings?.providerSelection?.strategy ?? "priority",
          requiredTags: geocodingSettings?.providerSelection?.requiredTags ?? [],
        },
        caching: {
          enabled: geocodingSettings?.caching?.enabled ?? true,
          ttlDays: geocodingSettings?.caching?.ttlDays ?? 30,
        },
      };

      logger.debug("Geocoding settings loaded from database", { settings: this.settings });
    } catch (error) {
      // Do NOT fall back to `enabled: true` here. A missing/unconfigured global
      // does not throw (Payload returns defaults), so this catch only fires on a
      // real read error (e.g. transient DB failure). Defaulting to enabled would
      // make the admin "Enable Geocoding" kill-switch fail OPEN — a transient
      // blip would ship addresses to external providers (quota/billing/PII
      // egress) even when an admin explicitly disabled geocoding. Rethrow so the
      // retryable geocode-batch job retries and reads the real setting instead.
      logger.error("Failed to load geocoding settings from database", { error });
      throw error;
    }
  }
}

/** Create a new GeocodingService instance. Follows the `create*Service` convention for stateless-per-request services. */
export const createGeocodingService = (payload: Payload): GeocodingService => new GeocodingService(payload);

export { GeocodingError } from "./types";
