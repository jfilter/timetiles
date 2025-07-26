import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  getClientIdentifier,
  getRateLimitService,
  RATE_LIMITS,
  RateLimitService,
} from "../../../lib/services/rate-limit-service";
import { createIsolatedTestEnvironment } from "../../setup/test-helpers";

describe.sequential("RateLimitService", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;
  let payload: any;
  let rateLimitService: RateLimitService;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(() => {
    rateLimitService = new RateLimitService(payload);
  });

  afterEach(() => {
    // Clear the internal cache
    rateLimitService["cache"].clear();
  });

  describe.sequential("checkRateLimit", () => {
    const testIdentifier = "test-client-123";
    const limit = 5;
    const windowMs = 60 * 1000; // 1 minute

    it("should allow requests within limit", () => {
      const result = rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.blocked).toBe(false);
      expect(result.resetTime).toBeGreaterThan(Date.now());
    });

    it("should track multiple requests correctly", () => {
      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        const result = rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(limit - (i + 1));
      }

      // Check final state
      const finalResult = rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(finalResult.allowed).toBe(true);
      expect(finalResult.remaining).toBe(1);
    });

    it("should block requests when limit is exceeded", () => {
      // Exhaust the limit
      for (let i = 0; i < limit; i++) {
        rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      }

      // Next request should be blocked
      const result = rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.blocked).toBe(true);
    });

    it("should reset after window expires", async () => {
      const shortWindow = 100; // 100ms

      // Exhaust the limit
      for (let i = 0; i < limit; i++) {
        rateLimitService.checkRateLimit(testIdentifier, limit, shortWindow);
      }

      // Should be blocked
      let result = rateLimitService.checkRateLimit(testIdentifier, limit, shortWindow);
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      result = rateLimitService.checkRateLimit(testIdentifier, limit, shortWindow);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - 1);
    });

    it("should handle different identifiers independently", () => {
      const identifier1 = "client-1";
      const identifier2 = "client-2";

      // Exhaust limit for client 1
      for (let i = 0; i < limit; i++) {
        rateLimitService.checkRateLimit(identifier1, limit, windowMs);
      }

      // Client 1 should be blocked
      const result1 = rateLimitService.checkRateLimit(identifier1, limit, windowMs);
      expect(result1.allowed).toBe(false);

      // Client 2 should still be allowed
      const result2 = rateLimitService.checkRateLimit(identifier2, limit, windowMs);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(limit - 1);
    });

    it("should use default values when not specified", () => {
      const result = rateLimitService.checkRateLimit(testIdentifier);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // Default limit is 10
      expect(result.resetTime).toBeGreaterThan(Date.now() + 3500000); // Default window is 1 hour
    });
  });

  describe.sequential("getRateLimitStatus", () => {
    const testIdentifier = "status-test-client";
    const limit = 3;
    const windowMs = 60 * 1000;

    it("should return null for non-existent identifier", () => {
      const status = rateLimitService.getRateLimitStatus("non-existent");
      expect(status).toBeNull();
    });

    it("should return current status without incrementing", () => {
      // Make some requests
      rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);

      const status = rateLimitService.getRateLimitStatus(testIdentifier);

      expect(status).not.toBeNull();
      expect(status!.count).toBe(2);
      expect(status!.blocked).toBe(false);
      expect(status!.resetTime).toBeGreaterThan(Date.now());

      // Make another request to verify count didn't change from status check
      const result = rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(result.remaining).toBe(0); // Should be 3rd request
    });

    it("should return null for expired entries", async () => {
      const shortWindow = 50;

      rateLimitService.checkRateLimit(testIdentifier, limit, shortWindow);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = rateLimitService.getRateLimitStatus(testIdentifier);
      expect(status).toBeNull();
    });
  });

  describe.sequential("resetRateLimit", () => {
    const testIdentifier = "reset-test-client";
    const limit = 3;
    const windowMs = 60 * 1000;

    it("should reset rate limit for identifier", () => {
      // Exhaust the limit
      for (let i = 0; i < limit; i++) {
        rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      }

      // Should be blocked
      let result = rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(result.allowed).toBe(false);

      // Reset the limit
      rateLimitService.resetRateLimit(testIdentifier);

      // Should be allowed again
      result = rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - 1);
    });

    it("should not affect other identifiers", () => {
      const identifier1 = "reset-client-1";
      const identifier2 = "reset-client-2";

      // Make requests for both clients
      rateLimitService.checkRateLimit(identifier1, limit, windowMs);
      rateLimitService.checkRateLimit(identifier2, limit, windowMs);

      // Reset only client 1
      rateLimitService.resetRateLimit(identifier1);

      // Client 1 should be reset
      const result1 = rateLimitService.checkRateLimit(identifier1, limit, windowMs);
      expect(result1.remaining).toBe(limit - 1);

      // Client 2 should be unaffected
      const result2 = rateLimitService.checkRateLimit(identifier2, limit, windowMs);
      expect(result2.remaining).toBe(limit - 2);
    });
  });

  describe.sequential("blockIdentifier", () => {
    const testIdentifier = "block-test-client";
    const limit = 5;
    const windowMs = 60 * 1000;

    it("should immediately block identifier", () => {
      rateLimitService.blockIdentifier(testIdentifier, 60 * 1000);

      const status = rateLimitService.getRateLimitStatus(testIdentifier);
      expect(status).not.toBeNull();
      expect(status!.blocked).toBe(true);
      expect(status!.count).toBeGreaterThan(limit);
    });

    it("should block requests for blocked identifier", () => {
      rateLimitService.blockIdentifier(testIdentifier, 60 * 1000);

      const result = rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it("should use default duration when not specified", () => {
      rateLimitService.blockIdentifier(testIdentifier);

      const status = rateLimitService.getRateLimitStatus(testIdentifier);
      expect(status).not.toBeNull();
      expect(status!.resetTime).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000); // ~24 hours
    });

    it("should unblock after duration expires", async () => {
      const shortDuration = 100;
      rateLimitService.blockIdentifier(testIdentifier, shortDuration);

      // Should be blocked initially
      let result = rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(result.allowed).toBe(false);

      // Wait for block to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      result = rateLimitService.checkRateLimit(testIdentifier, limit, windowMs);
      expect(result.allowed).toBe(true);
    });
  });

  describe.sequential("getRateLimitHeaders", () => {
    const testIdentifier = "headers-test-client";
    const limit = 5;

    it("should return default headers for non-existent identifier", () => {
      const headers = rateLimitService.getRateLimitHeaders(testIdentifier, limit);

      expect(headers["X-RateLimit-Limit"]).toBe("5");
      expect(headers["X-RateLimit-Remaining"]).toBe("5");
      expect(headers["X-RateLimit-Reset"]).toBeDefined();
      expect(headers["X-RateLimit-Blocked"]).toBeUndefined();
    });

    it("should return current status headers", () => {
      // Make some requests
      rateLimitService.checkRateLimit(testIdentifier, limit, 60 * 1000);
      rateLimitService.checkRateLimit(testIdentifier, limit, 60 * 1000);

      const headers = rateLimitService.getRateLimitHeaders(testIdentifier, limit);

      expect(headers["X-RateLimit-Limit"]).toBe("5");
      expect(headers["X-RateLimit-Remaining"]).toBe("3");
      expect(headers["X-RateLimit-Reset"]).toBeDefined();
      expect(headers["X-RateLimit-Blocked"]).toBe("false");
    });

    it("should indicate blocked status in headers", () => {
      rateLimitService.blockIdentifier(testIdentifier, 60 * 1000);

      const headers = rateLimitService.getRateLimitHeaders(testIdentifier, limit);

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
      rateLimitService.checkRateLimit(identifier1, 5, shortWindow);
      rateLimitService.checkRateLimit(identifier2, 5, 60 * 1000); // Long window

      // Wait for first entry to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Trigger cleanup
      rateLimitService["cleanup"]();

      // First should be gone, second should remain
      expect(rateLimitService.getRateLimitStatus(identifier1)).toBeNull();
      expect(rateLimitService.getRateLimitStatus(identifier2)).not.toBeNull();
    });
  });

  describe.sequential("getStatistics", () => {
    it("should return correct statistics", () => {
      const client1 = "stats-client-1";
      const client2 = "stats-client-2";
      const client3 = "stats-client-3";

      // Create some entries
      rateLimitService.checkRateLimit(client1, 5, 60 * 1000);
      rateLimitService.checkRateLimit(client2, 5, 60 * 1000);
      rateLimitService.blockIdentifier(client3, 60 * 1000);

      const stats = rateLimitService.getStatistics();

      expect(stats.totalEntries).toBe(3);
      expect(stats.activeEntries).toBe(3);
      expect(stats.blockedEntries).toBe(1);
    });

    it("should not count expired entries as active", async () => {
      const shortWindow = 50;
      rateLimitService.checkRateLimit("expired-client", 5, shortWindow);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = rateLimitService.getStatistics();
      expect(stats.activeEntries).toBe(0);
    });
  });
});

