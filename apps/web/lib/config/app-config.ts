/**
 * Application configuration loaded from an optional YAML file.
 *
 * Provides operator-tunable settings for rate limits, quotas, batch sizes,
 * and cache configuration. Falls back to hardcoded defaults when the YAML
 * file is absent — existing deployments work unchanged.
 *
 * Resolution order for batch sizes: env var > YAML > default.
 * Resolution order for everything else: YAML > default.
 *
 * @module
 * @category Config
 */

import fs from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { TRUST_LEVELS } from "@/lib/constants/trust-levels";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const rateLimitWindowSchema = z.object({
  limit: z.number().positive(),
  windowMs: z.number().positive(),
  name: z.string().optional(),
});

const rateLimitConfigSchema = z.object({ windows: z.array(rateLimitWindowSchema).min(1) });

const userQuotasSchema = z.object({
  maxActiveSchedules: z.number().int(),
  maxUrlFetchesPerDay: z.number().int(),
  maxFileUploadsPerDay: z.number().int(),
  maxEventsPerImport: z.number().int(),
  maxTotalEvents: z.number().int(),
  maxIngestJobsPerDay: z.number().int(),
  maxFileSizeMB: z.number().int(),
  maxCatalogsPerUser: z.number().int(),
  maxScraperRepos: z.number().int(),
  maxScraperRunsPerDay: z.number().int(),
});

const trustLevelRateLimitsSchema = z.object({ FILE_UPLOAD: rateLimitConfigSchema, API_GENERAL: rateLimitConfigSchema });

const batchSizesSchema = z.object({
  duplicateAnalysis: z.number().int().positive(),
  schemaDetection: z.number().int().positive(),
  eventCreation: z.number().int().positive(),
  databaseChunk: z.number().int().positive(),
});

const reviewThresholdsSchema = z.object({
  highDuplicateRate: z.number().min(0).max(1),
  geocodingPartialFailureRate: z.number().min(0).max(1),
  highRowErrorRate: z.number().min(0).max(1),
  highEmptyRowRate: z.number().min(0).max(1),
});

// Note: cacheSchema and accountSchema not needed as Zod schemas since the YAML
// config uses partial validation inline. Types are defined as interfaces below.

/**
 * Schema for the optional YAML config file.
 * All fields are optional — missing values use hardcoded defaults.
 */
