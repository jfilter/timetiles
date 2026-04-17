/**
 * Integration tests for rate-limit store backends.
 *
 * Verifies shared store contract behavior for memory and PostgreSQL backends,
 * plus PostgreSQL-specific concurrency correctness.
 *
 * @module
 * @category Tests
 */
import { sql } from "@payloadcms/db-postgres/drizzle";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnv } from "@/lib/config/env";
import { MemoryRateLimitStore } from "@/lib/services/rate-limit/memory-store";
import { PgRateLimitStore } from "@/lib/services/rate-limit/pg-store";
import type { RateLimitStore } from "@/lib/services/rate-limit/store";
import { RateLimitService, resetRateLimitService } from "@/lib/services/rate-limit-service";

import { createIntegrationTestEnvironment } from "../../setup/integration/environment";

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

describe.sequential("RateLimitStore backends", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];

  const clearPgCounters = async (): Promise<void> => {
    await payload.db.drizzle.execute(sql`DELETE FROM payload.rate_limit_counters`);
  };

  const runStoreContractTests = (name: string, createStore: () => RateLimitStore | Promise<RateLimitStore>): void => {
    describe.sequential(name, () => {
      let store: RateLimitStore;

      beforeEach(async () => {
        await clearPgCounters();
        store = await createStore();
      });

      afterEach(async () => {
        store.destroy?.();
        await clearPgCounters();
      });

      it("allows requests within limit", async () => {
        const result = await store.checkAndIncrement("contract:allow", 5, 60_000);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
        expect(result.blocked).toBe(false);
      });

      it("blocks after the limit is exceeded", async () => {
        for (let i = 0; i < 3; i++) {
          await store.checkAndIncrement("contract:block", 3, 60_000);
        }

        const result = await store.checkAndIncrement("contract:block", 3, 60_000);

        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.blocked).toBe(true);
      });

      it("resets after expiry", async () => {
        await store.checkAndIncrement("contract:expiry", 1, 75);
        const blocked = await store.checkAndIncrement("contract:expiry", 1, 75);

        expect(blocked.allowed).toBe(false);

        await sleep(125);

        const result = await store.checkAndIncrement("contract:expiry", 1, 75);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(0);
      });

      it("peek does not increment", async () => {
        await store.checkAndIncrement("contract:peek", 3, 60_000);
        await store.checkAndIncrement("contract:peek", 3, 60_000);

        const status = await store.peek("contract:peek");

        expect(status).not.toBeNull();
        expect(status?.count).toBe(2);

        const result = await store.checkAndIncrement("contract:peek", 3, 60_000);
        expect(result.remaining).toBe(0);
      });

      it("reset clears the key", async () => {
        await store.checkAndIncrement("contract:reset", 3, 60_000);
        await store.reset("contract:reset");

        const status = await store.peek("contract:reset");
        const result = await store.checkAndIncrement("contract:reset", 3, 60_000);

        expect(status).toBeNull();
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(2);
      });

      it("block forces denial until expiry", async () => {
        await store.block("contract:manual-block", 75);

        const blocked = await store.checkAndIncrement("contract:manual-block", 5, 60_000);
        expect(blocked.allowed).toBe(false);
        expect(blocked.blocked).toBe(true);

        await sleep(125);

        const result = await store.checkAndIncrement("contract:manual-block", 5, 60_000);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
      });
    });
  };

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    resetRateLimitService();
    await clearPgCounters();
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnv();
  });

  runStoreContractTests("MemoryRateLimitStore", () => new MemoryRateLimitStore());
  runStoreContractTests("PgRateLimitStore", () => new PgRateLimitStore(payload));

  describe.sequential("PgRateLimitStore concurrency", () => {
    let store: PgRateLimitStore;

    beforeEach(async () => {
      await clearPgCounters();
      store = new PgRateLimitStore(payload);
    });

    afterEach(async () => {
      await clearPgCounters();
    });

    it("tracks 100 concurrent increments without losing updates", async () => {
      const results = await Promise.all(
        Array.from({ length: 100 }, () => store.checkAndIncrement("contract:concurrency:count", 100, 60_000))
      );

      expect(results.every((result) => result.allowed)).toBe(true);

      const status = await store.peek("contract:concurrency:count");
      expect(status?.count).toBe(100);
      expect(status?.blocked).toBe(false);
    });

    it("enforces the limit globally under contention", async () => {
      const results = await Promise.all(
        Array.from({ length: 100 }, () => store.checkAndIncrement("contract:concurrency:limit", 10, 60_000))
      );

      expect(results.filter((result) => result.allowed)).toHaveLength(10);
      expect(results.filter((result) => !result.allowed)).toHaveLength(90);

      const status = await store.peek("contract:concurrency:limit");
      expect(status?.count).toBe(11);
      expect(status?.blocked).toBe(true);
    });
  });

  describe.sequential("RateLimitService with pg backend", () => {
    let service: RateLimitService;

    beforeEach(async () => {
      await clearPgCounters();
      vi.stubEnv("RATE_LIMIT_BACKEND", "pg");
      resetEnv();
      resetRateLimitService();
      service = new RateLimitService(payload);
    });

    afterEach(async () => {
      service.destroy();
      resetRateLimitService();
      await clearPgCounters();
    });

    it("preserves multi-window ordering", async () => {
      const identifier = "service:pg-ordering";
      const windows = [
        { limit: 1, windowMs: 1_000, name: "burst" },
        { limit: 10, windowMs: 60_000, name: "minute" },
      ];

      expect((await service.checkMultiWindowRateLimit(identifier, windows)).allowed).toBe(true);

      const result = await service.checkMultiWindowRateLimit(identifier, windows);
      expect(result.allowed).toBe(false);
      expect(result.failedWindow).toBe("burst");

      const minuteStatus = await service.getRateLimitStatus(`${identifier}:minute`);
      expect(minuteStatus?.count).toBe(1);
    });
  });
});
