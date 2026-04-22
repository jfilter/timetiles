/**
 * Flexible rate limiter for HTTP endpoints.
 *
 * Tracks requests per identifier (IP, session) across multi-window configs,
 * supports trust-level-aware limits, emits standard rate-limit headers, and
 * delegates persistence to a pluggable storage backend.
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
import { createRateLimitStore, type RateLimitBackend } from "./rate-limit/factory";
import type { RateLimitStats, RateLimitStatus, RateLimitStore } from "./rate-limit/store";

const logger = createLogger("rate-limit-service");

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

/**
 * `RATE_LIMIT_BACKEND=memory` remains single-process only.
 *
 * Multi-worker deployments must switch to the PostgreSQL backend so counters
 * remain correct across overlapping traffic.
 */
export class RateLimitService {
  private readonly backend: RateLimitBackend;
  private readonly store: RateLimitStore;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(payload: Payload) {
    const selection = createRateLimitStore(payload);
    this.backend = selection.backend;
    this.store = selection.store;

    // Fail loud if the in-memory backend is paired with a multi-worker
    // deployment: per-process counters would silently give each worker its
    // own budget, effectively multiplying rate limits by the cluster size.
    // Better to crash at boot than to degrade the security control silently.
    const env = getEnv();
    if (this.backend === "memory" && env.NODE_ENV === "production") {
      const workerHint = Math.max(env.WEB_CONCURRENCY, env.CLUSTER_WORKERS);
      if (workerHint > 1) {
        throw new Error(
          `Refusing to start: RATE_LIMIT_BACKEND=memory with ${workerHint} workers. ` +
            "Per-process counters cannot enforce shared limits. " +
            "Set RATE_LIMIT_BACKEND=postgresql, or run a single worker."
        );
      }
    }

    // The in-memory backend needs process-local cleanup to avoid unbounded Map
    // growth. PostgreSQL cleanup runs as a maintenance job instead.
    if (this.backend === "memory" && getEnv().NODE_ENV !== "test" && this.store.cleanup) {
      logger.info("Starting rate limit cleanup interval");
      this.cleanupInterval = setInterval(
        () => {
          void this.cleanup();
        },
        5 * 60 * 1000
      );
    }
  }

