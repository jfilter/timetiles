/**
 * Constants for the quota system.
 *
 * This file defines trust levels, default quotas, and quota descriptors
 * used throughout the application to control resource usage and enforce limits.
 *
 * Each quota is defined as a single {@link QuotaDescriptor} in the {@link QUOTAS}
 * registry, linking the limit field, usage field, daily flag, and error message
 * in one place.
 *
 * Numeric quota values are loaded from `config/timetiles.yml` (if present) with
 * hardcoded defaults as fallback. See {@link getAppConfig} for details.
 *
 * @module
 */
import type { TrustLevelRateLimitsConfig } from "@/lib/config/app-config";
import { getAppConfig } from "@/lib/config/app-config";
import { parseStrictInteger } from "@/lib/utils/event-params";

/**
 * Trust levels for users, determining their access and resource limits.
 */
export const TRUST_LEVELS = { UNTRUSTED: 0, BASIC: 1, REGULAR: 2, TRUSTED: 3, POWER_USER: 4, UNLIMITED: 5 } as const;

export type TrustLevel = (typeof TRUST_LEVELS)[keyof typeof TRUST_LEVELS];

/**
 * User quota configuration interface.
 */
export interface UserQuotas {
  maxActiveSchedules: number;
  maxUrlFetchesPerDay: number;
  maxFileUploadsPerDay: number;
  maxEventsPerImport: number;
  maxTotalEvents: number;
  maxIngestJobsPerDay: number;
  maxFileSizeMB: number;
  maxCatalogsPerUser: number;
  maxScraperRepos: number;
  maxScraperRunsPerDay: number;
}

/**
 * User usage tracking interface.
 */
export interface UserUsage {
  currentActiveSchedules: number;
  urlFetchesToday: number;
  fileUploadsToday: number;
  ingestJobsToday: number;
  totalEventsCreated: number;
  currentCatalogs: number;
  currentScraperRepos: number;
  scraperRunsToday: number;
  lastResetDate: string;
}

/**
 * Default quotas for each trust level, loaded from app config.
 * -1 indicates unlimited.
 */
export const DEFAULT_QUOTAS: Record<TrustLevel, UserQuotas> = getAppConfig().quotas as Record<TrustLevel, UserQuotas>;

/**
 * Trust level labels for UI display.
 */
export const TRUST_LEVEL_LABELS: Record<TrustLevel, string> = {
  [TRUST_LEVELS.UNTRUSTED]: "Untrusted",
  [TRUST_LEVELS.BASIC]: "Basic User",
  [TRUST_LEVELS.REGULAR]: "Regular User",
  [TRUST_LEVELS.TRUSTED]: "Trusted User",
  [TRUST_LEVELS.POWER_USER]: "Power User",
  [TRUST_LEVELS.UNLIMITED]: "Unlimited",
};

/**
 * Trust level descriptions for UI tooltips.
 */
export const TRUST_LEVEL_DESCRIPTIONS: Record<TrustLevel, string> = {
  [TRUST_LEVELS.UNTRUSTED]: "New or suspicious users with minimal access",
  [TRUST_LEVELS.BASIC]: "Users with basic access and conservative limits",
  [TRUST_LEVELS.REGULAR]: "Standard users with normal operational limits",
  [TRUST_LEVELS.TRUSTED]: "Trusted users with enhanced access and relaxed limits",
  [TRUST_LEVELS.POWER_USER]: "Advanced users with generous resource allowances",
  [TRUST_LEVELS.UNLIMITED]: "Administrators with no restrictions",
};

/**
 * A quota descriptor links the limit field, usage tracking field, daily flag,
 * and error message for a single quota type.
 */
export interface QuotaDescriptor {
  /** Field name on {@link UserQuotas} (the ceiling). */
  limitField: keyof UserQuotas;
  /** Field name on {@link UserUsage} (the counter), or null for check-only quotas (e.g. file size). */
  usageField: keyof Omit<UserUsage, "lastResetDate"> | null;
  /** Whether this quota resets daily at midnight UTC. */
  daily: boolean;
  /** Human-readable error message when quota is exceeded. */
  errorMessage: (current: number, limit: number) => string;
}

/**
 * Registry of all quota types. Each key is used as the sole identifier
 * when checking, incrementing, or decrementing quotas.
 */
