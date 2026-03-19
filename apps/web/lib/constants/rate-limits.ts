/**
 * Rate limit configuration constants for different endpoints.
 *
 * Defines per-endpoint rate limiting windows (burst, hourly, daily) used by
 * {@link RateLimitService} to enforce request limits.
 *
 * @module
 * @category Constants
 */

/**
 * Configuration for a single rate limit window.
 */
export interface RateLimitWindow {
  /** Maximum number of requests allowed in this window */
  limit: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Optional name for this window (e.g., "burst", "hourly", "daily") */
  name?: string;
}

/**
 * Configuration for multi-window rate limiting.
 */
export interface RateLimitConfig {
  windows: readonly RateLimitWindow[] | RateLimitWindow[];
}

// Rate limit configurations for different endpoints
export const RATE_LIMITS = {
  FILE_UPLOAD: {
    windows: [
      { limit: 1, windowMs: 5 * 1000, name: "burst" }, // 1 per 5 seconds
      { limit: 5, windowMs: 60 * 60 * 1000, name: "hourly" }, // 5 per hour
      { limit: 20, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 20 per day
    ],
  },
  PROGRESS_CHECK: {
    windows: [
      { limit: 10, windowMs: 1000, name: "burst" }, // 10 per second
      { limit: 3600, windowMs: 60 * 60 * 1000, name: "hourly" }, // 1 per second sustained
    ],
  },
  IMPORT_RETRY: {
    windows: [
      { limit: 1, windowMs: 60 * 1000, name: "burst" }, // 1 per minute
      { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" }, // 10 per hour
      { limit: 50, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 50 per day
    ],
  },
  ADMIN_IMPORT_RESET: {
    windows: [
      { limit: 5, windowMs: 60 * 1000, name: "burst" }, // 5 per minute (admins may need to reset multiple jobs)
      { limit: 50, windowMs: 60 * 60 * 1000, name: "hourly" }, // 50 per hour
    ],
  },
  RETRY_RECOMMENDATIONS: {
    windows: [
      { limit: 10, windowMs: 60 * 1000, name: "burst" }, // 10 per minute
      { limit: 100, windowMs: 60 * 60 * 1000, name: "hourly" }, // 100 per hour
    ],
  },
  API_GENERAL: {
    windows: [
      { limit: 5, windowMs: 1000, name: "burst" }, // 5 per second
      { limit: 50, windowMs: 60 * 60 * 1000, name: "hourly" }, // 50 per hour
    ],
  },
  WEBHOOK_TRIGGER: {
    windows: [
      { limit: 1, windowMs: 10 * 1000, name: "burst" }, // 1 per 10 seconds (prevents race conditions)
      { limit: 5, windowMs: 60 * 60 * 1000, name: "hourly" }, // 5 per hour (prevents abuse)
    ],
  },
  NEWSLETTER_SUBSCRIBE: {
    windows: [
      { limit: 1, windowMs: 10 * 1000, name: "burst" }, // 1 per 10 seconds (prevents spam)
      { limit: 3, windowMs: 60 * 60 * 1000, name: "hourly" }, // 3 per hour (allows retry if typo/error)
      { limit: 10, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 10 per day (generous but prevents abuse)
    ],
  },
  PASSWORD_CHANGE: {
    windows: [
      { limit: 3, windowMs: 60 * 1000, name: "burst" }, // 3 per minute (allows for typos)
      { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" }, // 10 per hour
      { limit: 20, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 20 per day
    ],
  },
  EMAIL_CHANGE: {
    windows: [
      { limit: 3, windowMs: 60 * 1000, name: "burst" }, // 3 per minute (allows for typos)
      { limit: 5, windowMs: 60 * 60 * 1000, name: "hourly" }, // 5 per hour
      { limit: 10, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 10 per day
    ],
  },
  ACCOUNT_DELETION: {
    windows: [
      { limit: 3, windowMs: 60 * 60 * 1000, name: "hourly" }, // 3 per hour
      { limit: 5, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 5 per day
    ],
  },
  DELETION_PASSWORD_ATTEMPTS: {
    windows: [
      { limit: 5, windowMs: 60 * 1000, name: "burst" }, // 5 per minute
      { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" }, // 10 per hour
    ],
  },
  DATA_EXPORT: {
    windows: [
      { limit: 1, windowMs: 60 * 60 * 1000, name: "hourly" }, // 1 per hour
      { limit: 3, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 3 per day
    ],
  },
  REGISTRATION: {
    windows: [
      { limit: 3, windowMs: 60 * 1000, name: "burst" }, // 3 per minute
      { limit: 10, windowMs: 60 * 60 * 1000, name: "hourly" }, // 10 per hour
      { limit: 20, windowMs: 24 * 60 * 60 * 1000, name: "daily" }, // 20 per day
    ],
  },
} as const;

/**
 * Union type of all rate limit configuration names.
 */
export type RateLimitName = keyof typeof RATE_LIMITS;
