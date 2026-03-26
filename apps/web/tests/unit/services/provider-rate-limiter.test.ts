/**
 * Unit tests for the ProviderRateLimiter.
 *
 * Tests the per-provider rate limiting functionality used to respect
 * external geocoding API rate limits (e.g., Nominatim's 1 req/sec policy),
 * as well as adaptive backoff on 429/503 throttle responses.
 *
 * @module
 * @category Unit Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getProviderRateLimiter,
  ProviderRateLimiter,
  resetProviderRateLimiter,
} from "@/lib/services/geocoding/provider-rate-limiter";

describe("ProviderRateLimiter", () => {
  beforeEach(() => {
    resetProviderRateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetProviderRateLimiter();
  });

  describe("configure", () => {
    it("should configure rate limit for a provider", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 10);

      // Should be available immediately after configuration (no backoff)
      expect(rateLimiter.isAvailable("test-provider")).toBe(true);
    });

    it("should enforce minimum rate limit of 1 req/sec", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 0); // Invalid - should become 1

      expect(rateLimiter.getTimeUntilAllowed("test-provider")).toBe(0);
    });
  });

  describe("waitForSlot", () => {
    it("should serialize concurrent requests via promise chaining", async () => {
      vi.useRealTimers(); // Real timers needed for promise-chain serialization
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 100); // 100 req/sec = 10ms interval

      const start = Date.now();

      // Fire two requests concurrently — second must wait for first's interval
      await Promise.all([rateLimiter.waitForSlot("test-provider"), rateLimiter.waitForSlot("test-provider")]);

      const elapsed = Date.now() - start;
      // Two serial 10ms delays = ~20ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(15);
    });

    it("should use default rate limit for unconfigured provider", async () => {
      vi.useRealTimers();
      const rateLimiter = new ProviderRateLimiter();

      // Should not throw, uses default 1 req/sec — will take ~1s with real timers
      await rateLimiter.waitForSlot("unconfigured-provider");
      // Provider is now configured (auto-configured on first use)
      expect(rateLimiter.isAvailable("unconfigured-provider")).toBe(true);
    }, 3000);

    it("should wait for backoff to expire before proceeding", async () => {
      vi.useRealTimers();
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 100); // fast rate limit

      // Simulate throttle with short backoff for fast test
      rateLimiter.reportThrottle("test-provider", 50); // 50ms backoff

      expect(rateLimiter.isAvailable("test-provider")).toBe(false);

      const start = Date.now();
      await rateLimiter.waitForSlot("test-provider");
      const elapsed = Date.now() - start;

      // Should have waited at least the backoff period
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe("adaptive backoff", () => {
    it("should mark provider unavailable after reportThrottle", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 10);

      rateLimiter.reportThrottle("test-provider");

      expect(rateLimiter.isAvailable("test-provider")).toBe(false);
      expect(rateLimiter.getTimeUntilAllowed("test-provider")).toBeGreaterThan(0);
    });

    it("should use Retry-After when provided", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 10);

      rateLimiter.reportThrottle("test-provider", 5000); // 5s Retry-After

      const wait = rateLimiter.getTimeUntilAllowed("test-provider");
      expect(wait).toBeGreaterThan(4500);
      expect(wait).toBeLessThanOrEqual(5000);
    });

    it("should apply exponential backoff on consecutive throttles", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 10);

      // First throttle: 2s backoff
      rateLimiter.reportThrottle("test-provider");
      const wait1 = rateLimiter.getTimeUntilAllowed("test-provider");

      // Advance past backoff
      vi.advanceTimersByTime(2100);

      // Second throttle: 4s backoff (doubled)
      rateLimiter.reportThrottle("test-provider");
      const wait2 = rateLimiter.getTimeUntilAllowed("test-provider");

      expect(wait2).toBeGreaterThan(wait1);
    });

    it("should reset backoff on reportSuccess", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 10);

      rateLimiter.reportThrottle("test-provider");
      expect(rateLimiter.isAvailable("test-provider")).toBe(false);

      rateLimiter.reportSuccess("test-provider");
      expect(rateLimiter.isAvailable("test-provider")).toBe(true);
      expect(rateLimiter.getTimeUntilAllowed("test-provider")).toBe(0);
    });

    it("should cap backoff at maximum", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 10);

      // Fire many throttles to hit the cap
      for (let i = 0; i < 20; i++) {
        vi.advanceTimersByTime(31_000); // advance past any backoff
        rateLimiter.reportThrottle("test-provider");
      }

      // Should not exceed 30s cap
      const wait = rateLimiter.getTimeUntilAllowed("test-provider");
      expect(wait).toBeLessThanOrEqual(30_000);
    });
  });

  describe("isAvailable / canMakeRequest", () => {
    it("should return true when no backoff active", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 10);

      expect(rateLimiter.isAvailable("test-provider")).toBe(true);
      expect(rateLimiter.canMakeRequest("test-provider")).toBe(true);
    });

    it("should return true for unconfigured provider", () => {
      const rateLimiter = new ProviderRateLimiter();
      expect(rateLimiter.canMakeRequest("unknown-provider")).toBe(true);
    });

    it("should return false during backoff", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 10);

      rateLimiter.reportThrottle("test-provider");

      expect(rateLimiter.isAvailable("test-provider")).toBe(false);
      expect(rateLimiter.canMakeRequest("test-provider")).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset specific provider", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("provider-a", 1);
      rateLimiter.configure("provider-b", 1);

      rateLimiter.reportThrottle("provider-a");
      rateLimiter.reportThrottle("provider-b");

      // Reset only provider-a
      rateLimiter.reset("provider-a");

      // provider-a is reset (unconfigured now)
      expect(rateLimiter.isAvailable("provider-a")).toBe(true);
      // provider-b still in backoff
      expect(rateLimiter.isAvailable("provider-b")).toBe(false);
    });

    it("should reset all providers when no name provided", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("provider-a", 1);
      rateLimiter.configure("provider-b", 1);

      rateLimiter.reportThrottle("provider-a");
      rateLimiter.reportThrottle("provider-b");

      rateLimiter.reset();

      expect(rateLimiter.isAvailable("provider-a")).toBe(true);
      expect(rateLimiter.isAvailable("provider-b")).toBe(true);
    });
  });

  describe("singleton", () => {
    it("should return same instance from getProviderRateLimiter", () => {
      const instance1 = getProviderRateLimiter();
      const instance2 = getProviderRateLimiter();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after resetProviderRateLimiter", () => {
      const instance1 = getProviderRateLimiter();
      instance1.configure("test", 1);

      resetProviderRateLimiter();

      const instance2 = getProviderRateLimiter();
      expect(instance2.isAvailable("test")).toBe(true);
    });
  });
});
