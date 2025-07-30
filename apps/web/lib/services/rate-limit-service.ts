/**
 * Provides a service for rate-limiting requests.
 *
 * This service implements a flexible, in-memory rate-limiting mechanism to protect
 * endpoints from abuse. It tracks requests from different identifiers (like IP addresses
 * or session IDs) and enforces limits based on a specified number of requests within a
 * given time window.
 *
 * Key features include:
 * - Checking if a request is allowed.
 * - Blocking identifiers that exceed the limit.
 * - Providing standard rate-limit headers for HTTP responses.
 * - Automatic cleanup of expired entries.
 * 
 * @category Services
 * @module
 */
import type { Payload } from "payload";

import { createLogger } from "../logger";

const logger = createLogger("rate-limit-service");

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
}

export class RateLimitService {
  private readonly cache: Map<string, RateLimitEntry> = new Map();
  private readonly payload: Payload;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(payload: Payload) {
    this.payload = payload;

    // Clean up expired entries every 5 minutes (skip in test environment)
    if (process.env.NODE_ENV !== "test") {
      logger.info("Starting rate limit cleanup interval");
      this.cleanupInterval = setInterval(
        () => {
          this.cleanup();
        },
        5 * 60 * 1000,
      );
    }
  }

  /**
   * Cleanup method to clear interval and cache
   */
  destroy(): void {
    if (this.cleanupInterval) {
      logger.debug("Destroying rate limit service");
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  /**
   * Check if a request should be rate limited
   * 
   * @param identifier - IP address or session ID
   * @param limit - Maximum requests allowed
   * @param windowMs - Time window in milliseconds
   * @returns Object containing rate limit status
   */
  checkRateLimit(
    identifier: string,
    limit: number = 10,
    windowMs: number = 60 * 60 * 1000, // 1 hour default
  ): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    blocked: boolean;
  } {
    const now = Date.now();
    const entry = this.cache.get(identifier);

    // If no entry exists or window has expired, create new entry
    if (!entry || now >= entry.resetTime) {
      return this.createNewRateLimitEntry(identifier, limit, now, windowMs);
    }

    // If already blocked, deny request
    if (entry.blocked) {
      return this.handleBlockedRequest(identifier, entry);
    }

    // Increment count and check limit
    return this.processRateLimitCheck(identifier, entry, limit);
  }

  private createNewRateLimitEntry(
    identifier: string,
    limit: number,
    now: number,
    windowMs: number,
  ): { allowed: boolean; remaining: number; resetTime: number; blocked: boolean } {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + windowMs,
      blocked: false,
    };
    this.cache.set(identifier, newEntry);

    return {
      allowed: true,
      remaining: limit - 1,
      resetTime: newEntry.resetTime,
      blocked: false,
    };
  }

