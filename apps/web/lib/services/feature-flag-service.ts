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

// In-memory cache with TTL
let cachedFlags: FeatureFlags | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Retrieves all feature flags with caching.
 *
 * Caches the flags for 1 minute to reduce database queries.
 * Falls back to defaults if the Settings global cannot be read.
 */
export const getFeatureFlags = async (payload: Payload): Promise<FeatureFlags> => {
  const now = Date.now();

  // Return cached if valid
  if (cachedFlags && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedFlags;
  }

  try {
    const settings = await payload.findGlobal({ slug: "settings" });
    const flags = settings.featureFlags;

    // Build new flags object first, then assign to cache atomically
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

    // Update cache atomically - acceptable race (worst case: double-fetch, not corruption)
    // eslint-disable-next-line require-atomic-updates
    cachedFlags = newFlags;
    // eslint-disable-next-line require-atomic-updates
    cacheTimestamp = Date.now();

    return newFlags;
  } catch (error) {
    logger.warn({ error }, "Failed to load feature flags, using defaults");
    return DEFAULT_FLAGS;
  }
};

/**
 * Checks if a specific feature flag is enabled.
 *
 * Convenience helper for checking individual flags.
 */
export const isFeatureEnabled = async (payload: Payload, flag: keyof FeatureFlags): Promise<boolean> => {
  const flags = await getFeatureFlags(payload);
  return flags[flag];
};

/**
 * Clears the feature flag cache.
 *
 * Call this after updating flags via the admin dashboard
 * to ensure the next read gets fresh values.
 */
export const clearFeatureFlagCache = (): void => {
  cachedFlags = null;
  cacheTimestamp = 0;
};

/**
 * Returns the default feature flags.
 *
 * Useful for testing or when database is unavailable.
 */
export const getDefaultFeatureFlags = (): FeatureFlags => ({ ...DEFAULT_FLAGS });
