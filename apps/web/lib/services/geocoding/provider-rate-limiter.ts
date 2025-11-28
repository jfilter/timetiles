/**
 * Per-provider rate limiting for geocoding requests.
 *
 * Implements a simple token bucket algorithm that tracks the last request time
 * for each provider and ensures requests respect the configured rate limit.
 * This is necessary because external geocoding APIs (especially Nominatim/OSM)
 * have strict rate limits that must be respected.
 *
 * @module
 * @category Services
 */
import { createLogger } from "@/lib/logger";

import { DEFAULT_NOMINATIM_RATE_LIMIT } from "./types";

const logger = createLogger("provider-rate-limiter");

interface RateLimitState {
  lastRequestTime: number;
  requestsPerSecond: number;
}

export class ProviderRateLimiter {
  private readonly state: Map<string, RateLimitState> = new Map();

  /**
   * Configure rate limit for a provider.
   * Should be called when providers are loaded.
   */
  configure(providerName: string, requestsPerSecond: number): void {
    this.state.set(providerName, {
      lastRequestTime: 0,
      requestsPerSecond: Math.max(1, requestsPerSecond),
    });
    logger.debug("Configured rate limit", { providerName, requestsPerSecond });
  }

  /**
   * Wait for a rate limit slot to become available.
   * Returns immediately if within rate limit, otherwise waits.
   */
  async waitForSlot(providerName: string): Promise<void> {
    const state = this.state.get(providerName);

    if (!state) {
      // Provider not configured, use conservative default (1 req/sec for Nominatim safety)
      logger.warn("Provider not configured for rate limiting, using default", { providerName });
      this.configure(providerName, DEFAULT_NOMINATIM_RATE_LIMIT);
      return this.waitForSlot(providerName);
    }

    const now = Date.now();
    const minInterval = 1000 / state.requestsPerSecond;
    const timeSinceLastRequest = now - state.lastRequestTime;

    if (timeSinceLastRequest < minInterval) {
      const waitTime = Math.ceil(minInterval - timeSinceLastRequest);
      logger.debug("Rate limiting: waiting before request", {
        providerName,
        waitTimeMs: waitTime,
        requestsPerSecond: state.requestsPerSecond,
      });
      await this.delay(waitTime);
    }

    // Update last request time
    state.lastRequestTime = Date.now();
  }

  /**
   * Check if a request can be made immediately without waiting.
   */
  canMakeRequest(providerName: string): boolean {
    const state = this.state.get(providerName);
    if (!state) return true; // Not configured, allow (will use default on actual request)

    const minInterval = 1000 / state.requestsPerSecond;
    const timeSinceLastRequest = Date.now() - state.lastRequestTime;
    return timeSinceLastRequest >= minInterval;
  }

  /**
   * Get time in ms until next request is allowed.
   */
  getTimeUntilAllowed(providerName: string): number {
    const state = this.state.get(providerName);
    if (!state) return 0;

    const minInterval = 1000 / state.requestsPerSecond;
    const timeSinceLastRequest = Date.now() - state.lastRequestTime;
    return Math.max(0, Math.ceil(minInterval - timeSinceLastRequest));
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
