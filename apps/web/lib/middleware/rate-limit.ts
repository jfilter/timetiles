/**
 * Rate limiting utilities for API routes.
 *
 * Provides a rate limit check function used by `apiRoute` to enforce
 * trust-level or configuration-based rate limits.
 *
 * @module
 * @category Middleware
 */
import config from "@payload-config";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { RATE_LIMITS, type RateLimitConfig } from "@/lib/constants/rate-limits";
import { getClientIdentifier, getRateLimitService } from "@/lib/services/rate-limit-service";
import type { User } from "@/payload-types";

export type RateLimitType = "API_GENERAL" | "FILE_UPLOAD";

export interface RateLimitOptions {
  /**
   * Type of rate limit to apply (trust-level based).
   * Use this for general API endpoints that should have different
   * limits based on user trust level.
   */
  type?: RateLimitType;

  /**
   * Specific rate limit configuration to use from RATE_LIMITS.
   * Use this for specialized endpoints with fixed limits
   * (e.g., PROGRESS_CHECK for frequently polled endpoints).
   */
  configName?: keyof typeof RATE_LIMITS;

  /**
   * Inline rate limit configuration (for configs not in RATE_LIMITS).
   * Takes precedence over configName if both are provided.
   */
  config?: RateLimitConfig;

  /**
   * Custom key prefix for rate limiting. When provided, the rate limit
   * key is built from this prefix instead of the client IP.
   *
   * - String: used as `${keyPrefix}` directly
   * - Function: called with the authenticated user to build the key
   *
   * Requires auth to run before rate limiting (handled by apiRoute).
   */
  keyPrefix?: string | ((user: User | undefined) => string);
}

/**
 * Check rate limit and return a 429 Response if exceeded, or null if allowed.
 *
 * Used by `apiRoute` for post-auth rate limiting.
 */
export const checkRateLimit = async (
  request: Request,
  user: User | undefined,
  options: RateLimitOptions
): Promise<Response | null> => {
  const payload = await getPayload({ config });
  const rateLimitService = getRateLimitService(payload);
  const clientId = getClientIdentifier(request);

  // Resolve the rate limit key
  let key = clientId;
  if (typeof options.keyPrefix === "function") {
    key = options.keyPrefix(user);
  } else if (typeof options.keyPrefix === "string") {
    key = options.keyPrefix;
  }

  // Resolve the rate limit config
  const rateLimitConfig = options.config ?? (options.configName ? RATE_LIMITS[options.configName] : undefined);

  // Check rate limit based on configuration
  const rateLimitCheck = rateLimitConfig
    ? await rateLimitService.checkConfiguredRateLimit(key, rateLimitConfig)
    : await rateLimitService.checkTrustLevelRateLimit(key, user, options.type ?? "API_GENERAL");

  if (!rateLimitCheck.allowed) {
    const retryAfter = rateLimitCheck.resetTime ? Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000) : 60;

    return NextResponse.json(
      { error: "Too many requests", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  return null;
};
