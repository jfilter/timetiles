/**
 * API key authentication middleware.
 *
 * @module
 * @category Lib
 */

import { timingSafeEqual } from "node:crypto";

import type { MiddlewareHandler } from "hono";

import { AuthError } from "./errors.js";

/** Paths served without a key so an orchestrator can probe an unauthenticated runner. */
const PUBLIC_PATHS = new Set(["/health", "/metrics"]);

/**
 * Bearer-token auth against a fixed API key, compared in constant time.
 *
 * The length check comes first because `timingSafeEqual` throws on differing
 * buffer lengths.
 */
export const createApiKeyAuth =
  (apiKey: string): MiddlewareHandler =>
  async (c, next) => {
    if (PUBLIC_PATHS.has(c.req.path)) {
      return next();
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthError();
    }

    const tokenBuf = Buffer.from(authHeader.slice(7));
    const keyBuf = Buffer.from(apiKey);
    if (tokenBuf.length !== keyBuf.length || !timingSafeEqual(tokenBuf, keyBuf)) {
      throw new AuthError();
    }

    return next();
  };
