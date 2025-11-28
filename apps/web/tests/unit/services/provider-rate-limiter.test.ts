/**
 * Unit tests for the ProviderRateLimiter.
 *
 * Tests the per-provider rate limiting functionality used to respect
 * external geocoding API rate limits (e.g., Nominatim's 1 req/sec policy).
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

      // Should be able to make request immediately after configuration
      expect(rateLimiter.canMakeRequest("test-provider")).toBe(true);
    });

    it("should enforce minimum rate limit of 1 req/sec", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 0); // Invalid - should become 1

      // With 1 req/sec, interval is 1000ms
      expect(rateLimiter.getTimeUntilAllowed("test-provider")).toBe(0);
    });
  });

  describe("waitForSlot", () => {
    it("should allow immediate request when under rate limit", async () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 10); // 10 req/sec = 100ms interval

      const start = Date.now();
      await rateLimiter.waitForSlot("test-provider");
      const elapsed = Date.now() - start;

      expect(elapsed).toBe(0);
    });

    it("should wait when rate limit would be exceeded", async () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 1); // 1 req/sec = 1000ms interval

      // First request - immediate
      await rateLimiter.waitForSlot("test-provider");

      // Second request should need to wait (not allowed immediately)
      expect(rateLimiter.canMakeRequest("test-provider")).toBe(false);

      const waitPromise = rateLimiter.waitForSlot("test-provider");

      // Advance time by 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      await waitPromise;

      // After waiting, request should have been made (provider blocked again)
      expect(rateLimiter.canMakeRequest("test-provider")).toBe(false);
    });

    it("should use default rate limit for unconfigured provider", async () => {
      const rateLimiter = new ProviderRateLimiter();

      // Should not throw, uses default 1 req/sec
      await rateLimiter.waitForSlot("unconfigured-provider");

      // Second request should need to wait (default is 1 req/sec)
      expect(rateLimiter.canMakeRequest("unconfigured-provider")).toBe(false);

      const waitPromise = rateLimiter.waitForSlot("unconfigured-provider");
      await vi.advanceTimersByTimeAsync(1000);
      await waitPromise;

      // After waiting, request should have completed
      expect(rateLimiter.canMakeRequest("unconfigured-provider")).toBe(false);
    });

    it("should handle different rate limits for different providers", async () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("fast-provider", 100); // 100 req/sec (10ms interval)
      rateLimiter.configure("slow-provider", 1); // 1 req/sec (1000ms interval)

      // Both providers start fresh - can make requests immediately
      expect(rateLimiter.canMakeRequest("fast-provider")).toBe(true);
      expect(rateLimiter.canMakeRequest("slow-provider")).toBe(true);

      // Make request to fast provider
      await rateLimiter.waitForSlot("fast-provider");

      // Fast provider now blocked (needs 10ms), slow still available
      expect(rateLimiter.canMakeRequest("fast-provider")).toBe(false);
      expect(rateLimiter.canMakeRequest("slow-provider")).toBe(true);

      // Make request to slow provider
      await rateLimiter.waitForSlot("slow-provider");

      // Both blocked now
      expect(rateLimiter.canMakeRequest("fast-provider")).toBe(false);
      expect(rateLimiter.canMakeRequest("slow-provider")).toBe(false);

      // Fast provider needs 10ms, slow needs 1000ms
      // getTimeUntilAllowed should reflect this difference
      const fastWait = rateLimiter.getTimeUntilAllowed("fast-provider");
      const slowWait = rateLimiter.getTimeUntilAllowed("slow-provider");

      // Fast should have much shorter wait than slow
      expect(fastWait).toBeLessThan(slowWait);
      expect(fastWait).toBeLessThanOrEqual(10);
      expect(slowWait).toBeLessThanOrEqual(1000);
    });

    it("should track providers independently", async () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("provider-a", 1);
      rateLimiter.configure("provider-b", 1);

      // Request to provider-a
      await rateLimiter.waitForSlot("provider-a");

      // Request to provider-b should be immediate (different provider)
      const canMakeB = rateLimiter.canMakeRequest("provider-b");
      expect(canMakeB).toBe(true);

      await rateLimiter.waitForSlot("provider-b");

      // Now both providers need to wait
      expect(rateLimiter.canMakeRequest("provider-a")).toBe(false);
      expect(rateLimiter.canMakeRequest("provider-b")).toBe(false);
    });
  });

  describe("canMakeRequest", () => {
    it("should return true when rate limit allows", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 10);

      expect(rateLimiter.canMakeRequest("test-provider")).toBe(true);
    });

    it("should return false immediately after a request", async () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 1); // 1 req/sec

      await rateLimiter.waitForSlot("test-provider");

      // Should be blocked immediately after
      expect(rateLimiter.canMakeRequest("test-provider")).toBe(false);
    });

    it("should return true for unconfigured provider", () => {
      const rateLimiter = new ProviderRateLimiter();

      // Unconfigured provider - allows first request
      expect(rateLimiter.canMakeRequest("unknown-provider")).toBe(true);
    });
  });

  describe("getTimeUntilAllowed", () => {
    it("should return 0 when no wait needed", () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 10);

      expect(rateLimiter.getTimeUntilAllowed("test-provider")).toBe(0);
    });

    it("should return remaining wait time", async () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("test-provider", 1); // 1000ms interval

      await rateLimiter.waitForSlot("test-provider");

      // Immediately after request, should need ~1000ms
      const waitTime = rateLimiter.getTimeUntilAllowed("test-provider");
      expect(waitTime).toBeGreaterThan(900);
      expect(waitTime).toBeLessThanOrEqual(1000);
    });

    it("should return 0 for unconfigured provider", () => {
      const rateLimiter = new ProviderRateLimiter();

      expect(rateLimiter.getTimeUntilAllowed("unknown-provider")).toBe(0);
    });
  });

  describe("reset", () => {
    it("should reset specific provider", async () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("provider-a", 1);
      rateLimiter.configure("provider-b", 1);

      await rateLimiter.waitForSlot("provider-a");
      await rateLimiter.waitForSlot("provider-b");

      // Reset only provider-a
      rateLimiter.reset("provider-a");

      // provider-a is reset (unconfigured now)
      expect(rateLimiter.canMakeRequest("provider-a")).toBe(true);

      // provider-b still has state
      expect(rateLimiter.canMakeRequest("provider-b")).toBe(false);
    });

    it("should reset all providers when no name provided", async () => {
      const rateLimiter = new ProviderRateLimiter();
      rateLimiter.configure("provider-a", 1);
      rateLimiter.configure("provider-b", 1);

      await rateLimiter.waitForSlot("provider-a");
      await rateLimiter.waitForSlot("provider-b");

      // Reset all
      rateLimiter.reset();

      // Both are now unconfigured (first request allowed)
      expect(rateLimiter.canMakeRequest("provider-a")).toBe(true);
      expect(rateLimiter.canMakeRequest("provider-b")).toBe(true);
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

      // New instance should not have the old configuration
      expect(instance2.canMakeRequest("test")).toBe(true); // Not configured = allow
    });
  });
});
