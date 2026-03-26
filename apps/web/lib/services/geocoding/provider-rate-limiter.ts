/**
 * Per-provider rate limiting for geocoding requests.
 *
 * Implements a promise-chain-based rate limiter that serializes concurrent requests
 * to respect configured rate limits. Includes adaptive backoff that temporarily
 * suspends providers returning 429/503 responses.
 *
 * @module
 * @category Services
 */
import { createLogger } from "@/lib/logger";

import { DEFAULT_NOMINATIM_RATE_LIMIT } from "./types";

const logger = createLogger("provider-rate-limiter");

/** Initial backoff duration on first throttle (ms) */
const INITIAL_BACKOFF_MS = 2000;
/** Maximum backoff duration (ms) */
const MAX_BACKOFF_MS = 30_000;
/** Backoff multiplier for each consecutive throttle */
const BACKOFF_MULTIPLIER = 2;

interface RateLimitState {
  requestsPerSecond: number;
  /** Promise chain that serializes access — each waitForSlot() appends to this chain */
  lastSlotPromise: Promise<void>;
  /** Adaptive backoff: don't send requests until this timestamp */
  backoffUntil: number;
  /** Current backoff duration, doubles on each consecutive throttle */
  currentBackoffMs: number;
  /** Number of consecutive throttle responses (429/503) */
  consecutiveThrottles: number;
}

export class ProviderRateLimiter {
  private readonly state: Map<string, RateLimitState> = new Map();

  /**
   * Configure rate limit for a provider.
   * Should be called when providers are loaded.
   */
  configure(providerName: string, requestsPerSecond: number): void {
    this.state.set(providerName, {
      requestsPerSecond: Math.max(1, requestsPerSecond),
      lastSlotPromise: Promise.resolve(),
      backoffUntil: 0,
      currentBackoffMs: INITIAL_BACKOFF_MS,
      consecutiveThrottles: 0,
    });
    logger.debug("Configured rate limit", { providerName, requestsPerSecond });
  }

  /**
   * Wait for a rate limit slot to become available.
   * Serializes concurrent callers via promise chaining — no TOCTOU race.
   */
  async waitForSlot(providerName: string): Promise<void> {
    const state = this.getOrCreateState(providerName);

    // If provider is in backoff, wait until backoff expires
    const now = Date.now();
    if (now < state.backoffUntil) {
      const backoffWait = state.backoffUntil - now;
      logger.debug("Provider in backoff, waiting", { providerName, backoffWaitMs: backoffWait });
      await this.delay(backoffWait);
    }

    // Chain: this caller waits for the previous slot + interval.
    // Using .then() is intentional here — it chains promises synchronously to
    // serialize concurrent callers without a TOCTOU race condition.
    const minInterval = 1000 / state.requestsPerSecond;
    const previousSlot = state.lastSlotPromise;
    const mySlot = previousSlot.then(() => this.delay(minInterval));
    state.lastSlotPromise = mySlot;
    await mySlot;
  }

  /**
   * Report a successful geocoding request — resets backoff state.
   */
  reportSuccess(providerName: string): void {
    const state = this.state.get(providerName);
    if (!state) return;

    if (state.consecutiveThrottles > 0) {
      logger.debug("Provider recovered from throttling", {
        providerName,
        previousThrottles: state.consecutiveThrottles,
      });
    }
    state.consecutiveThrottles = 0;
    state.currentBackoffMs = INITIAL_BACKOFF_MS;
    state.backoffUntil = 0;
  }

  /**
   * Report a throttle response (429/503) — applies exponential backoff.
   */
  reportThrottle(providerName: string, retryAfterMs?: number): void {
    const state = this.getOrCreateState(providerName);
    state.consecutiveThrottles++;

    // Use Retry-After if provided, otherwise exponential backoff
    const backoffMs = retryAfterMs ?? state.currentBackoffMs;
    state.backoffUntil = Date.now() + backoffMs;
    state.currentBackoffMs = Math.min(state.currentBackoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);

    logger.warn("Provider throttled, backing off", {
      providerName,
      consecutiveThrottles: state.consecutiveThrottles,
      backoffMs,
      nextBackoffMs: state.currentBackoffMs,
    });
  }

  /**
   * Check if a provider is currently available (not in backoff).
   */
  isAvailable(providerName: string): boolean {
    const state = this.state.get(providerName);
    if (!state) return true;
    return Date.now() >= state.backoffUntil;
  }

  /**
   * Check if a request can be made immediately without waiting.
   */
  canMakeRequest(providerName: string): boolean {
    const state = this.state.get(providerName);
    if (!state) return true;
    return this.isAvailable(providerName);
  }

  /**
   * Get time in ms until provider is available again.
   */
  getTimeUntilAllowed(providerName: string): number {
    const state = this.state.get(providerName);
    if (!state) return 0;
    return Math.max(0, state.backoffUntil - Date.now());
  }

  /**
   * Reset rate limiter state for a specific provider or all providers.
   */
  reset(providerName?: string): void {
    if (providerName) {
      this.state.delete(providerName);
    } else {
      this.state.clear();
    }
  }

  private getOrCreateState(providerName: string): RateLimitState {
    let state = this.state.get(providerName);
    if (!state) {
      logger.warn("Provider not configured for rate limiting, using default", { providerName });
      this.configure(providerName, DEFAULT_NOMINATIM_RATE_LIMIT);
      state = this.state.get(providerName)!;
    }
    return state;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance for the geocoding service
let rateLimiterInstance: ProviderRateLimiter | null = null;

export const getProviderRateLimiter = (): ProviderRateLimiter => {
  rateLimiterInstance ??= new ProviderRateLimiter();
  return rateLimiterInstance;
};

export const resetProviderRateLimiter = (): void => {
  if (rateLimiterInstance) {
    rateLimiterInstance.reset();
    rateLimiterInstance = null;
  }
};
