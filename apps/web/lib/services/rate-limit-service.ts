/**
 * Flexible, in-memory rate limiter for HTTP endpoints.
 *
 * Tracks requests per identifier (IP, session) across multi-window configs
 * (burst / hourly / daily), supports trust-level-aware limits, emits standard
 * rate-limit headers, and prunes expired entries automatically.
 *
 * For the rate-limit-vs-quota comparison and the canonical usage pattern
 * (rate-limit check -> quota check -> action), see
 * `docs/adr/0026-quota-system.md#quotas-vs-rate-limiting`.
 *
 * @see {@link QuotaService} for long-term resource management
 *
 * @category Services
 * @module
 */
import { BlockList, isIP } from "node:net";

import type { Payload } from "payload";

import { getEnv } from "@/lib/config/env";
import { normalizeTrustLevel, RATE_LIMITS_BY_TRUST_LEVEL, TRUST_LEVELS } from "@/lib/constants/quota-constants";
import { RATE_LIMITS, type RateLimitConfig, type RateLimitWindow } from "@/lib/constants/rate-limits";
import type { User } from "@/payload-types";

import { createLogger } from "../logger";

const logger = createLogger("rate-limit-service");

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
}

/**
 * Result from checking multiple rate limit windows.
 */
export interface MultiWindowRateLimitResult {
  /** Whether the request is allowed (passes all windows) */
  allowed: boolean;
  /** Name of the window that failed (if any) */
  failedWindow?: string;
  /** Time when the failed window resets */
  resetTime?: number;
  /** Remaining requests in the most restrictive window */
  remaining?: number;
  /** Details of the check that failed */
  details?: { limit: number; windowMs: number; remaining: number; resetTime: number };
}

export class RateLimitService {
  private readonly cache: Map<string, RateLimitEntry> = new Map();
  private readonly payload: Payload;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly instanceId: string;

  constructor(payload: Payload) {
    this.payload = payload;
    // eslint-disable-next-line sonarjs/pseudo-random -- Safe for debug instance IDs
    this.instanceId = Math.random().toString(36).substring(7);

    // Clean up expired entries every 5 minutes (skip in test environment)
    if (getEnv().NODE_ENV !== "test") {
      logger.info("Starting rate limit cleanup interval");
      this.cleanupInterval = setInterval(
        () => {
          this.cleanup();
        },
        5 * 60 * 1000
      );
    }
  }

  /**
   * Cleanup method to clear interval and cache.
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
   * Check if a request should be rate limited.
   *
   * @param identifier - IP address or session ID.
   * @param limit - Maximum requests allowed
   * @param windowMs - Time window in milliseconds
   * @returns Object containing rate limit status
   */
  checkRateLimit(
    identifier: string,
    limit: number = 10,
    windowMs: number = 60 * 60 * 1000 // 1 hour default
  ): { allowed: boolean; remaining: number; resetTime: number; blocked: boolean } {
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
    windowMs: number
  ): { allowed: boolean; remaining: number; resetTime: number; blocked: boolean } {
    const newEntry: RateLimitEntry = { count: 1, resetTime: now + windowMs, blocked: false };
    this.cache.set(identifier, newEntry);

    return { allowed: true, remaining: limit - 1, resetTime: newEntry.resetTime, blocked: false };
  }

  private handleBlockedRequest(
    identifier: string,
    entry: RateLimitEntry
  ): { allowed: boolean; remaining: number; resetTime: number; blocked: boolean } {
    logger.debug({ identifier, resetTime: new Date(entry.resetTime) }, "Request denied - identifier blocked");
    return { allowed: false, remaining: 0, resetTime: entry.resetTime, blocked: true };
  }

  private processRateLimitCheck(
    identifier: string,
    entry: RateLimitEntry,
    limit: number
  ): { allowed: boolean; remaining: number; resetTime: number; blocked: boolean } {
    // Increment count
    entry.count++;

    // Check if limit exceeded
    if (entry.count > limit) {
      entry.blocked = true;
      this.logRateLimitViolation(identifier, entry.count, limit);

      return { allowed: false, remaining: 0, resetTime: entry.resetTime, blocked: true };
    }

    return { allowed: true, remaining: limit - entry.count, resetTime: entry.resetTime, blocked: false };
  }

