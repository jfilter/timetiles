/**
 * Rate limit configuration constants for different endpoints.
 *
 * Defines per-endpoint rate limiting windows (burst, hourly, daily) used by
 * {@link RateLimitService} to enforce request limits.
 *
 * Values are loaded from `config/timetiles.yml` (if present) with hardcoded
 * defaults as fallback. See {@link getAppConfig} for details.
 *
 * @module
 * @category Constants
 */
import type { RateLimitConfig as AppRateLimitConfig, RateLimitName as AppRateLimitName } from "@/lib/config/app-config";
import { getAppConfig } from "@/lib/config/app-config";

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

/** Rate limit configurations for different endpoints, loaded from app config. */
export const RATE_LIMITS: Record<AppRateLimitName, AppRateLimitConfig> = getAppConfig().rateLimits;

/**
 * Union type of all rate limit configuration names.
 */
export type RateLimitName = AppRateLimitName;
