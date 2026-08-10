/**
 * Unit tests for the Cache facade (key prefixing and TTL defaulting).
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Cache } from "@/lib/services/cache/cache";
import type { CacheSetOptions, CacheStorage } from "@/lib/services/cache/types";

const createStorage = () =>
  ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    setMany: vi.fn().mockResolvedValue(undefined),
    getMany: vi.fn().mockResolvedValue(new Map()),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockResolvedValue(false),
    getStats: vi.fn().mockResolvedValue({}),
  }) as unknown as CacheStorage & { set: ReturnType<typeof vi.fn>; setMany: ReturnType<typeof vi.fn> };

describe.sequential("Cache", () => {
  let storage: ReturnType<typeof createStorage>;
  let cache: Cache;

  beforeEach(() => {
    storage = createStorage();
    cache = new Cache({ storage, keyPrefix: "p:", defaultTTL: 1234 });
  });

  const lastSetManyCall = (): [Map<string, unknown>, CacheSetOptions | undefined] =>
    storage.setMany.mock.lastCall as [Map<string, unknown>, CacheSetOptions | undefined];

  it("applies the configured defaultTTL on set", async () => {
    await cache.set("a", 1);

    expect(storage.set.mock.lastCall?.[0]).toBe("p:a");
    expect(storage.set.mock.lastCall?.[2]?.ttl).toBe(1234);
  });

  it("applies the same defaultTTL on setMany", async () => {
    await cache.setMany({ a: 1, b: 2 });

    const [entries, options] = lastSetManyCall();
    expect([...entries.keys()]).toEqual(["p:a", "p:b"]);
    expect(options?.ttl).toBe(1234);
  });

  it("keeps an explicit TTL on setMany", async () => {
    await cache.setMany(new Map([["a", 1]]), { ttl: 5 });

    expect(lastSetManyCall()[1]?.ttl).toBe(5);
  });
});