  /**
   * Check multiple rate limit windows for a single identifier.
   *
   * This method checks all configured windows and returns on the first failure.
   * It's useful for implementing complex rate limiting strategies like:
   * - Burst protection (e.g., 1 request per 10 seconds)
   * - Hourly limits (e.g., 5 requests per hour)
   * - Daily limits (e.g., 100 requests per day).
   *
   * @param baseIdentifier - Base identifier for the request (e.g., "webhook:token123").
   * @param windows - Array of rate limit windows to check.
   * @returns Result indicating if request is allowed and which window failed (if any).
   */
  checkMultiWindowRateLimit(
    baseIdentifier: string,
    windows: readonly RateLimitWindow[] | RateLimitWindow[]
  ): MultiWindowRateLimitResult {
    // Find the most restrictive remaining count for allowed requests
    let minRemaining = Number.MAX_SAFE_INTEGER;

    for (const window of windows) {
      const windowName = window.name ?? `${window.windowMs}ms`;
      const identifier = `${baseIdentifier}:${windowName}`;
      const check = this.checkRateLimit(identifier, window.limit, window.windowMs);

      // Track minimum remaining across all windows
      if (check.allowed && check.remaining < minRemaining) {
        minRemaining = check.remaining;
      }

      // Return immediately on first failure
      if (!check.allowed) {
        return {
          allowed: false,
          failedWindow: windowName,
          resetTime: check.resetTime,
          remaining: 0,
          details: {
            limit: window.limit,
            windowMs: window.windowMs,
            remaining: check.remaining,
            resetTime: check.resetTime,
          },
        };
      }
    }

    // All windows passed
    return { allowed: true, remaining: minRemaining };
  }

  /**
   * Check rate limits using a configuration object.
   *
   * @param baseIdentifier - Base identifier for the request.
   * @param config - Rate limit configuration with windows.
   * @returns Result indicating if request is allowed.
   */
  checkConfiguredRateLimit(baseIdentifier: string, config: RateLimitConfig): MultiWindowRateLimitResult {
    // Convert readonly array to mutable array for the method call
    const windows = [...config.windows];
    return this.checkMultiWindowRateLimit(baseIdentifier, windows);
  }

  /**
   * Get current rate limit status without incrementing.
   */
  getRateLimitStatus(identifier: string): { count: number; resetTime: number; blocked: boolean } | null {
    const entry = this.cache.get(identifier);
    if (!entry || Date.now() >= entry.resetTime) {
      return null;
    }
    return { ...entry };
  }

  /**
   * Reset rate limit for an identifier.
   */
  resetRateLimit(identifier: string): void {
    this.cache.delete(identifier);
  }

  /**
   * Block an identifier immediately.
   */
  blockIdentifier(identifier: string, durationMs: number = 24 * 60 * 60 * 1000): void {
    const entry: RateLimitEntry = { count: 999999, resetTime: Date.now() + durationMs, blocked: true };
    this.cache.set(identifier, entry);
    logger.warn({ identifier, durationMs }, "Identifier blocked");
  }

  /**
   * Get rate limit headers for HTTP responses.
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
   * Clean up expired entries.
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
   * Log rate limit violations for monitoring.
   */
  private logRateLimitViolation(identifier: string, attemptedCount: number, limit: number): void {
    try {
      logger.warn({ identifier, attemptedCount, limit }, "Rate limit exceeded");
    } catch (error) {
      logger.error({ error, identifier }, "Failed to log rate limit violation");
    }
  }

  /**
   * Get statistics about current rate limits.
   */
  getStatistics(): { totalEntries: number; blockedEntries: number; activeEntries: number } {
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

    return { totalEntries: this.cache.size, blockedEntries: blocked, activeEntries: active };
  }

  /**
   * Get rate limit configuration based on user trust level.
   *
   * @param user - The user object containing trust level
   * @param endpointType - The type of endpoint (FILE_UPLOAD, API_GENERAL, etc.)
   * @returns Rate limit configuration for the user's trust level
   */
  getRateLimitsByTrustLevel(
    user: User | null | undefined,
    endpointType: "FILE_UPLOAD" | "API_GENERAL"
  ): RateLimitConfig {
    // Default to most restrictive for unauthenticated users
    if (!user) {
      return RATE_LIMITS_BY_TRUST_LEVEL[TRUST_LEVELS.UNTRUSTED][endpointType];
    }

    // Get user's trust level or default to REGULAR
    const trustLevel = normalizeTrustLevel(user.trustLevel);

    // Get rate limits for this trust level
    const trustLevelLimits = RATE_LIMITS_BY_TRUST_LEVEL[trustLevel];

    if (!trustLevelLimits?.[endpointType]) {
      // Fallback to default rate limits if trust level config not found
      logger.warn("Rate limit config not found for trust level", { trustLevel, endpointType });
      return RATE_LIMITS[endpointType] || RATE_LIMITS.API_GENERAL;
    }

    return trustLevelLimits[endpointType];
  }

