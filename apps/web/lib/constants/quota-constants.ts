/**
 * Constants for the quota system.
 *
 * This file defines trust levels, default quotas, and quota-related constants
 * used throughout the application to control resource usage and enforce limits.
 *
 * **Design note:** `QUOTA_TYPES` and `USAGE_TYPES` are intentionally separate constants.
 * `QUOTA_TYPES` maps to limit fields (e.g., `maxFileUploadsPerDay`) while `USAGE_TYPES`
 * maps to consumption tracking fields (e.g., `fileUploadsToday`). This distinction
 * reflects the domain model: quotas define ceilings, usage tracks current consumption.
 *
 * @module
 */

/**
 * Trust levels for users, determining their access and resource limits.
 */
export const TRUST_LEVELS = {
  UNTRUSTED: 0,
  BASIC: 1,
  REGULAR: 2,
  TRUSTED: 3,
  POWER_USER: 4,
  UNLIMITED: 5,
} as const;

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
  maxImportJobsPerDay: number;
  maxFileSizeMB: number;
  maxCatalogsPerUser: number;
}

/**
 * User usage tracking interface.
 */
export interface UserUsage {
  currentActiveSchedules: number;
  urlFetchesToday: number;
  fileUploadsToday: number;
  importJobsToday: number;
  totalEventsCreated: number;
  currentCatalogs: number;
  lastResetDate: string;
}

/**
 * Default quotas for each trust level.
 * -1 indicates unlimited.
 */
export const DEFAULT_QUOTAS: Record<TrustLevel, UserQuotas> = {
  [TRUST_LEVELS.UNTRUSTED]: {
    maxActiveSchedules: 0,
    maxUrlFetchesPerDay: 0,
    maxFileUploadsPerDay: 1,
    maxEventsPerImport: 100,
    maxTotalEvents: 100,
    maxImportJobsPerDay: 1,
    maxFileSizeMB: 1,
    maxCatalogsPerUser: 1,
  },
  [TRUST_LEVELS.BASIC]: {
    maxActiveSchedules: 1,
    maxUrlFetchesPerDay: 5,
    maxFileUploadsPerDay: 3,
    maxEventsPerImport: 1000,
    maxTotalEvents: 5000,
    maxImportJobsPerDay: 5,
    maxFileSizeMB: 10,
    maxCatalogsPerUser: 2,
  },
  [TRUST_LEVELS.REGULAR]: {
    maxActiveSchedules: 5,
    maxUrlFetchesPerDay: 20,
    maxFileUploadsPerDay: 10,
    maxEventsPerImport: 10000,
    maxTotalEvents: 50000,
    maxImportJobsPerDay: 20,
    maxFileSizeMB: 50,
    maxCatalogsPerUser: 5,
  },
  [TRUST_LEVELS.TRUSTED]: {
    maxActiveSchedules: 20,
    maxUrlFetchesPerDay: 100,
    maxFileUploadsPerDay: 50,
    maxEventsPerImport: 50000,
    maxTotalEvents: 500000,
    maxImportJobsPerDay: 100,
    maxFileSizeMB: 100,
    maxCatalogsPerUser: 20,
  },
  [TRUST_LEVELS.POWER_USER]: {
    maxActiveSchedules: 100,
    maxUrlFetchesPerDay: 500,
    maxFileUploadsPerDay: 200,
    maxEventsPerImport: 200000,
    maxTotalEvents: 2000000,
    maxImportJobsPerDay: 500,
    maxFileSizeMB: 500,
    maxCatalogsPerUser: 100,
  },
  [TRUST_LEVELS.UNLIMITED]: {
    maxActiveSchedules: -1,
    maxUrlFetchesPerDay: -1,
    maxFileUploadsPerDay: -1,
    maxEventsPerImport: -1,
    maxTotalEvents: -1,
    maxImportJobsPerDay: -1,
    maxFileSizeMB: 1000,
    maxCatalogsPerUser: -1,
  },
};

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
 * Quota type identifiers for tracking and error messages.
 */
export const QUOTA_TYPES = {
  ACTIVE_SCHEDULES: "maxActiveSchedules",
  URL_FETCHES_PER_DAY: "maxUrlFetchesPerDay",
  FILE_UPLOADS_PER_DAY: "maxFileUploadsPerDay",
  EVENTS_PER_IMPORT: "maxEventsPerImport",
  TOTAL_EVENTS: "maxTotalEvents",
  IMPORT_JOBS_PER_DAY: "maxImportJobsPerDay",
  FILE_SIZE_MB: "maxFileSizeMB",
  CATALOGS_PER_USER: "maxCatalogsPerUser",
} as const;

export type QuotaType = (typeof QUOTA_TYPES)[keyof typeof QUOTA_TYPES];

/**
 * Usage type identifiers for tracking.
 */
export const USAGE_TYPES = {
  CURRENT_ACTIVE_SCHEDULES: "currentActiveSchedules",
  URL_FETCHES_TODAY: "urlFetchesToday",
  FILE_UPLOADS_TODAY: "fileUploadsToday",
  IMPORT_JOBS_TODAY: "importJobsToday",
  TOTAL_EVENTS_CREATED: "totalEventsCreated",
  CURRENT_CATALOGS: "currentCatalogs",
} as const;

export type UsageType = (typeof USAGE_TYPES)[keyof typeof USAGE_TYPES];

/**
 * Rate limit configurations by trust level.
 * Each level has progressively more generous limits.
 */