describe.sequential("getRateLimitService", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;
  let payload: any;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  it("should return new instances in test environment for isolation", () => {
    const service1 = getRateLimitService(payload);
    const service2 = getRateLimitService(payload);

    // In test environment, should return new instances for isolation
    expect(service1).not.toBe(service2);
    expect(service1).toBeInstanceOf(RateLimitService);
    expect(service2).toBeInstanceOf(RateLimitService);
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
    const request = new Request("http://localhost", {
      headers: {
        "x-real-ip": "203.0.113.2",
      },
    });

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("203.0.113.2");
  });

  it("should extract IP from cf-connecting-ip header", () => {
    const request = new Request("http://localhost", {
      headers: {
        "cf-connecting-ip": "203.0.113.3",
      },
    });

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("203.0.113.3");
  });

  it("should prioritize x-forwarded-for over other headers", () => {
    const request = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "203.0.113.1",
        "x-real-ip": "203.0.113.2",
        "cf-connecting-ip": "203.0.113.3",
      },
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
      headers: {
        "x-forwarded-for": "  203.0.113.1  ,  10.0.0.1  ,  172.16.0.1  ",
      },
    });

    const identifier = getClientIdentifier(request);
    expect(identifier).toBe("203.0.113.1");
  });
});

describe.sequential("RATE_LIMITS constants", () => {
  it("should have correct rate limit configurations", () => {
    expect(RATE_LIMITS.FILE_UPLOAD.limit).toBe(5);
    expect(RATE_LIMITS.FILE_UPLOAD.windowMs).toBe(60 * 60 * 1000);

    expect(RATE_LIMITS.PROGRESS_CHECK.limit).toBe(100);
    expect(RATE_LIMITS.PROGRESS_CHECK.windowMs).toBe(60 * 60 * 1000);

    expect(RATE_LIMITS.API_GENERAL.limit).toBe(50);
    expect(RATE_LIMITS.API_GENERAL.windowMs).toBe(60 * 60 * 1000);
  });
});
