/**
 * Unit tests for the Cache facade (key prefixing and TTL defaulting).
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Cache } from "@/lib/services/cache/cache";
import type { CacheStorage } from "@/lib/services/cache/types";
import { TEST_SECRETS } from "@/tests/constants/test-credentials";
import { mockLogger } from "@/tests/mocks/services/logger";

const createStorage = () =>
  ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    cleanup: vi.fn().mockResolvedValue(0),
    getStats: vi.fn().mockResolvedValue({}),
  }) as unknown as CacheStorage & { set: ReturnType<typeof vi.fn> };

describe.sequential("Cache", () => {
  let storage: ReturnType<typeof createStorage>;
  let cache: Cache;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = createStorage();
    cache = new Cache({ storage, keyPrefix: "p:", defaultTTL: 1234 });
  });

  it.each(["get", "set", "delete", "clear", "keys", "getStats"] as const)(
    "keeps %s failures secret-safe and preserves the fallback",
    async (operation) => {
      const key = `https://example.com/?token=${TEST_SECRETS.payloadSecret}`;
      vi.mocked(storage[operation]).mockRejectedValueOnce(new Error(key));

      const result = operation === "set" ? await cache.set(key, "value") : await cache[operation](key);
      const fallbacks = {
        get: null,
        set: undefined,
        delete: false,
        clear: 0,
        keys: [],
        getStats: { entries: 0, totalSize: 0, hits: 0, misses: 0, evictions: 0 },
      };
      expect(result).toEqual(fallbacks[operation]);
      expect(mockLogger.logger.error).toHaveBeenCalledWith(`Cache ${operation} error`);
    }
  );

  it("propagates maintenance failure without exposing storage details", async () => {
    vi.spyOn(storage, "cleanup").mockRejectedValueOnce(new Error(TEST_SECRETS.payloadSecret));

    await expect(cache.cleanup()).rejects.toEqual(new Error("Cache cleanup failed"));
  });

  it("applies the configured defaultTTL on set", async () => {
    await cache.set("a", 1);

    expect(storage.set.mock.lastCall?.[0]).toBe("p:a");
    expect(storage.set.mock.lastCall?.[2]?.ttl).toBe(1234);
  });

  it.each([0, 5])("keeps an explicit TTL of %s on set", async (ttl) => {
    await cache.set("a", 1, { ttl });
    expect(storage.set).toHaveBeenCalledWith("p:a", 1, { ttl });
  });
});