  /**
   * Check rate limits with trust level awareness.
   *
   * @param identifier - IP address or session ID
   * @param user - User object to determine trust level
   * @param endpointType - The type of endpoint
   * @returns Multi-window rate limit result
   */
  checkTrustLevelRateLimit(
    identifier: string,
    user: User | null | undefined,
    endpointType: "FILE_UPLOAD" | "API_GENERAL"
  ): MultiWindowRateLimitResult {
    const rateLimitConfig = this.getRateLimitsByTrustLevel(user, endpointType);

    // Add user info to identifier for user-specific rate limiting
    const userIdentifier = user ? `${identifier}:user:${user.id}` : identifier;

    return this.checkConfiguredRateLimit(userIdentifier, rateLimitConfig);
  }
}

// Singleton: must be shared across requests because the in-memory rate limit
// cache and cleanup interval are process-level state. Creating a fresh instance
// per request would reset all counters and break rate limiting.
// NOTE: This assumes a single-process deployment. Multi-process scaling would
// require a Redis-backed rate limiter instead of the in-memory Map.
let rateLimitService: RateLimitService | null = null;

export const getRateLimitService = (payload: Payload): RateLimitService => {
  rateLimitService ??= new RateLimitService(payload);
  return rateLimitService;
};

/**
 * Reset the rate limit service singleton (for testing).
 * Call this in afterEach/afterAll to ensure clean state between tests.
 */
