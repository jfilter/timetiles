/**
 * Rate limiting middleware for API routes.
 *
 * Provides composable middleware functions that enforce rate limits
 * based on trust levels or specific configurations. Integrates with
 * the existing rate-limit-service for centralized limit management.
 *
 * @module
 * @category Middleware
 */
import config from "@payload-config";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import type { User } from "@/payload-types";

import type { AuthenticatedRequest } from "./auth";

export type RateLimitType = "API_GENERAL" | "FILE_UPLOAD";

interface RateLimitOptions {
  /**
   * Type of rate limit to apply (trust-level based).
   * Use this for general API endpoints that should have different
   * limits based on user trust level.
   */
  type?: RateLimitType;

  /**
   * Specific rate limit configuration to use.
   * Use this for specialized endpoints with fixed limits
   * (e.g., PROGRESS_CHECK for frequently polled endpoints).
   */
  configName?: keyof typeof RATE_LIMITS;
}

/**
 * Middleware that enforces rate limiting on API routes.
 *
 * Can use either trust-level based rate limiting (for general APIs)
 * or specific rate limit configurations (for specialized endpoints).
 *
 * @example
 * ```typescript
 * // Trust-level based rate limiting
 * export const GET = withRateLimit(
 *   withOptionalAuth(handler),
 *   { type: "API_GENERAL" }
 * );
 *
 * // Specific configuration rate limiting
 * export const GET = withRateLimit(
 *   withAuth(handler),
 *   { configName: "PROGRESS_CHECK" }
 * );
 * ```
 */
export const withRateLimit =
  <TContext = unknown>(
    handler: (req: AuthenticatedRequest, context: TContext) => Promise<Response> | Response,
    options?: RateLimitOptions
  ) =>
  async (request: AuthenticatedRequest, context: TContext) => {
    const payload = await getPayload({ config });
    const rateLimitService = getRateLimitService(payload);
    const clientId = getClientIdentifier(request);

    // Check rate limit based on configuration
    const rateLimitCheck = options?.configName
      ? rateLimitService.checkConfiguredRateLimit(clientId, RATE_LIMITS[options.configName])
      : rateLimitService.checkTrustLevelRateLimit(
          clientId,
          request.user as User | null | undefined,
          options?.type ?? "API_GENERAL"
        );

    if (!rateLimitCheck.allowed) {
      const retryAfter = rateLimitCheck.resetTime ? Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000) : 60;

      return NextResponse.json(
        { error: "Too many requests", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    return handler(request, context);
  };
