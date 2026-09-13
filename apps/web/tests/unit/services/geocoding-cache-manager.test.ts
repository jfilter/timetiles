/**
 * Unit tests for the geocoding cache layer.
 *
 * The normalized form is BOTH the cache key and the string sent to the
 * geocoding providers, so it must preserve non-ASCII letters. Cache database
 * failures must degrade to a cache miss instead of failing the lookup.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";

import { CacheManager, normalizeGeocodingAddress } from "@/lib/services/geocoding/cache-manager";
import type { GeocodingResult, GeocodingSettings } from "@/lib/services/geocoding/types";

describe("normalizeGeocodingAddress", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeGeocodingAddress("  123   MAIN St  ")).toBe("123 main st");
  });

  it("strips punctuation while keeping commas, dots, and dashes", () => {
    expect(normalizeGeocodingAddress("123 Main St!! (rear)")).toBe("123 main st rear");
    expect(normalizeGeocodingAddress("12-14 Long Rd., Springfield")).toBe("12-14 long rd., springfield");
  });

  // Regression: an ASCII-only \w class mangled every non-ASCII address —
  // providers received "mllerstrae 12, kln", fully non-Latin addresses
  // normalized to "" and were silently dropped from the geocode set, and
  // addresses differing only in non-ASCII letters collided on one cache key.
  it("preserves non-ASCII letters (umlauts, ß, accents)", () => {
    expect(normalizeGeocodingAddress("Müllerstraße 12, Köln")).toBe("müllerstraße 12, köln");
    expect(normalizeGeocodingAddress("Łódź, Polska")).toBe("łódź, polska");
  });

  it("preserves non-Latin scripts", () => {
    expect(normalizeGeocodingAddress("東京都新宿区")).toBe("東京都新宿区");
    expect(normalizeGeocodingAddress("Москва, Тверская 1")).toBe("москва, тверская 1");
  });

  it("keeps distinct keys for addresses differing only in non-ASCII letters", () => {
    expect(normalizeGeocodingAddress("Köln")).not.toBe(normalizeGeocodingAddress("Kln"));
  });

  // Regression: dropping the slash fused the parts into a different house number, so
  // "12/1 Main St" became "121 main st" — colliding with a real, different address and
  // sending the wrong string to the provider.
  it("turns slashes into a separator instead of fusing address parts", () => {
    expect(normalizeGeocodingAddress("12/1 Main St")).toBe("12 1 main st");
    expect(normalizeGeocodingAddress("12/1 Main St")).not.toBe(normalizeGeocodingAddress("121 Main St"));
    expect(normalizeGeocodingAddress("Apt 3/B, Berlin")).toBe("apt 3 b, berlin");
  });

  it("still drops apostrophes rather than splitting the word", () => {
    expect(normalizeGeocodingAddress("O'Brien St")).toBe("obrien st");
  });

  it("collapses duplicate commas and trims leading/trailing separators", () => {
    expect(normalizeGeocodingAddress(",,Berlin,, Mitte,")).toBe("berlin, mitte");
  });
});

describe("CacheManager database failures", () => {
  const settings: GeocodingSettings = {
    enabled: true,
    fallbackEnabled: true,
    providerSelection: { strategy: "priority", requiredTags: [] },
    caching: { enabled: true, ttlDays: 30 },
  };

  const result: GeocodingResult = {
    latitude: 52.52,
    longitude: 13.405,
    confidence: 0.9,
    provider: "nominatim",
    normalizedAddress: "berlin",
    components: { streetNumber: null, streetName: null, city: "Berlin", region: null, postalCode: null, country: null },
    metadata: {
      requestTimestamp: "2024-01-01T00:00:00.000Z",
      responseTime: null,
      accuracy: null,
      formattedAddress: null,
    },
    fromCache: false,
  };

  const createFailingPayload = () => {
    const dbError = new Error("Database error");
    return {
      find: vi.fn().mockRejectedValue(dbError),
      create: vi.fn().mockRejectedValue(dbError),
      update: vi.fn().mockRejectedValue(dbError),
      delete: vi.fn().mockRejectedValue(dbError),
    };
  };

  it("treats a failing cache lookup as a miss", async () => {
    const payload = createFailingPayload();
    const cache = new CacheManager(payload as unknown as Payload, settings);

    await expect(cache.getCachedResult("Berlin")).resolves.toBeNull();
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { normalizedAddress: { equals: "berlin" } } })
    );
  });

  it("swallows a failing cache write", async () => {
    const payload = createFailingPayload();
    const cache = new CacheManager(payload as unknown as Payload, settings);

    await expect(cache.cacheResult("Berlin", result)).resolves.toBeUndefined();
    expect(payload.create).toHaveBeenCalledTimes(1);
  });
});