export const QUOTAS = {
  ACTIVE_SCHEDULES: {
    limitField: "maxActiveSchedules",
    usageField: "currentActiveSchedules",
    daily: false,
    errorMessage: (current: number, limit: number) =>
      `Maximum active schedules reached (${current}/${limit}). Disable an existing schedule to add more.`,
  },
  URL_FETCHES_PER_DAY: {
    limitField: "maxUrlFetchesPerDay",
    usageField: "urlFetchesToday",
    daily: true,
    errorMessage: (current: number, limit: number) =>
      `Daily URL fetch limit reached (${current}/${limit}). Resets at midnight UTC.`,
  },
  FILE_UPLOADS_PER_DAY: {
    limitField: "maxFileUploadsPerDay",
    usageField: "fileUploadsToday",
    daily: true,
    errorMessage: (current: number, limit: number) =>
      `Daily file upload limit reached (${current}/${limit}). Resets at midnight UTC.`,
  },
  EVENTS_PER_IMPORT: {
    limitField: "maxEventsPerImport",
    usageField: null,
    daily: false,
    errorMessage: (_current: number, limit: number) =>
      `This import would exceed the maximum events per import (${limit}). Please reduce the import size.`,
  },
  TOTAL_EVENTS: {
    limitField: "maxTotalEvents",
    usageField: "totalEventsCreated",
    daily: false,
    errorMessage: (current: number, limit: number) =>
      `Total events limit reached (${current}/${limit}). Contact admin for increased quota.`,
  },
  IMPORT_JOBS_PER_DAY: {
    limitField: "maxIngestJobsPerDay",
    usageField: "ingestJobsToday",
    daily: true,
    errorMessage: (current: number, limit: number) =>
      `Daily import job limit reached (${current}/${limit}). Resets at midnight UTC.`,
  },
  FILE_SIZE_MB: {
    limitField: "maxFileSizeMB",
    usageField: null,
    daily: false,
    errorMessage: (_current: number, limit: number) =>
      `File size exceeds your limit (${limit}MB). Contact admin for increased quota.`,
  },
  CATALOGS_PER_USER: {
    limitField: "maxCatalogsPerUser",
    usageField: "currentCatalogs",
    daily: false,
    errorMessage: (current: number, limit: number) =>
      `Maximum catalogs reached (${current}/${limit}). Delete an existing catalog to create more.`,
  },
  SCRAPER_REPOS: {
    limitField: "maxScraperRepos",
    usageField: "currentScraperRepos",
    daily: false,
    errorMessage: (current: number, limit: number) =>
      `Maximum scraper repos reached (${current}/${limit}). Delete an existing repo to create more.`,
  },
  SCRAPER_RUNS_PER_DAY: {
    limitField: "maxScraperRunsPerDay",
    usageField: "scraperRunsToday",
    daily: true,
    errorMessage: (current: number, limit: number) =>
      `Daily scraper run limit reached (${current}/${limit}). Resets at midnight UTC.`,
  },
} as const satisfies Record<string, QuotaDescriptor>;

/**
 * Normalize a trust level value to a valid {@link TrustLevel}.
 *
 * Parses the input as a strict integer and validates it against known trust levels.
 * Falls back to {@link TRUST_LEVELS.REGULAR} for invalid or missing values.
 */
export const normalizeTrustLevel = (trustLevel: string | number | null | undefined): TrustLevel => {
  const parsedTrustLevel = parseStrictInteger(trustLevel ?? TRUST_LEVELS.REGULAR);

  if (parsedTrustLevel != null && parsedTrustLevel in DEFAULT_QUOTAS) {
    return parsedTrustLevel as TrustLevel;
  }

  return TRUST_LEVELS.REGULAR;
};

/** Key identifying a quota in the {@link QUOTAS} registry. */
export type QuotaKey = keyof typeof QUOTAS;

/**
 * Rate limit configurations by trust level, loaded from app config.
 * Each level has progressively more generous limits.
 */
export const RATE_LIMITS_BY_TRUST_LEVEL: Record<TrustLevel, TrustLevelRateLimitsConfig> = getAppConfig()
  .trustLevelRateLimits as Record<TrustLevel, TrustLevelRateLimitsConfig>;