  private handleBlockedRequest(
    identifier: string,
    entry: RateLimitEntry,
  ): { allowed: boolean; remaining: number; resetTime: number; blocked: boolean } {
    logger.debug({ identifier, resetTime: new Date(entry.resetTime) }, "Request denied - identifier blocked");
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      blocked: true,
    };
  }

  private processRateLimitCheck(
    identifier: string,
    entry: RateLimitEntry,
    limit: number,
  ): { allowed: boolean; remaining: number; resetTime: number; blocked: boolean } {
    // Increment count
    entry.count++;

    // Check if limit exceeded
    if (entry.count > limit) {
      entry.blocked = true;
      logger.info({ identifier, count: entry.count, limit }, "Rate limit exceeded - blocking identifier");

      // Log rate limit violation
      this.logRateLimitViolation(identifier, entry.count, limit);

      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
        blocked: true,
      };
    }

    return {
      allowed: true,
      remaining: limit - entry.count,
      resetTime: entry.resetTime,
      blocked: false,
    };
  }

  /**
   * Get current rate limit status without incrementing
   */
  getRateLimitStatus(identifier: string): {
    count: number;
    resetTime: number;
    blocked: boolean;
  } | null {
    const entry = this.cache.get(identifier);
    if (!entry || Date.now() >= entry.resetTime) {
      return null;
    }
    return { ...entry };
  }

  /**
   * Reset rate limit for an identifier
   */
  resetRateLimit(identifier: string): void {
    this.cache.delete(identifier);
  }

  /**
   * Block an identifier immediately
   */
  blockIdentifier(identifier: string, durationMs: number = 24 * 60 * 60 * 1000): void {
    const entry: RateLimitEntry = {
      count: 999999,
      resetTime: Date.now() + durationMs,
      blocked: true,
    };
    this.cache.set(identifier, entry);
    logger.warn({ identifier, durationMs }, "Identifier blocked");
  }

  /**
   * Get rate limit headers for HTTP responses
   */
  getRateLimitHeaders(identifier: string, limit: number): Record<string, string> {
    const status = this.getRateLimitStatus(identifier);

    if (!status) {
      return {
        "X-RateLimit-Limit": limit.toString(),
        "X-RateLimit-Remaining": limit.toString(),
        "X-RateLimit-Reset": new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };
    }

    return {
      "X-RateLimit-Limit": limit.toString(),
      "X-RateLimit-Remaining": Math.max(0, limit - status.count).toString(),
      "X-RateLimit-Reset": new Date(status.resetTime).toISOString(),
      "X-RateLimit-Blocked": status.blocked.toString(),
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [identifier, entry] of this.cache.entries()) {
      if (now >= entry.resetTime) {
        this.cache.delete(identifier);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      logger.debug({ cleanedCount }, "Cleaned up expired rate limit entries");
    }
  }

  /**
   * Log rate limit violations for monitoring
   */
  private logRateLimitViolation(identifier: string, attemptedCount: number, limit: number): void {
    try {
      logger.warn(
        {
          identifier,
          attemptedCount,
          limit,
        },
        "Rate limit exceeded",
      );

      // You could also store this in a database for monitoring
      // await this.payload.create({
      //   collection: 'rate-limit-violations',
      //   data: {
      //     identifier,
      //     attemptedCount,
      //     limit,
      //     timestamp: new Date().toISOString(),
      //   }
      // })
    } catch (error) {
      logger.error({ error, identifier }, "Failed to log rate limit violation");
    }
  }

  /**
   * Get statistics about current rate limits
   */
  getStatistics(): {
    totalEntries: number;
    blockedEntries: number;
    activeEntries: number;
  } {
    const now = Date.now();
    let blocked = 0;
    let active = 0;

    for (const entry of this.cache.values()) {
      if (now < entry.resetTime) {
        active++;
        if (entry.blocked) {
          blocked++;
        }
      }
    }

    return {
      totalEntries: this.cache.size,
      blockedEntries: blocked,
      activeEntries: active,
    };
  }
}

// Singleton instance - but allow per-test isolation
let rateLimitService: RateLimitService | null = null;

export const getRateLimitService = (payload: Payload): RateLimitService => {
  // In test environment, always create a new instance for isolation
  if (process.env.NODE_ENV === "test") {
    return new RateLimitService(payload);
  }

  if (!rateLimitService) {
    rateLimitService = new RateLimitService(payload);
  }
  return rateLimitService;
};

// Helper function to get client identifier
export const getClientIdentifier = (request: Request): string => {
  // Try to get IP from various headers
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  if (forwarded != null && forwarded !== "") {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  if (realIp != null && realIp !== "") {
    return realIp;
  }

  if (cfConnectingIp != null && cfConnectingIp !== "") {
    return cfConnectingIp;
  }

  // Fallback to a default identifier
  return "unknown";
};

// Rate limit configurations for different endpoints
export const RATE_LIMITS = {
  FILE_UPLOAD: {
    limit: 5, // 5 uploads per hour
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  PROGRESS_CHECK: {
    limit: 100, // 100 checks per hour
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  API_GENERAL: {
    limit: 50, // 50 requests per hour
    windowMs: 60 * 60 * 1000, // 1 hour
  },
} as const;
