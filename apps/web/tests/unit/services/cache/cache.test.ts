/**
 * Unit tests for the Cache facade (key prefixing and TTL defaulting).
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Cache } from "@/lib/services/cache/cache";
import type { CacheStorage } from "@/lib/services/cache/types";

const createStorage = () =>
  ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({}),
  }) as unknown as CacheStorage & { set: ReturnType<typeof vi.fn> };

describe.sequential("Cache", () => {
  let storage: ReturnType<typeof createStorage>;
  let cache: Cache;

  beforeEach(() => {
    storage = createStorage();
    cache = new Cache({ storage, keyPrefix: "p:", defaultTTL: 1234 });
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
