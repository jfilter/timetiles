/**
 * @module
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnv } from "../../../lib/config/env";
import { RATE_LIMITS } from "../../../lib/constants/rate-limits";
import {
  getClientIdentifier,
  getRateLimitService,
  RateLimitService,
  resetRateLimitService,
} from "../../../lib/services/rate-limit-service";
import { createIntegrationTestEnvironment } from "../../setup/integration/environment";

describe.sequential("RateLimitService", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let rateLimitService: RateLimitService;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(() => {
    vi.stubEnv("RATE_LIMIT_BACKEND", "memory");
    resetEnv();
    rateLimitService = new RateLimitService(payload);
  });

  afterEach(() => {
    rateLimitService.destroy();
    vi.unstubAllEnvs();
    resetEnv();
  });

  describe.sequential("checkRateLimit", () => {
    const testIdentifier = "test-client-123";
    const limit = 5;
    const windowMs = 60 * 1000; // 1 minute

    it("should allow requests within limit", async () => {
      const result = await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.blocked).toBe(false);
      expect(result.resetTime).toBeGreaterThan(Date.now());
    });

    it("should track multiple requests correctly", async () => {
      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        const result = await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(limit - (i + 1));
      }

      // Check final state
      const finalResult = await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(finalResult.allowed).toBe(true);
      expect(finalResult.remaining).toBe(1);
    });

    it("should block requests when limit is exceeded", async () => {
      // Exhaust the limit
      for (let i = 0; i < limit; i++) {
        await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      }

      // Next request should be blocked
      const result = await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.blocked).toBe(true);
    });

    it("should reset after window expires", async () => {
      const shortWindow = 100; // 100ms

      // Exhaust the limit
      for (let i = 0; i < limit; i++) {
        await rateLimitService.checkRateLimit(testIdentifier, limit, shortWindow);
      }

      // Should be blocked
      let result = await rateLimitService.checkRateLimit(testIdentifier, limit, shortWindow);
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      result = await rateLimitService.checkRateLimit(testIdentifier, limit, shortWindow);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - 1);
    });

    it("should handle different identifiers independently", async () => {
      const identifier1 = "client-1";
      const identifier2 = "client-2";

      // Exhaust limit for client 1
      for (let i = 0; i < limit; i++) {
        await rateLimitService.checkRateLimit(identifier1, limit, windowMs);
      }

      // Client 1 should be blocked
      const result1 = await rateLimitService.checkRateLimit(identifier1, limit, windowMs);
      expect(result1.allowed).toBe(false);

      // Client 2 should still be allowed
      const result2 = await rateLimitService.checkRateLimit(identifier2, limit, windowMs);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(limit - 1);
    });

    it("should use default values when not specified", async () => {
      const result = await rateLimitService.checkRateLimit(testIdentifier);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // Default limit is 10
      expect(result.resetTime).toBeGreaterThan(Date.now() + 3500000); // Default window is 1 hour
    });
  });

  describe.sequential("getRateLimitStatus", () => {
    const testIdentifier = "status-test-client";
    const limit = 3;
    const windowMs = 60 * 1000;

    it("should return null for non-existent identifier", async () => {
      const status = await rateLimitService.getRateLimitStatus("non-existent");
      expect(status).toBeNull();
    });

    it("should return current status without incrementing", async () => {
      // Make some requests
      await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);

      const status = await rateLimitService.getRateLimitStatus(testIdentifier);

      expect(status).not.toBeNull();
      expect(status!.count).toBe(2);
      expect(status!.blocked).toBe(false);
      expect(status!.resetTime).toBeGreaterThan(Date.now());

      // Make another request to verify count didn't change from status check
      const result = await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(result.remaining).toBe(0); // Should be 3rd request
    });

    it("should return null for expired entries", async () => {
      const shortWindow = 50;

      await rateLimitService.checkRateLimit(testIdentifier, limit, shortWindow);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = await rateLimitService.getRateLimitStatus(testIdentifier);
      expect(status).toBeNull();
    });
  });

  describe.sequential("resetRateLimit", () => {
    const testIdentifier = "reset-test-client";
    const limit = 3;
    const windowMs = 60 * 1000;

    it("should reset rate limit for identifier", async () => {
      // Exhaust the limit
      for (let i = 0; i < limit; i++) {
        await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      }

      // Should be blocked
      let result = await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(result.allowed).toBe(false);

      // Reset the limit
      await rateLimitService.resetRateLimit(testIdentifier);

      // Should be allowed again
      result = await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - 1);
    });

    it("should not affect other identifiers", async () => {
      const identifier1 = "reset-client-1";
      const identifier2 = "reset-client-2";

      // Make requests for both clients
      await rateLimitService.checkRateLimit(identifier1, limit, windowMs);
      await rateLimitService.checkRateLimit(identifier2, limit, windowMs);

      // Reset only client 1
      await rateLimitService.resetRateLimit(identifier1);

      // Client 1 should be reset
      const result1 = await rateLimitService.checkRateLimit(identifier1, limit, windowMs);
      expect(result1.remaining).toBe(limit - 1);

      // Client 2 should be unaffected
      const result2 = await rateLimitService.checkRateLimit(identifier2, limit, windowMs);
      expect(result2.remaining).toBe(limit - 2);
    });
  });

  describe.sequential("blockIdentifier", () => {
    const testIdentifier = "block-test-client";
    const limit = 5;
    const windowMs = 60 * 1000;

    it("should immediately block identifier", async () => {
      await rateLimitService.blockIdentifier(testIdentifier, 60 * 1000);

      const status = await rateLimitService.getRateLimitStatus(testIdentifier);
      expect(status).not.toBeNull();
      expect(status!.blocked).toBe(true);
      expect(status!.count).toBeGreaterThan(limit);
    });

    it("should block requests for blocked identifier", async () => {
      await rateLimitService.blockIdentifier(testIdentifier, 60 * 1000);

      const result = await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it("should use default duration when not specified", async () => {
      await rateLimitService.blockIdentifier(testIdentifier);

      const status = await rateLimitService.getRateLimitStatus(testIdentifier);
      expect(status).not.toBeNull();
      expect(status!.resetTime).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000); // ~24 hours
    });

    it("should unblock after duration expires", async () => {
      const shortDuration = 100;
      await rateLimitService.blockIdentifier(testIdentifier, shortDuration);

      // Should be blocked initially
      let result = await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(result.allowed).toBe(false);

      // Wait for block to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      result = await rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(result.allowed).toBe(true);
    });
  });

  describe.sequential("getRateLimitHeaders", () => {
    const testIdentifier = "headers-test-client";
    const limit = 5;

    it("should return default headers for non-existent identifier", async () => {
      const headers = await rateLimitService.getRateLimitHeaders(testIdentifier, limit);

      expect(headers["X-RateLimit-Limit"]).toBe("5");
      expect(headers["X-RateLimit-Remaining"]).toBe("5");
      expect(headers["X-RateLimit-Reset"]).toBeDefined();
      expect(headers["X-RateLimit-Blocked"]).toBeUndefined();
    });

    it("should return current status headers", async () => {
      // Make some requests
      await rateLimitService.checkRateLimit(testIdentifier, limit, 60 * 1000);
      await rateLimitService.checkRateLimit(testIdentifier, limit, 60 * 1000);

      const headers = await rateLimitService.getRateLimitHeaders(testIdentifier, limit);

      expect(headers["X-RateLimit-Limit"]).toBe("5");
      expect(headers["X-RateLimit-Remaining"]).toBe("3");
      expect(headers["X-RateLimit-Reset"]).toBeDefined();
      expect(headers["X-RateLimit-Blocked"]).toBe("false");
    });

    it("should indicate blocked status in headers", async () => {
      await rateLimitService.blockIdentifier(testIdentifier, 60 * 1000);

      const headers = await rateLimitService.getRateLimitHeaders(testIdentifier, limit);

      expect(headers["X-RateLimit-Limit"]).toBe("5");
      expect(headers["X-RateLimit-Remaining"]).toBe("0");
      expect(headers["X-RateLimit-Blocked"]).toBe("true");
    });
  });

  describe.sequential("cleanup", () => {
    it("should remove expired entries", async () => {
      const shortWindow = 50;
      const identifier1 = "cleanup-client-1";
      const identifier2 = "cleanup-client-2";

      // Create entries with short window
      await rateLimitService.checkRateLimit(identifier1, 5, shortWindow);
      await rateLimitService.checkRateLimit(identifier2, 5, 60 * 1000); // Long window

      // Wait for first entry to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Trigger cleanup
      await rateLimitService["cleanup"]();

      // First should be gone, second should remain
      expect(await rateLimitService.getRateLimitStatus(identifier1)).toBeNull();
      expect(await rateLimitService.getRateLimitStatus(identifier2)).not.toBeNull();
    });
  });

  describe.sequential("getStatistics", () => {
    it("should return correct statistics", async () => {
      const client1 = "stats-client-1";
      const client2 = "stats-client-2";
      const client3 = "stats-client-3";

      // Create some entries
      await rateLimitService.checkRateLimit(client1, 5, 60 * 1000);
      await rateLimitService.checkRateLimit(client2, 5, 60 * 1000);
      await rateLimitService.blockIdentifier(client3, 60 * 1000);

      const stats = await rateLimitService.getStatistics();

      expect(stats.totalEntries).toBe(3);
      expect(stats.activeEntries).toBe(3);
      expect(stats.blockedEntries).toBe(1);
    });

    it("should not count expired entries as active", async () => {
      const shortWindow = 50;
      await rateLimitService.checkRateLimit("expired-client", 5, shortWindow);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = await rateLimitService.getStatistics();
      expect(stats.activeEntries).toBe(0);
    });
  });
});

describe.sequential("getRateLimitService", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    resetRateLimitService();
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  it("should return singleton instance", () => {
    const service1 = getRateLimitService(payload);
    const service2 = getRateLimitService(payload);

    // getRateLimitService is a singleton - returns the same instance
    expect(service1).toBe(service2);
    expect(service1).toBeInstanceOf(RateLimitService);
  });
});

describe.sequential("getClientIdentifier", () => {
  it("should extract IP from x-forwarded-for header", () => {
    const request = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "203.0.113.1, 10.0.0.1", // Using TEST-NET-3 RFC 5737
      },
    });

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("203.0.113.1");
  });

  it("should extract IP from x-real-ip header", () => {
    const request = new Request("http://localhost", { headers: { "x-real-ip": "203.0.113.2" } });

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("203.0.113.2");
  });

  it("should extract IP from cf-connecting-ip header", () => {
    const request = new Request("http://localhost", { headers: { "cf-connecting-ip": "203.0.113.3" } });

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("203.0.113.3");
  });

  it("should prioritize x-forwarded-for over other headers", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.1", "x-real-ip": "203.0.113.2", "cf-connecting-ip": "203.0.113.3" },
    });

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("203.0.113.1");
  });

  it("should return unknown when no IP headers are present", () => {
    const request = new Request("http://localhost");

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("unknown");
  });

  it("should handle multiple IPs in x-forwarded-for", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "  203.0.113.1  ,  10.0.0.1  ,  172.16.0.1  " },
    });

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("203.0.113.1");
  });
});

describe.sequential("Multi-window rate limiting", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let rateLimitService: RateLimitService;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(() => {
    vi.stubEnv("RATE_LIMIT_BACKEND", "memory");
    resetEnv();
    rateLimitService = new RateLimitService(payload);
  });

  afterEach(() => {
    rateLimitService.destroy();
    vi.unstubAllEnvs();
    resetEnv();
  });

  describe("checkMultiWindowRateLimit", () => {
    it("should allow requests when all windows pass", async () => {
      const result = await rateLimitService.checkMultiWindowRateLimit("test-id", [
        { limit: 5, windowMs: 1000, name: "burst" },
        { limit: 10, windowMs: 60000, name: "minute" },
      ]);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // Minimum remaining across windows
      expect(result.failedWindow).toBeUndefined();
    });

    it("should block on first window that fails", async () => {
      const identifier = "test-id";
      const windows = [
        { limit: 2, windowMs: 1000, name: "burst" },
        { limit: 10, windowMs: 60000, name: "minute" },
      ];

      // First two requests should pass
      expect((await rateLimitService.checkMultiWindowRateLimit(identifier, windows)).allowed).toBe(true);
      expect((await rateLimitService.checkMultiWindowRateLimit(identifier, windows)).allowed).toBe(true);

      // Third request should fail on burst window
      const result = await rateLimitService.checkMultiWindowRateLimit(identifier, windows);
      expect(result.allowed).toBe(false);
      expect(result.failedWindow).toBe("burst");
      expect(result.details?.limit).toBe(2);
    });

    it("should check windows in order", async () => {
      const identifier = "test-id";
      const windows = [
        { limit: 10, windowMs: 60000, name: "minute" },
        { limit: 1, windowMs: 1000, name: "burst" },
      ];

      // First request passes
      expect((await rateLimitService.checkMultiWindowRateLimit(identifier, windows)).allowed).toBe(true);

      // Second request fails on burst (second window)
      const result = await rateLimitService.checkMultiWindowRateLimit(identifier, windows);
      expect(result.allowed).toBe(false);
      expect(result.failedWindow).toBe("burst");
    });

    it("should use unique identifiers for each window", async () => {
      const identifier = "test-id";
      const windows = [
        { limit: 1, windowMs: 100, name: "short" },
        { limit: 5, windowMs: 1000, name: "long" },
      ];

      // First request passes
      expect((await rateLimitService.checkMultiWindowRateLimit(identifier, windows)).allowed).toBe(true);

      // Second request blocked by short window
      expect((await rateLimitService.checkMultiWindowRateLimit(identifier, windows)).allowed).toBe(false);

      // Wait for short window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should pass again (short window reset, long window still has capacity)
      const result = await rateLimitService.checkMultiWindowRateLimit(identifier, windows);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0); // Short window resets to 0 (just used), long window has 3
    });
  });

  describe("checkConfiguredRateLimit", () => {
    it("should work with RateLimitConfig", async () => {
      const config = {
        windows: [
          { limit: 2, windowMs: 1000, name: "burst" },
          { limit: 5, windowMs: 60000, name: "minute" },
        ],
      };

      const result = await rateLimitService.checkConfiguredRateLimit("test-id", config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });
  });
});

describe.sequential("RATE_LIMITS constants", () => {
  it("should have correct multi-window configurations", () => {
    // FILE_UPLOAD
    expect(RATE_LIMITS.FILE_UPLOAD.windows).toHaveLength(3);
    expect(RATE_LIMITS.FILE_UPLOAD.windows[0]).toEqual({ limit: 1, windowMs: 5000, name: "burst" });
    expect(RATE_LIMITS.FILE_UPLOAD.windows[1]).toEqual({ limit: 5, windowMs: 3600000, name: "hourly" });

    // WEBHOOK_TRIGGER
    expect(RATE_LIMITS.WEBHOOK_TRIGGER.windows).toHaveLength(2);
    expect(RATE_LIMITS.WEBHOOK_TRIGGER.windows[0]).toEqual({ limit: 1, windowMs: 10000, name: "burst" });

    // PROGRESS_CHECK
    expect(RATE_LIMITS.PROGRESS_CHECK.windows).toHaveLength(2);
    expect(RATE_LIMITS.PROGRESS_CHECK.windows[0]!.name).toBe("burst");
    expect(RATE_LIMITS.PROGRESS_CHECK.windows[1]!.name).toBe("hourly");
  });
});