export const resetRateLimitService = (): void => {
  if (rateLimitService) {
    rateLimitService.destroy();
    rateLimitService = null;
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Client identification with trusted-proxy support
// ───────────────────────────────────────────────────────────────────────────
//
// SECURITY: `X-Forwarded-For` / `X-Real-IP` / `CF-Connecting-IP` are attacker-
// controlled when the app is reached directly (no proxy in front). If we trust
// them unconditionally, a client can spoof their IP and defeat per-IP rate
// limits.
//
// Trust contract: the env var `TRUSTED_PROXY_CIDRS` is a comma-separated CIDR
// allowlist of *upstream hops* the operator controls (reverse proxies, load
// balancers, CDN egress). When set, we walk `X-Forwarded-For` right-to-left
// skipping IPs inside those ranges and return the first untrusted one — that
// is the client as observed by the outermost trusted proxy.
//
// Next.js App Router does not expose the raw socket peer on `NextRequest`, so
// we cannot cross-check that the immediate TCP peer is trusted. The CIDR
// allowlist is therefore an allowlist of *forwarded-chain segments* rather
// than of socket peers. This is the simpler of the two modes described in
// the fix proposal and is safe as long as the operator terminates all traffic
// through one of the listed CIDRs.
//
// When the env var is empty (default), no chain walking happens: we fall back
// to the first entry of `X-Forwarded-For` (or X-Real-IP / CF-Connecting-IP)
// and emit a single warning per process. Operators in front of a proxy must
// set `TRUSTED_PROXY_CIDRS`; operators with no proxy should also set it to
// something harmless (e.g. `127.0.0.1/32`) to suppress the warning and the
// chain walk.

interface ParsedCidr {
  address: string;
  prefix: number;
  family: "ipv4" | "ipv6";
}

const parseCidr = (entry: string): ParsedCidr | null => {
  const trimmed = entry.trim();
  if (trimmed === "") return null;
  const [rawAddr, rawPrefix] = trimmed.split("/");
  if (rawAddr == null || rawAddr === "") return null;
  const family = isIP(rawAddr);
  if (family === 0) return null;
  const maxPrefix = family === 4 ? 32 : 128;
  const prefix = rawPrefix == null || rawPrefix === "" ? maxPrefix : Number(rawPrefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) return null;
  return { address: rawAddr, prefix, family: family === 4 ? "ipv4" : "ipv6" };
};

let trustedBlockList: BlockList | null = null;
let trustedCidrSource: string | null = null;
let emittedNoTrustWarning = false;

/**
 * Build (and cache) a `net.BlockList` from `TRUSTED_PROXY_CIDRS`. Returns
 * `null` when the env var is empty or every entry is invalid.
 */
const getTrustedProxyBlockList = (): BlockList | null => {
  const raw = getEnv().TRUSTED_PROXY_CIDRS;
  if (raw === trustedCidrSource) return trustedBlockList;
  trustedCidrSource = raw;

  if (raw.trim() === "") {
    trustedBlockList = null;
    return null;
  }

  const list = new BlockList();
  let added = 0;
  for (const entry of raw.split(",")) {
    const parsed = parseCidr(entry);
    if (parsed == null) {
      logger.warn({ entry }, "Ignoring invalid TRUSTED_PROXY_CIDRS entry");
      continue;
    }
    try {
      list.addSubnet(parsed.address, parsed.prefix, parsed.family);
      added++;
    } catch (error) {
      logger.warn({ entry, error }, "Failed to add TRUSTED_PROXY_CIDRS entry");
    }
  }

  trustedBlockList = added > 0 ? list : null;
  return trustedBlockList;
};

/**
 * Whether `remoteAddr` falls inside the configured trusted-proxy CIDR list.
 * Exported for reuse by any caller that needs the same trust decision.
 */
export const isTrustedProxy = (remoteAddr: string): boolean => {
  const blockList = getTrustedProxyBlockList();
  if (blockList == null) return false;
  const family = isIP(remoteAddr);
  if (family === 0) return false;
  return blockList.check(remoteAddr, family === 4 ? "ipv4" : "ipv6");
};

/**
 * Reset cached proxy-trust state so tests that swap `TRUSTED_PROXY_CIDRS` see
 * the new value on the next call. Not exported from the module index.
 */
export const resetTrustedProxyState = (): void => {
  trustedBlockList = null;
  trustedCidrSource = null;
  emittedNoTrustWarning = false;
};

/**
 * Pick the client IP from an `X-Forwarded-For` chain, honoring the configured
 * trusted-proxy allowlist.
 */
const pickClientFromForwardedChain = (forwarded: string): string | null => {
  const hops = forwarded
    .split(",")
    .map((h) => h.trim())
    .filter((h) => h !== "");
  if (hops.length === 0) return null;

  const blockList = getTrustedProxyBlockList();
  if (blockList == null) {
    // No trust configured — fall back to legacy behavior and warn once.
    if (!emittedNoTrustWarning) {
      emittedNoTrustWarning = true;
      logger.warn(
        { header: "x-forwarded-for" },
        "TRUSTED_PROXY_CIDRS is not configured; falling back to first X-Forwarded-For entry. This header is client-controlled when no proxy is in front — set TRUSTED_PROXY_CIDRS to lock down rate-limit identification."
      );
    }
    return hops[0] ?? null;
  }

  // Walk right-to-left, skipping trusted proxy hops. The first non-trusted
  // address we see is the client (from the outermost trusted proxy's POV).
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i] ?? "";
    if (isIP(hop) === 0) continue;
    if (!isTrustedProxy(hop)) {
      return hop;
    }
  }

  // Entire chain is inside our trust boundary — the leftmost hop is the best
  // we have.
  return hops[0] ?? null;
};

// Helper function to get client identifier
export const getClientIdentifier = (request: Request): string => {
  // Try to get IP from various headers
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  if (forwarded != null && forwarded !== "") {
    const picked = pickClientFromForwardedChain(forwarded);
    if (picked != null && picked !== "") return picked;
  }

  // X-Real-IP / CF-Connecting-IP are single-valued, so there's no chain to
  // walk — they're only meaningful when a trusted proxy sets them. We still
  // honour them when no XFF chain is present because the legacy behaviour did
  // and removing it silently would regress existing deployments; operators
  // who don't trust these headers should strip them at their edge.
  if (realIp != null && realIp !== "") {
    return realIp;
  }

  if (cfConnectingIp != null && cfConnectingIp !== "") {
    return cfConnectingIp;
  }

  // Fallback to a default identifier
  return "unknown";
};
