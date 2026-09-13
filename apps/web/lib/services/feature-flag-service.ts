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

import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import { isE2E } from "@/lib/utils/is-e2e";

export interface FeatureFlags {
  allowPrivateImports: boolean;
  enableScheduledIngests: boolean;
  enableRegistration: boolean;
  enableEventCreation: boolean;
  enableDatasetCreation: boolean;
  enableImportCreation: boolean;
  enableScheduledJobExecution: boolean;
  enableUrlFetchCaching: boolean;
  enableScrapers: boolean;
  enableExpertMode: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  allowPrivateImports: true,
  enableScheduledIngests: true,
  enableRegistration: true,
  enableEventCreation: true,
  enableDatasetCreation: true,
  enableImportCreation: true,
  enableScheduledJobExecution: true,
  enableUrlFetchCaching: true,
  enableScrapers: false,
  enableExpertMode: getEnv().NODE_ENV !== "production" || isE2E(),
};

/** Fail-closed defaults returned when the database is unavailable. */
export const DISABLED_FLAGS: FeatureFlags = {
  allowPrivateImports: false,
  enableScheduledIngests: false,
  enableRegistration: false,
  enableEventCreation: false,
  enableDatasetCreation: false,
  enableImportCreation: false,
  enableScheduledJobExecution: false,
  enableUrlFetchCaching: false,
  enableScrapers: false,
  enableExpertMode: false,
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
      const settings = await this.payload.findGlobal({ slug: "settings", overrideAccess: true });
      const flags = settings.featureFlags;

      const newFlags = { ...DEFAULT_FLAGS };
      for (const key of Object.keys(DEFAULT_FLAGS) as Array<keyof FeatureFlags>) {
        newFlags[key] = flags?.[key] ?? DEFAULT_FLAGS[key];
      }

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

// Route handlers and pages are bundled separately, so a module-level singleton exists once
// per bundle; the process-wide slot lets a settings save invalidate every copy.
const SERVICE_KEY = Symbol.for("timetiles.featureFlagService");
type ServiceSlot = { [SERVICE_KEY]?: FeatureFlagService | null };
const slot = globalThis as ServiceSlot;

export const getFeatureFlagService = (payload: Payload): FeatureFlagService => {
  slot[SERVICE_KEY] ??= new FeatureFlagService(payload);
  return slot[SERVICE_KEY];
};

/** Drops the cached flags in every bundle of this process. */
export const resetFeatureFlagService = (): void => {
  slot[SERVICE_KEY] = null;
};

/**
 * Returns the default feature flags.
 *
 * Useful for testing or when database is unavailable.
 */
export const getDefaultFeatureFlags = (): FeatureFlags => ({ ...DEFAULT_FLAGS });