  /**
   * Cleanup method to clear interval and store resources.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      logger.debug("Destroying rate limit service");
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.store.destroy?.();
  }

  /**
   * Check if a request should be rate limited.
   *
   * @param identifier - IP address or session ID.
   * @param limit - Maximum requests allowed
   * @param windowMs - Time window in milliseconds
   * @returns Object containing rate limit status
   */
  async checkRateLimit(
    identifier: string,
    limit: number = 10,
    windowMs: number = 60 * 60 * 1000 // 1 hour default
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number; blocked: boolean }> {
    return this.store.checkAndIncrement(identifier, limit, windowMs);
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
  async checkMultiWindowRateLimit(
    baseIdentifier: string,
    windows: readonly RateLimitWindow[] | RateLimitWindow[]
  ): Promise<MultiWindowRateLimitResult> {
    let minRemaining = Number.MAX_SAFE_INTEGER;

    for (const window of windows) {
      const windowName = window.name ?? `${window.windowMs}ms`;
      const identifier = `${baseIdentifier}:${windowName}`;
      const check = await this.checkRateLimit(identifier, window.limit, window.windowMs);

      if (check.allowed && check.remaining < minRemaining) {
        minRemaining = check.remaining;
      }

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

    return { allowed: true, remaining: minRemaining };
  }

  /**
   * Check rate limits using a configuration object.
   *
   * @param baseIdentifier - Base identifier for the request.
   * @param config - Rate limit configuration with windows.
   * @returns Result indicating if request is allowed.
   */
  async checkConfiguredRateLimit(baseIdentifier: string, config: RateLimitConfig): Promise<MultiWindowRateLimitResult> {
    return this.checkMultiWindowRateLimit(baseIdentifier, [...config.windows]);
  }

  /**
   * Get current rate limit status without incrementing.
   */
  async getRateLimitStatus(identifier: string): Promise<RateLimitStatus | null> {
    return this.store.peek(identifier);
  }

  /**
   * Reset rate limit for an identifier.
   */
  async resetRateLimit(identifier: string): Promise<void> {
    await this.store.reset(identifier);
  }

  /**
   * Block an identifier immediately.
   */
  async blockIdentifier(identifier: string, durationMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    await this.store.block(identifier, durationMs);
    logger.warn({ identifier, durationMs }, "Identifier blocked");
  }

  /**
   * Get rate limit headers for HTTP responses.
   */
  async getRateLimitHeaders(identifier: string, limit: number): Promise<Record<string, string>> {
    const status = await this.getRateLimitStatus(identifier);

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
  private async cleanup(): Promise<void> {
    const cleanedCount = (await this.store.cleanup?.()) ?? 0;

    if (cleanedCount > 0) {
      logger.debug({ cleanedCount }, "Cleaned up expired rate limit entries");
    }
  }

  /**
   * Get statistics about current rate limits.
   */
  async getStatistics(): Promise<RateLimitStats> {
    return (await this.store.getStats?.()) ?? { totalEntries: 0, blockedEntries: 0, activeEntries: 0 };
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
    if (!user) {
      return RATE_LIMITS_BY_TRUST_LEVEL[TRUST_LEVELS.UNTRUSTED][endpointType];
    }

    const trustLevel = normalizeTrustLevel(user.trustLevel);
    const trustLevelLimits = RATE_LIMITS_BY_TRUST_LEVEL[trustLevel];

    if (!trustLevelLimits?.[endpointType]) {
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
  async checkTrustLevelRateLimit(
    identifier: string,
    user: User | null | undefined,
    endpointType: "FILE_UPLOAD" | "API_GENERAL"
  ): Promise<MultiWindowRateLimitResult> {
    const rateLimitConfig = this.getRateLimitsByTrustLevel(user, endpointType);
    const userIdentifier = user ? `${identifier}:user:${user.id}` : identifier;

    return this.checkConfiguredRateLimit(userIdentifier, rateLimitConfig);
  }
}

// Singleton: shared across requests so the selected backend and any
// process-local state remain stable for the lifetime of the process.
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
// When the env var is empty (default), production fails closed: forwarded IP
// headers are ignored because they are client-controlled unless a trusted
// proxy is explicitly configured. Development/test keep the legacy fallback
// with a warning to avoid breaking local workflows that still rely on those
// headers without a full proxy chain.

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

const canUseUnconfiguredForwardedHeaders = (): boolean => getEnv().NODE_ENV !== "production";

const warnMissingTrustedProxyConfig = (header: string): void => {
  if (emittedNoTrustWarning) {
    return;
  }

  emittedNoTrustWarning = true;

  if (canUseUnconfiguredForwardedHeaders()) {
    logger.warn(
      { header },
      "TRUSTED_PROXY_CIDRS is not configured; falling back to client-supplied forwarded IP headers for local/test compatibility. Set TRUSTED_PROXY_CIDRS to lock down rate-limit identification."
    );
    return;
  }

  logger.warn(
    { header },
    "TRUSTED_PROXY_CIDRS is not configured; ignoring forwarded IP headers in production because they are client-controlled until a trusted proxy CIDR allowlist is set."
  );
};

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
    warnMissingTrustedProxyConfig("x-forwarded-for");

    if (canUseUnconfiguredForwardedHeaders()) {
      return hops[0] ?? null;
    }

    return null;
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

  const blockList = getTrustedProxyBlockList();

  // X-Real-IP / CF-Connecting-IP are single-valued, so there's no chain to
  // walk — they're only meaningful when a trusted proxy sets them. Production
  // ignores them unless the operator has configured a trusted proxy boundary.
  if (realIp != null && realIp !== "") {
    if (blockList == null) {
      warnMissingTrustedProxyConfig("x-real-ip");
      if (!canUseUnconfiguredForwardedHeaders()) {
        return "unknown";
      }
    }

    return realIp;
  }

  if (cfConnectingIp != null && cfConnectingIp !== "") {
    if (blockList == null) {
      warnMissingTrustedProxyConfig("cf-connecting-ip");
      if (!canUseUnconfiguredForwardedHeaders()) {
        return "unknown";
      }
    }

    return cfConnectingIp;
  }

  // Fallback to a default identifier
  return "unknown";
};