export const RATE_LIMITS_BY_TRUST_LEVEL = {
  [TRUST_LEVELS.UNTRUSTED]: {
    FILE_UPLOAD: {
      windows: [
        { limit: 1, windowMs: 60 * 1000, name: "burst" }, // 1 per minute
        { limit: 1, windowMs: 60 * 60 * 1000, name: "hourly" }, // 1 per hour
        { limit: 1, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 1 per day
      ],
    },
    API_GENERAL: {
      windows: [
        { limit: 1, windowMs: 1000, name: "burst" }, // 1 per second
        { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" }, // 10 per hour
      ],
    },
  },
  [TRUST_LEVELS.BASIC]: {
    FILE_UPLOAD: {
      windows: [
        { limit: 1, windowMs: 10 * 1000, name: "burst" }, // 1 per 10 seconds
        { limit: 3, windowMs: 60 * 60 * 1000, name: "hourly" }, // 3 per hour
        { limit: 3, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 3 per day
      ],
    },
    API_GENERAL: {
      windows: [
        { limit: 2, windowMs: 1000, name: "burst" }, // 2 per second
        { limit: 30, windowMs: 60 * 60 * 1000, name: "hourly" }, // 30 per hour
      ],
    },
  },
  [TRUST_LEVELS.REGULAR]: {
    FILE_UPLOAD: {
      windows: [
        { limit: 1, windowMs: 5 * 1000, name: "burst" }, // 1 per 5 seconds
        { limit: 5, windowMs: 60 * 60 * 1000, name: "hourly" }, // 5 per hour
        { limit: 20, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 20 per day
      ],
    },
    API_GENERAL: {
      windows: [
        { limit: 5, windowMs: 1000, name: "burst" }, // 5 per second
        { limit: 50, windowMs: 60 * 60 * 1000, name: "hourly" }, // 50 per hour
      ],
    },
  },
  [TRUST_LEVELS.TRUSTED]: {
    FILE_UPLOAD: {
      windows: [
        { limit: 2, windowMs: 5 * 1000, name: "burst" }, // 2 per 5 seconds
        { limit: 20, windowMs: 60 * 60 * 1000, name: "hourly" }, // 20 per hour
        { limit: 50, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 50 per day
      ],
    },
    API_GENERAL: {
      windows: [
        { limit: 10, windowMs: 1000, name: "burst" }, // 10 per second
        { limit: 200, windowMs: 60 * 60 * 1000, name: "hourly" }, // 200 per hour
      ],
    },
  },
  [TRUST_LEVELS.POWER_USER]: {
    FILE_UPLOAD: {
      windows: [
        { limit: 5, windowMs: 5 * 1000, name: "burst" }, // 5 per 5 seconds
        { limit: 100, windowMs: 60 * 60 * 1000, name: "hourly" }, // 100 per hour
        { limit: 200, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 200 per day
      ],
    },
    API_GENERAL: {
      windows: [
        { limit: 20, windowMs: 1000, name: "burst" }, // 20 per second
        { limit: 1000, windowMs: 60 * 60 * 1000, name: "hourly" }, // 1000 per hour
      ],
    },
  },
  [TRUST_LEVELS.UNLIMITED]: {
    FILE_UPLOAD: {
      windows: [
        { limit: 10, windowMs: 1000, name: "burst" }, // 10 per second
        { limit: 1000, windowMs: 60 * 60 * 1000, name: "hourly" }, // 1000 per hour
      ],
    },
    API_GENERAL: {
      windows: [
        { limit: 100, windowMs: 1000, name: "burst" }, // 100 per second
        { limit: 10000, windowMs: 60 * 60 * 1000, name: "hourly" }, // 10000 per hour
      ],
    },
  },
} as const;

/**
 * Error messages for quota exceeded scenarios.
 */
export const QUOTA_ERROR_MESSAGES: Record<QuotaType, (current: number, limit: number) => string> = {
  [QUOTA_TYPES.ACTIVE_SCHEDULES]: (current, limit) =>
    `Maximum active schedules reached (${current}/${limit}). Disable an existing schedule to add more.`,
  [QUOTA_TYPES.URL_FETCHES_PER_DAY]: (current, limit) =>
    `Daily URL fetch limit reached (${current}/${limit}). Resets at midnight UTC.`,
  [QUOTA_TYPES.FILE_UPLOADS_PER_DAY]: (current, limit) =>
    `Daily file upload limit reached (${current}/${limit}). Resets at midnight UTC.`,
  [QUOTA_TYPES.EVENTS_PER_IMPORT]: (_current, limit) =>
    `This import would exceed the maximum events per import (${limit}). Please reduce the import size.`,
  [QUOTA_TYPES.TOTAL_EVENTS]: (current, limit) =>
    `Total events limit reached (${current}/${limit}). Contact admin for increased quota.`,
  [QUOTA_TYPES.IMPORT_JOBS_PER_DAY]: (current, limit) =>
    `Daily import job limit reached (${current}/${limit}). Resets at midnight UTC.`,
  [QUOTA_TYPES.FILE_SIZE_MB]: (_current, limit) =>
    `File size exceeds your limit (${limit}MB). Contact admin for increased quota.`,
  [QUOTA_TYPES.CATALOGS_PER_USER]: (current, limit) =>
    `Maximum catalogs reached (${current}/${limit}). Delete an existing catalog to create more.`,
};
