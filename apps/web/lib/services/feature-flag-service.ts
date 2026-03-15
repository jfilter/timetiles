/**
 * Service for reading and caching feature flags from Settings global.
 *
 * Provides type-safe access to feature flags with in-memory caching
 * and fallback to defaults when settings are unavailable.
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import { logger } from "@/lib/logger";

export interface FeatureFlags {
  allowPrivateImports: boolean;
  enableScheduledImports: boolean;
  enableRegistration: boolean;
  enableEventCreation: boolean;
  enableDatasetCreation: boolean;
  enableImportCreation: boolean;
  enableScheduledJobExecution: boolean;
  enableUrlFetchCaching: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  allowPrivateImports: true,
  enableScheduledImports: true,
  enableRegistration: true,
  enableEventCreation: true,
  enableDatasetCreation: true,
  enableImportCreation: true,
  enableScheduledJobExecution: true,
  enableUrlFetchCaching: true,
};

/** Fail-closed defaults returned when the database is unavailable. */
export const DISABLED_FLAGS: FeatureFlags = {
  allowPrivateImports: false,
  enableScheduledImports: false,
  enableRegistration: false,
  enableEventCreation: false,
  enableDatasetCreation: false,
  enableImportCreation: false,
  enableScheduledJobExecution: false,
  enableUrlFetchCaching: false,
};

const CACHE_TTL_MS = 60_000; // 1 minute

class FeatureFlagService {
  private readonly payload: Payload;
  private cachedFlags: FeatureFlags | null = null;
  private cacheTimestamp = 0;

  constructor(payload: Payload) {
    this.payload = payload;
  }

  /**
   * Retrieves all feature flags with caching.
   *
   * Caches the flags for 1 minute to reduce database queries.
   * Falls back to disabled flags if the Settings global cannot be read.
   */
  async getAll(): Promise<FeatureFlags> {
    const now = Date.now();

    if (this.cachedFlags && now - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedFlags;
    }

    try {
      const settings = await this.payload.findGlobal({ slug: "settings" });
      const flags = settings.featureFlags;

      const newFlags: FeatureFlags = {
        allowPrivateImports: flags?.allowPrivateImports ?? DEFAULT_FLAGS.allowPrivateImports,
        enableScheduledImports: flags?.enableScheduledImports ?? DEFAULT_FLAGS.enableScheduledImports,
        enableRegistration: flags?.enableRegistration ?? DEFAULT_FLAGS.enableRegistration,
        enableEventCreation: flags?.enableEventCreation ?? DEFAULT_FLAGS.enableEventCreation,
        enableDatasetCreation: flags?.enableDatasetCreation ?? DEFAULT_FLAGS.enableDatasetCreation,
        enableImportCreation: flags?.enableImportCreation ?? DEFAULT_FLAGS.enableImportCreation,
        enableScheduledJobExecution: flags?.enableScheduledJobExecution ?? DEFAULT_FLAGS.enableScheduledJobExecution,
        enableUrlFetchCaching: flags?.enableUrlFetchCaching ?? DEFAULT_FLAGS.enableUrlFetchCaching,
      };

      this.cachedFlags = newFlags;
      this.cacheTimestamp = Date.now();

      return newFlags;
    } catch (error) {
      logger.warn({ error }, "Failed to load feature flags, disabling all flags");
      return DISABLED_FLAGS;
    }
  }

  /**
   * Checks if a specific feature flag is enabled.
   */
  async isEnabled(flag: keyof FeatureFlags): Promise<boolean> {
    const flags = await this.getAll();
    return flags[flag];
  }
}

// Singleton: must be shared across requests because the in-memory flag cache
// is process-level state. Creating a fresh instance per request would cause
// redundant database queries on every call.
let featureFlagService: FeatureFlagService | null = null;

export const getFeatureFlagService = (payload: Payload): FeatureFlagService => {
  featureFlagService ??= new FeatureFlagService(payload);
  return featureFlagService;
};

/**
 * Reset the feature flag service singleton (for testing).
 * Call this in beforeEach to ensure clean state between tests.
 */
export const resetFeatureFlagService = (): void => {
  featureFlagService = null;
};

// Convenience wrappers — preserve existing API, no call site changes needed.

/** Retrieves all feature flags with caching. */
export const getFeatureFlags = async (payload: Payload): Promise<FeatureFlags> =>
  getFeatureFlagService(payload).getAll();

/** Checks if a specific feature flag is enabled. */
export const isFeatureEnabled = async (payload: Payload, flag: keyof FeatureFlags): Promise<boolean> =>
  getFeatureFlagService(payload).isEnabled(flag);

/**
 * Returns the default feature flags.
 *
 * Useful for testing or when database is unavailable.
 */
export const getDefaultFeatureFlags = (): FeatureFlags => ({ ...DEFAULT_FLAGS });