const yamlConfigSchema = z
  .object({
    rateLimits: z.record(z.string(), rateLimitConfigSchema).optional(),
    quotas: z.record(z.string(), userQuotasSchema.partial()).optional(),
    trustLevelRateLimits: z.record(z.string(), trustLevelRateLimitsSchema.partial()).optional(),
    batchSizes: batchSizesSchema.partial().optional(),
    reviewThresholds: reviewThresholdsSchema.partial().optional(),
    cache: z
      .object({
        urlFetch: z
          .object({
            dir: z.string().optional(),
            maxSizeBytes: z.number().int().positive().optional(),
            defaultTtlSeconds: z.number().int().positive().optional(),
            maxTtlSeconds: z.number().int().positive().optional(),
            respectCacheControl: z.boolean().optional(),
          })
          .optional(),
      })
      .optional(),
    account: z.object({ deletionGracePeriodDays: z.number().int().positive().optional() }).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Default values (extracted from current constants files)
// ---------------------------------------------------------------------------

const DEFAULT_RATE_LIMITS = {
  FILE_UPLOAD: {
    windows: [
      { limit: 1, windowMs: 5 * 1000, name: "burst" },
      { limit: 5, windowMs: 60 * 60 * 1000, name: "hourly" },
      { limit: 20, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
    ],
  },
  PROGRESS_CHECK: {
    windows: [
      { limit: 10, windowMs: 1000, name: "burst" },
      { limit: 3600, windowMs: 60 * 60 * 1000, name: "hourly" },
    ],
  },
  IMPORT_RETRY: {
    windows: [
      { limit: 1, windowMs: 60 * 1000, name: "burst" },
      { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" },
      { limit: 50, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
    ],
  },
  ADMIN_IMPORT_RESET: {
    windows: [
      { limit: 5, windowMs: 60 * 1000, name: "burst" },
      { limit: 50, windowMs: 60 * 60 * 1000, name: "hourly" },
    ],
  },
  RETRY_RECOMMENDATIONS: {
    windows: [
      { limit: 10, windowMs: 60 * 1000, name: "burst" },
      { limit: 100, windowMs: 60 * 60 * 1000, name: "hourly" },
    ],
  },
  API_GENERAL: {
    windows: [
      { limit: 5, windowMs: 1000, name: "burst" },
      { limit: 50, windowMs: 60 * 60 * 1000, name: "hourly" },
    ],
  },
  WEBHOOK_TRIGGER: {
    windows: [
      { limit: 1, windowMs: 10 * 1000, name: "burst" },
      { limit: 5, windowMs: 60 * 60 * 1000, name: "hourly" },
    ],
  },
  NEWSLETTER_SUBSCRIBE: {
    windows: [
      { limit: 1, windowMs: 10 * 1000, name: "burst" },
      { limit: 3, windowMs: 60 * 60 * 1000, name: "hourly" },
      { limit: 10, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
    ],
  },
  PASSWORD_CHANGE: {
    windows: [
      { limit: 3, windowMs: 60 * 1000, name: "burst" },
      { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" },
      { limit: 20, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
    ],
  },
  EMAIL_CHANGE: {
    windows: [
      { limit: 3, windowMs: 60 * 1000, name: "burst" },
      { limit: 5, windowMs: 60 * 60 * 1000, name: "hourly" },
      { limit: 10, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
    ],
  },
  ACCOUNT_DELETION: {
    windows: [
      { limit: 3, windowMs: 60 * 60 * 1000, name: "hourly" },
      { limit: 5, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
    ],
  },
  DELETION_PASSWORD_ATTEMPTS: {
    windows: [
      { limit: 5, windowMs: 60 * 1000, name: "burst" },
      { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" },
    ],
  },
  DATA_EXPORT: {
    windows: [
      { limit: 1, windowMs: 60 * 60 * 1000, name: "hourly" },
      { limit: 3, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
    ],
  },
  REGISTRATION: {
    windows: [
      { limit: 3, windowMs: 60 * 1000, name: "burst" },
      { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" },
      { limit: 20, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
    ],
  },
  LOGIN: {
    windows: [
      { limit: 10, windowMs: 60 * 1000, name: "burst" },
      { limit: 100, windowMs: 60 * 60 * 1000, name: "hourly" },
    ],
  },
  FORGOT_PASSWORD: {
    windows: [
      { limit: 3, windowMs: 60 * 1000, name: "burst" },
      { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" },
      { limit: 20, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
    ],
  },
} satisfies Record<string, RateLimitConfig>;

const DEFAULT_QUOTAS = {
  [TRUST_LEVELS.UNTRUSTED]: {
    maxActiveSchedules: 0,
    maxUrlFetchesPerDay: 0,
    maxFileUploadsPerDay: 1,
    maxEventsPerImport: 100,
    maxTotalEvents: 100,
    maxIngestJobsPerDay: 1,
    maxFileSizeMB: 1,
    maxCatalogsPerUser: 1,
    maxScraperRepos: 0,
    maxScraperRunsPerDay: 0,
  },
  [TRUST_LEVELS.BASIC]: {
    maxActiveSchedules: 1,
    maxUrlFetchesPerDay: 5,
    maxFileUploadsPerDay: 3,
    maxEventsPerImport: 1000,
    maxTotalEvents: 5000,
    maxIngestJobsPerDay: 5,
    maxFileSizeMB: 10,
    maxCatalogsPerUser: 2,
    maxScraperRepos: 0,
    maxScraperRunsPerDay: 0,
  },
  [TRUST_LEVELS.REGULAR]: {
    maxActiveSchedules: 5,
    maxUrlFetchesPerDay: 20,
    maxFileUploadsPerDay: 10,
    maxEventsPerImport: 10_000,
    maxTotalEvents: 50_000,
    maxIngestJobsPerDay: 20,
    maxFileSizeMB: 50,
    maxCatalogsPerUser: 5,
    maxScraperRepos: 0,
    maxScraperRunsPerDay: 0,
  },
  [TRUST_LEVELS.TRUSTED]: {
    maxActiveSchedules: 20,
    maxUrlFetchesPerDay: 100,
    maxFileUploadsPerDay: 50,
    maxEventsPerImport: 50_000,
    maxTotalEvents: 500_000,
    maxIngestJobsPerDay: 100,
    maxFileSizeMB: 100,
    maxCatalogsPerUser: 20,
    maxScraperRepos: 3,
    maxScraperRunsPerDay: 10,
  },
  [TRUST_LEVELS.POWER_USER]: {
    maxActiveSchedules: 100,
    maxUrlFetchesPerDay: 500,
    maxFileUploadsPerDay: 200,
    maxEventsPerImport: 200_000,
    maxTotalEvents: 2_000_000,
    maxIngestJobsPerDay: 500,
    maxFileSizeMB: 500,
    maxCatalogsPerUser: 100,
    maxScraperRepos: 10,
    maxScraperRunsPerDay: 50,
  },
  [TRUST_LEVELS.UNLIMITED]: {
    maxActiveSchedules: -1,
    maxUrlFetchesPerDay: -1,
    maxFileUploadsPerDay: -1,
    maxEventsPerImport: -1,
    maxTotalEvents: -1,
    maxIngestJobsPerDay: -1,
    maxFileSizeMB: 1000,
    maxCatalogsPerUser: -1,
    maxScraperRepos: -1,
    maxScraperRunsPerDay: -1,
  },
} satisfies Record<number, UserQuotasConfig>;

const DEFAULT_TRUST_LEVEL_RATE_LIMITS = {
  [TRUST_LEVELS.UNTRUSTED]: {
    FILE_UPLOAD: {
      windows: [
        { limit: 1, windowMs: 60 * 1000, name: "burst" },
        { limit: 1, windowMs: 60 * 60 * 1000, name: "hourly" },
        { limit: 1, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
      ],
    },
    API_GENERAL: {
      windows: [
        { limit: 1, windowMs: 1000, name: "burst" },
        { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" },
      ],
    },
  },
  [TRUST_LEVELS.BASIC]: {
    FILE_UPLOAD: {
      windows: [
        { limit: 1, windowMs: 10 * 1000, name: "burst" },
        { limit: 3, windowMs: 60 * 60 * 1000, name: "hourly" },
        { limit: 3, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
      ],
    },
    API_GENERAL: {
      windows: [
        { limit: 2, windowMs: 1000, name: "burst" },
        { limit: 30, windowMs: 60 * 60 * 1000, name: "hourly" },
      ],
    },
  },
  [TRUST_LEVELS.REGULAR]: {
    FILE_UPLOAD: {
      windows: [
        { limit: 1, windowMs: 5 * 1000, name: "burst" },
        { limit: 5, windowMs: 60 * 60 * 1000, name: "hourly" },
        { limit: 20, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
      ],
    },
    API_GENERAL: {
      windows: [
        { limit: 5, windowMs: 1000, name: "burst" },
        { limit: 50, windowMs: 60 * 60 * 1000, name: "hourly" },
      ],
    },
  },
  [TRUST_LEVELS.TRUSTED]: {
    FILE_UPLOAD: {
      windows: [
        { limit: 2, windowMs: 5 * 1000, name: "burst" },
        { limit: 20, windowMs: 60 * 60 * 1000, name: "hourly" },
        { limit: 50, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
      ],
    },
    API_GENERAL: {
      windows: [
        { limit: 10, windowMs: 1000, name: "burst" },
        { limit: 200, windowMs: 60 * 60 * 1000, name: "hourly" },
      ],
    },
  },
  [TRUST_LEVELS.POWER_USER]: {
    FILE_UPLOAD: {
      windows: [
        { limit: 5, windowMs: 5 * 1000, name: "burst" },
        { limit: 100, windowMs: 60 * 60 * 1000, name: "hourly" },
        { limit: 200, windowMs: 24 * 60 * 60 * 1000, name: "daily" },
      ],
    },
    API_GENERAL: {
      windows: [
        { limit: 20, windowMs: 1000, name: "burst" },
        { limit: 1000, windowMs: 60 * 60 * 1000, name: "hourly" },
      ],
    },
  },
  [TRUST_LEVELS.UNLIMITED]: {
    FILE_UPLOAD: {
      windows: [
        { limit: 10, windowMs: 1000, name: "burst" },
        { limit: 1000, windowMs: 60 * 60 * 1000, name: "hourly" },
      ],
    },
    API_GENERAL: {
      windows: [
        { limit: 100, windowMs: 1000, name: "burst" },
        { limit: 10_000, windowMs: 60 * 60 * 1000, name: "hourly" },
      ],
    },
  },
} satisfies Record<number, TrustLevelRateLimitsConfig>;

const DEFAULT_BATCH_SIZES = {
  duplicateAnalysis: 5000,
  schemaDetection: 10_000,
  eventCreation: 1000,
  databaseChunk: 1000,
};

const DEFAULT_CACHE = {
  urlFetch: {
    // eslint-disable-next-line sonarjs/publicly-writable-directories -- configurable default, overridden in production
    dir: "/tmp/url-fetch-cache",
    maxSizeBytes: 104_857_600,
    defaultTtlSeconds: 3600,
    maxTtlSeconds: 2_592_000,
    respectCacheControl: true,
  },
};

const DEFAULT_ACCOUNT = { deletionGracePeriodDays: 30 };

const DEFAULT_REVIEW_THRESHOLDS = {
  highDuplicateRate: 0.8,
  geocodingPartialFailureRate: 0.5,
  highRowErrorRate: 0.1,
  highEmptyRowRate: 0.2,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RateLimitWindowConfig = z.infer<typeof rateLimitWindowSchema>;
export type RateLimitConfig = z.infer<typeof rateLimitConfigSchema>;
export type UserQuotasConfig = z.infer<typeof userQuotasSchema>;
export type TrustLevelRateLimitsConfig = z.infer<typeof trustLevelRateLimitsSchema>;
export type BatchSizesConfig = z.infer<typeof batchSizesSchema>;
export type ReviewThresholdsConfig = z.infer<typeof reviewThresholdsSchema>;

export interface CacheConfig {
  urlFetch: {
    dir: string;
    maxSizeBytes: number;
    defaultTtlSeconds: number;
    maxTtlSeconds: number;
    respectCacheControl: boolean;
  };
}

export interface AccountConfig {
  deletionGracePeriodDays: number;
}

/** All rate limit endpoint names. */
export type RateLimitName =
  | "FILE_UPLOAD"
  | "PROGRESS_CHECK"
  | "IMPORT_RETRY"
  | "ADMIN_IMPORT_RESET"
  | "RETRY_RECOMMENDATIONS"
  | "API_GENERAL"
  | "WEBHOOK_TRIGGER"
  | "NEWSLETTER_SUBSCRIBE"
  | "PASSWORD_CHANGE"
  | "EMAIL_CHANGE"
  | "ACCOUNT_DELETION"
  | "DELETION_PASSWORD_ATTEMPTS"
  | "DATA_EXPORT"
  | "REGISTRATION"
  | "LOGIN"
  | "FORGOT_PASSWORD";

export interface AppConfig {
  rateLimits: Record<RateLimitName, RateLimitConfig>;
  quotas: Record<number, UserQuotasConfig>;
  trustLevelRateLimits: Record<number, TrustLevelRateLimitsConfig>;
  batchSizes: BatchSizesConfig;
  cache: CacheConfig;
  account: AccountConfig;
  reviewThresholds: ReviewThresholdsConfig;
}

// ---------------------------------------------------------------------------
// Deep merge utility
// ---------------------------------------------------------------------------

const deepMerge = <T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T => {
  const result = { ...base };

  for (const key of Object.keys(override)) {
    const baseVal = result[key as keyof T];
    const overrideVal = override[key];

    if (
      overrideVal != null &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal != null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>
      );
    } else if (overrideVal !== undefined) {
      (result as Record<string, unknown>)[key] = overrideVal;
    }
  }

  return result;
};

// ---------------------------------------------------------------------------
// Config file path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the config file path. Looks for `config/timetiles.yml` relative
 * to the web app root (apps/web/).
 */
const resolveConfigPath = (): string => {
  // In production Docker container the working dir is /app
  // In development the working dir is the monorepo root
  const devPath = path.resolve("apps/web/config/timetiles.yml");
  const prodPath = path.resolve("config/timetiles.yml");

  if (fs.existsSync(devPath)) return devPath;
  if (fs.existsSync(prodPath)) return prodPath;

  return devPath; // default path (will not exist, handled by caller)
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

const loadFromYaml = (): Record<string, unknown> => {
  const configPath = resolveConfigPath();

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = parseYaml(raw) as unknown;

    if (parsed == null || typeof parsed !== "object") {
      return {};
    }

    // Validate against the YAML schema (all fields optional)
    return yamlConfigSchema.parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist — use all defaults
      return {};
    }
    throw error; // Fail fast on parse/validation errors
  }
};

const buildReviewThresholds = (yamlConfig: Record<string, unknown>): ReviewThresholdsConfig => {
  const yaml = (yamlConfig.reviewThresholds ?? {}) as Partial<ReviewThresholdsConfig>;
  return {
    highDuplicateRate: yaml.highDuplicateRate ?? DEFAULT_REVIEW_THRESHOLDS.highDuplicateRate,
    geocodingPartialFailureRate:
      yaml.geocodingPartialFailureRate ?? DEFAULT_REVIEW_THRESHOLDS.geocodingPartialFailureRate,
    highRowErrorRate: yaml.highRowErrorRate ?? DEFAULT_REVIEW_THRESHOLDS.highRowErrorRate,
    highEmptyRowRate: yaml.highEmptyRowRate ?? DEFAULT_REVIEW_THRESHOLDS.highEmptyRowRate,
  };
};

const buildConfig = (yamlConfig: Record<string, unknown>): AppConfig => {
  // Rate limits: YAML overrides replace entire endpoint configs (not deep-merged)
  const rateLimits = { ...DEFAULT_RATE_LIMITS } as Record<string, RateLimitConfig>;
  if (yamlConfig.rateLimits) {
    const yamlRateLimits = yamlConfig.rateLimits as Record<string, RateLimitConfig>;
    for (const [key, value] of Object.entries(yamlRateLimits)) {
      rateLimits[key] = value;
    }
  }

  // Quotas: deep-merge per trust level
  const quotas = { ...DEFAULT_QUOTAS } as Record<number, UserQuotasConfig>;
  if (yamlConfig.quotas) {
    const yamlQuotas = yamlConfig.quotas as Record<string, Partial<UserQuotasConfig>>;
    for (const [key, value] of Object.entries(yamlQuotas)) {
      const trustLevel = Number(key);
      if (trustLevel in quotas) {
        // Defaults guarantee all fields; YAML partial override is safe
        quotas[trustLevel] = { ...quotas[trustLevel], ...value } as UserQuotasConfig;
      }
    }
  }

  // Trust-level rate limits: deep-merge per trust level
  const trustLevelRateLimits = { ...DEFAULT_TRUST_LEVEL_RATE_LIMITS } as Record<number, TrustLevelRateLimitsConfig>;
  if (yamlConfig.trustLevelRateLimits) {
    const yamlTlrl = yamlConfig.trustLevelRateLimits as Record<string, Partial<TrustLevelRateLimitsConfig>>;
    for (const [key, value] of Object.entries(yamlTlrl)) {
      const trustLevel = Number(key);
      if (trustLevel in trustLevelRateLimits) {
        // Defaults guarantee both FILE_UPLOAD and API_GENERAL; partial override is safe
        trustLevelRateLimits[trustLevel] = {
          ...trustLevelRateLimits[trustLevel],
          ...value,
        } as TrustLevelRateLimitsConfig;
      }
    }
  }

  // Batch sizes: YAML > default
  const yamlBatch = (yamlConfig.batchSizes ?? {}) as Partial<BatchSizesConfig>;
  const batchSizes: BatchSizesConfig = {
    duplicateAnalysis: yamlBatch.duplicateAnalysis ?? DEFAULT_BATCH_SIZES.duplicateAnalysis,
    schemaDetection: yamlBatch.schemaDetection ?? DEFAULT_BATCH_SIZES.schemaDetection,
    eventCreation: yamlBatch.eventCreation ?? DEFAULT_BATCH_SIZES.eventCreation,
    databaseChunk: yamlBatch.databaseChunk ?? DEFAULT_BATCH_SIZES.databaseChunk,
  };

  // Cache: deep-merge YAML onto defaults
  const cache = yamlConfig.cache
    ? (deepMerge(DEFAULT_CACHE, yamlConfig.cache as Record<string, unknown>) as CacheConfig)
    : { ...DEFAULT_CACHE };

  // Account: merge YAML onto defaults
  const account = yamlConfig.account
    ? { ...DEFAULT_ACCOUNT, ...(yamlConfig.account as Partial<AccountConfig>) }
    : { ...DEFAULT_ACCOUNT };

  // Review thresholds: YAML > default
  const reviewThresholds = buildReviewThresholds(yamlConfig);

  return {
    rateLimits: rateLimits as Record<RateLimitName, RateLimitConfig>,
    quotas,
    trustLevelRateLimits,
    batchSizes,
    cache,
    account,
    reviewThresholds,
  };
};

let _config: AppConfig | null = null;

/**
 * Load and validate the application configuration.
 *
 * Reads `config/timetiles.yml` if it exists, merges with defaults,
 * applies env var overrides for batch sizes, and returns a validated config.
 *
 * @throws {z.ZodError} If the YAML file contains invalid values
 * @throws {Error} If the YAML file exists but cannot be parsed
 */
export const getAppConfig = (): AppConfig => {
  if (_config) return _config;
  const yamlConfig = loadFromYaml();
  _config = buildConfig(yamlConfig);
  return _config;
};

/**
 * Reset the cached config (for testing).
 */
export const resetAppConfig = (): void => {
  _config = null;
};
