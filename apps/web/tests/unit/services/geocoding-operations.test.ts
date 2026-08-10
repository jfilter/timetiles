/**
 * Unit tests for GeocodingOperations.
 *
 * Tests weighted provider distribution (pickWeightedProvider),
 * distributed geocoding with fallback (geocodeDistributed via batchGeocode),
 * and retry behavior on transient errors (tryProviderWithRetry via geocode).
 *
 * @module
 * @category Unit Tests
 */
import "@/tests/mocks/services/logger";

const mockRateLimiter = vi.hoisted(() => ({
  isAvailable: vi.fn().mockReturnValue(true),
  getTimeUntilAllowed: vi.fn().mockReturnValue(0),
  waitForSlot: vi.fn().mockResolvedValue(undefined),
  reportSuccess: vi.fn(),
  reportThrottle: vi.fn(),
  configure: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("@/lib/services/geocoding/provider-rate-limiter", () => ({
  getProviderRateLimiter: () => mockRateLimiter,
  resetProviderRateLimiter: vi.fn(),
  ProviderRateLimiter: vi.fn(),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GeocodingOperations } from "@/lib/services/geocoding/geocoding-operations";
import type { GeocodingResult, GeocodingSettings, ProviderConfig } from "@/lib/services/geocoding/types";
import { GeocodingError } from "@/lib/services/geocoding/types";

/** Create a mock geocoder that returns a valid Entry matching the expected format. */
const createMockGeocoder = (overrides: { lat?: number; lng?: number; city?: string; throws?: Error } = {}) => {
  return {
    geocode: overrides.throws
      ? vi.fn().mockRejectedValue(overrides.throws)
      : vi
          .fn()
          .mockResolvedValue([
            {
              latitude: overrides.lat ?? 52.52,
              longitude: overrides.lng ?? 13.405,
              formattedAddress: `${overrides.city ?? "Berlin"}, Germany`,
              country: "Germany",
              countryCode: "DE",
              city: overrides.city ?? "Berlin",
              state: "Berlin",
              streetName: "Unter den Linden",
              streetNumber: "1",
              zipcode: "10117",
            },
          ]),
  };
};

const createProvider = (
  name: string,
  rateLimit: number,
  geocoder?: ReturnType<typeof createMockGeocoder>
): ProviderConfig => {
  return {
    name,
    type: "nominatim",
    geocoder: (geocoder ?? createMockGeocoder()) as unknown as ProviderConfig["geocoder"],
    priority: 1,
    enabled: true,
    rateLimit,
  };
};

const createMockProviderManager = (providers: ProviderConfig[]) => ({
  getEnabledProviders: vi.fn().mockReturnValue(providers),
  getProviders: vi.fn().mockReturnValue(providers),
});

const createMockCacheManager = () => ({
  getCachedResult: vi.fn().mockResolvedValue(null),
  cacheResult: vi.fn().mockResolvedValue(undefined),
});

const defaultSettings: GeocodingSettings = {
  enabled: true,
  fallbackEnabled: true,
  providerSelection: { strategy: "priority", requiredTags: [] },
  caching: { enabled: false, ttlDays: 30 },
};

/**
 * Tests run sequentially because they share the mocked ProviderRateLimiter
 * and rely on deterministic mock call ordering.
 */
describe.sequential("GeocodingOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimiter.isAvailable.mockReturnValue(true);
    mockRateLimiter.getTimeUntilAllowed.mockReturnValue(0);
    mockRateLimiter.waitForSlot.mockResolvedValue(undefined);
  });

  describe("pickWeightedProvider (via batchGeocode)", () => {
    it("should distribute requests proportionally based on rateLimit", async () => {
      const geocoderA = createMockGeocoder({ city: "Berlin" });
      const geocoderB = createMockGeocoder({ city: "Munich" });

      const providerA = createProvider("provider-a", 30, geocoderA);
      const providerB = createProvider("provider-b", 10, geocoderB);

      const providerManager = createMockProviderManager([providerA, providerB]);
      const cacheManager = createMockCacheManager();

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, defaultSettings);

      // Generate enough addresses to see proportional distribution
      // Total weight = 30 + 10 = 40, so providerA should get ~75%, providerB ~25%
      const addresses = Array.from({ length: 40 }, (_, i) => `Address ${i}`);

      await ops.batchGeocode(addresses, 40);

      const callsA = geocoderA.geocode.mock.calls.length;
      const callsB = geocoderB.geocode.mock.calls.length;

      // With deterministic counter: first 30 go to A, next 10 go to B, exactly.
      expect(callsA).toBe(30);
      expect(callsB).toBe(10);
    });

    it("should return single provider when only one is available", async () => {
      const geocoder = createMockGeocoder();
      const provider = createProvider("solo-provider", 5, geocoder);

      const providerManager = createMockProviderManager([provider]);
      const cacheManager = createMockCacheManager();

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, defaultSettings);

      await ops.batchGeocode(["Berlin", "Munich", "Hamburg"], 10);

      expect(geocoder.geocode).toHaveBeenCalledTimes(3);
    });
  });

  describe("geocodeDistributed (via batchGeocode)", () => {
    it("should pass batch geocoding bias to provider queries", async () => {
      const geocoder = createMockGeocoder();
      const provider = createProvider("nominatim", 10, geocoder);
      const providerManager = createMockProviderManager([provider]);
      const cacheManager = createMockCacheManager();

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, defaultSettings);

      await ops.batchGeocode(["Odessa"], 10, {
        countryCodes: ["ua", "pl"],
        viewBox: { minLon: 22, minLat: 44, maxLon: 41, maxLat: 53 },
        bounded: true,
      });

      expect(geocoder.geocode).toHaveBeenCalledWith({
        q: "Odessa",
        countrycodes: "ua,pl",
        viewbox: "22,44,41,53",
        bounded: 1,
      });
    });

    it("should bypass address-only cache for biased requests", async () => {
      const geocoder = createMockGeocoder({ city: "Odessa" });
      const provider = createProvider("nominatim", 10, geocoder);
      const providerManager = createMockProviderManager([provider]);
      const cacheManager = createMockCacheManager();
      cacheManager.getCachedResult.mockResolvedValue({
        latitude: 52.52,
        longitude: 13.405,
        confidence: 0.9,
        provider: "nominatim",
        normalizedAddress: "Odessa",
        components: {
          streetNumber: null,
          streetName: null,
          city: "Odessa",
          region: null,
          postalCode: null,
          country: "United States",
        },
        metadata: {
          requestTimestamp: new Date().toISOString(),
          responseTime: null,
          accuracy: null,
          formattedAddress: "Odessa, TX, USA",
        },
        fromCache: true,
      });

      const settingsWithCache: GeocodingSettings = { ...defaultSettings, caching: { enabled: true, ttlDays: 30 } };
      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, settingsWithCache);

      await ops.batchGeocode(["Odessa"], 10, { countryCodes: ["UA"] });

      expect(cacheManager.getCachedResult).not.toHaveBeenCalled();
      expect(geocoder.geocode).toHaveBeenCalledWith({ q: "Odessa", countrycodes: "ua" });
      expect(cacheManager.cacheResult).not.toHaveBeenCalled();
    });

    it("should fall back to other providers when primary fails", async () => {
      const failingGeocoder = createMockGeocoder({
        throws: new GeocodingError("Rate limited", "RATE_LIMITED", true, 429),
      });
      const workingGeocoder = createMockGeocoder({ city: "Munich" });

      // Provider A has higher rate limit (gets picked first) but fails
      const providerA = createProvider("provider-a", 20, failingGeocoder);
      const providerB = createProvider("provider-b", 10, workingGeocoder);

      const providerManager = createMockProviderManager([providerA, providerB]);
      const cacheManager = createMockCacheManager();

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, defaultSettings);

      const result = await ops.batchGeocode(["Berlin"], 10);

      expect(result.summary.successful).toBe(1);
      expect(result.summary.failed).toBe(0);
      // Working geocoder should have been called as fallback
      expect(workingGeocoder.geocode).toHaveBeenCalled();
    });

    it("should report failure when all providers fail", async () => {
      const failingGeocoder1 = createMockGeocoder({
        throws: new GeocodingError("Rate limited", "RATE_LIMITED", true, 429),
      });
      const failingGeocoder2 = createMockGeocoder({
        throws: new GeocodingError("Service down", "SERVICE_UNAVAILABLE", true, 503),
      });

      const providerA = createProvider("provider-a", 10, failingGeocoder1);
      const providerB = createProvider("provider-b", 10, failingGeocoder2);

      const providerManager = createMockProviderManager([providerA, providerB]);
      const cacheManager = createMockCacheManager();

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, defaultSettings);

      const result = await ops.batchGeocode(["Berlin"], 10);

      expect(result.summary.failed).toBe(1);
      expect(result.summary.successful).toBe(0);
    });

    it("should use cached result when available", async () => {
      const geocoder = createMockGeocoder();
      const provider = createProvider("provider-a", 10, geocoder);

      const providerManager = createMockProviderManager([provider]);
      const cachedResult: GeocodingResult = {
        latitude: 52.52,
        longitude: 13.405,
        confidence: 0.9,
        provider: "provider-a",
        normalizedAddress: "Berlin, Germany",
        components: {
          streetNumber: null,
          streetName: null,
          city: "Berlin",
          region: null,
          postalCode: null,
          country: "Germany",
        },
        metadata: {
          requestTimestamp: new Date().toISOString(),
          responseTime: null,
          accuracy: null,
          formattedAddress: "Berlin, Germany",
        },
        fromCache: true,
      };
      const cacheManager = createMockCacheManager();
      cacheManager.getCachedResult.mockResolvedValue(cachedResult);

      const settingsWithCache: GeocodingSettings = { ...defaultSettings, caching: { enabled: true, ttlDays: 30 } };

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, settingsWithCache);

      const result = await ops.batchGeocode(["Berlin"], 10);

      expect(result.summary.cached).toBe(1);
      expect(result.summary.successful).toBe(1);
      // Geocoder should NOT have been called — cache hit
      expect(geocoder.geocode).not.toHaveBeenCalled();
    });
  });

  describe("backoff handling", () => {
    // Regression: a provider in backoff was skipped outright. With a single
    // provider (or when every provider is throttled at once) that made
    // tryProviders return null and geocode throw ALL_PROVIDERS_FAILED
    // immediately, so one transient 429 permanently failed every address still
    // to be processed in that import — even though waitForSlot would have slept
    // the (≤30s) window out and completed the request.
    it("waits out the backoff instead of failing when every provider is throttled", async () => {
      const geocoder = createMockGeocoder();
      const provider = createProvider("solo-provider", 10, geocoder);
      const providerManager = createMockProviderManager([provider]);
      const cacheManager = createMockCacheManager();

      mockRateLimiter.isAvailable.mockReturnValue(false);
      mockRateLimiter.getTimeUntilAllowed.mockReturnValue(2000);

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, defaultSettings);

      const result = await ops.geocode("Berlin");

      expect(result.latitude).toBe(52.52);
      // waitForSlot is what actually sleeps the backoff out.
      expect(mockRateLimiter.waitForSlot).toHaveBeenCalledWith("solo-provider");
      expect(geocoder.geocode).toHaveBeenCalledTimes(1);
    });

    it("prefers an available provider over one in backoff", async () => {
      const throttledGeocoder = createMockGeocoder({ city: "Berlin" });
      const freeGeocoder = createMockGeocoder({ city: "Munich" });
      const throttled = createProvider("throttled", 10, throttledGeocoder);
      const free = createProvider("free", 10, freeGeocoder);
      const providerManager = createMockProviderManager([throttled, free]);
      const cacheManager = createMockCacheManager();

      mockRateLimiter.isAvailable.mockImplementation((name: string) => name !== "throttled");
      mockRateLimiter.getTimeUntilAllowed.mockImplementation((name: string) => (name === "throttled" ? 2000 : 0));

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, defaultSettings);

      await ops.geocode("Berlin");

      expect(throttledGeocoder.geocode).not.toHaveBeenCalled();
      expect(freeGeocoder.geocode).toHaveBeenCalledTimes(1);
    });

    it("waits for the soonest-available provider when all are throttled", async () => {
      const soonGeocoder = createMockGeocoder({ city: "Munich" });
      const lateGeocoder = createMockGeocoder({ city: "Berlin" });
      const late = createProvider("late", 10, lateGeocoder);
      const soon = createProvider("soon", 10, soonGeocoder);
      // "late" comes first in priority order but backs off far longer.
      const providerManager = createMockProviderManager([late, soon]);
      const cacheManager = createMockCacheManager();

      mockRateLimiter.isAvailable.mockReturnValue(false);
      mockRateLimiter.getTimeUntilAllowed.mockImplementation((name: string) => (name === "soon" ? 500 : 25_000));

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, defaultSettings);

      await ops.geocode("Berlin");

      expect(soonGeocoder.geocode).toHaveBeenCalledTimes(1);
      expect(lateGeocoder.geocode).not.toHaveBeenCalled();
    });
  });

  describe("result validation", () => {
    // Regression: the acceptance check only range-checked lat/lon, so a
    // provider answering (0,0) for an address it could not resolve had that
    // point cached, persisted onto the ingest job and rendered as a real event
    // in the Gulf of Guinea.
    it("rejects a Null Island result and falls through to the next provider", async () => {
      const nullIslandGeocoder = createMockGeocoder({ lat: 0, lng: 0 });
      const goodGeocoder = createMockGeocoder({ lat: 48.14, lng: 11.58, city: "Munich" });
      const providerA = createProvider("null-island", 10, nullIslandGeocoder);
      const providerB = createProvider("good", 10, goodGeocoder);
      const providerManager = createMockProviderManager([providerA, providerB]);
      const cacheManager = createMockCacheManager();

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, defaultSettings);

      const result = await ops.geocode("Somewhere unresolvable");

      expect(result.latitude).toBe(48.14);
      expect(result.provider).toBe("good");
    });

    it("fails rather than returning Null Island when it is the only answer", async () => {
      const nullIslandGeocoder = createMockGeocoder({ lat: 0, lng: 0 });
      const provider = createProvider("null-island", 10, nullIslandGeocoder);
      const providerManager = createMockProviderManager([provider]);
      const cacheManager = createMockCacheManager();

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, defaultSettings);

      await expect(ops.geocode("Somewhere unresolvable")).rejects.toThrow("All geocoding providers failed");
      expect(cacheManager.cacheResult).not.toHaveBeenCalled();
    });

    // Regression: a rejected ANSWER is not a reason to stop asking. With
    // fallbackEnabled=false the loop broke after the first unacceptable result,
    // so a later provider that would have resolved the address was never tried.
    it("keeps trying fallbacks after a rejected result even with fallback disabled", async () => {
      const failingGeocoder = createMockGeocoder({
        throws: new GeocodingError("Service down", "SERVICE_UNAVAILABLE", true, 503),
      });
      const nullIslandGeocoder = createMockGeocoder({ lat: 0, lng: 0 });
      const goodGeocoder = createMockGeocoder({ lat: 48.14, lng: 11.58, city: "Munich" });

      const providerManager = createMockProviderManager([
        createProvider("primary", 10, failingGeocoder),
        createProvider("null-island", 10, nullIslandGeocoder),
        createProvider("good", 10, goodGeocoder),
      ]);
      const cacheManager = createMockCacheManager();
      const settingsNoFallback: GeocodingSettings = { ...defaultSettings, fallbackEnabled: false };

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, settingsNoFallback);

      const result = await ops.batchGeocode(["Munich"], 10);

      expect(result.summary.successful).toBe(1);
      expect(goodGeocoder.geocode).toHaveBeenCalled();
    });
  });

  describe("bias / cache interaction", () => {
    // Regression: any bias disabled the cache outright. Providers that only
    // accept a plain string query (Photon/Google/OpenCage) never see the bias,
    // so their answer IS the unbiased answer — dropping it meant a biased
    // import re-hit the provider for every row forever and never populated the
    // cache at all.
    const settingsWithCache: GeocodingSettings = { ...defaultSettings, caching: { enabled: true, ttlDays: 30 } };

    const createStringOnlyProvider = (name: string, geocoder: ReturnType<typeof createMockGeocoder>) => ({
      ...createProvider(name, 10, geocoder),
      type: "photon" as const,
    });

    it("caches biased lookups for providers that cannot receive the bias", async () => {
      const geocoder = createMockGeocoder({ city: "Odessa" });
      const provider = createStringOnlyProvider("photon", geocoder);
      const providerManager = createMockProviderManager([provider]);
      const cacheManager = createMockCacheManager();

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, settingsWithCache);

      await ops.batchGeocode(["Odessa"], 10, { countryCodes: ["UA"] });

      // The bias was dropped, so the plain-string query was sent...
      expect(geocoder.geocode).toHaveBeenCalledWith("Odessa");
      // ...and the address-keyed cache is read and written as usual.
      expect(cacheManager.getCachedResult).toHaveBeenCalledWith("Odessa");
      expect(cacheManager.cacheResult).toHaveBeenCalled();
    });

    it("still bypasses the cache when a bias-capable provider is enabled", async () => {
      const photonGeocoder = createMockGeocoder({ city: "Odessa" });
      const nominatimGeocoder = createMockGeocoder({ city: "Odessa" });
      const providerManager = createMockProviderManager([
        createProvider("nominatim", 10, nominatimGeocoder),
        createStringOnlyProvider("photon", photonGeocoder),
      ]);
      const cacheManager = createMockCacheManager();

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, settingsWithCache);

      await ops.batchGeocode(["Odessa"], 10, { countryCodes: ["UA"] });

      expect(cacheManager.getCachedResult).not.toHaveBeenCalled();
      // nominatim received and applied the bias, so its answer must not be
      // written under the address-only key.
      expect(cacheManager.cacheResult).not.toHaveBeenCalled();
    });
  });

  describe("tryProviderWithRetry (via geocode)", () => {
    it("should retry on transient errors and succeed", async () => {
      const geocoder = {
        geocode: vi
          .fn()
          .mockRejectedValueOnce(new GeocodingError("Rate limited", "RATE_LIMITED", true, 429, 10))
          .mockResolvedValueOnce([
            {
              latitude: 52.52,
              longitude: 13.405,
              formattedAddress: "Berlin, Germany",
              country: "Germany",
              city: "Berlin",
              state: "Berlin",
            },
          ]),
      };

      const provider = createProvider("retry-provider", 100, geocoder);
      const providerManager = createMockProviderManager([provider]);
      const cacheManager = createMockCacheManager();

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, defaultSettings);

      const result = await ops.geocode("Berlin");

      expect(result.latitude).toBe(52.52);
      expect(result.provider).toBe("retry-provider");
      // Called twice: first attempt fails, retry succeeds
      expect(geocoder.geocode).toHaveBeenCalledTimes(2);
    });

    it("should not retry on permanent errors", async () => {
      const geocoder = {
        geocode: vi.fn().mockRejectedValue(new GeocodingError("Auth failed", "AUTH_FAILURE", false, 401)),
      };

      const provider = createProvider("auth-fail-provider", 100, geocoder);
      const providerManager = createMockProviderManager([provider]);
      const cacheManager = createMockCacheManager();

      const settingsNoFallback: GeocodingSettings = { ...defaultSettings, fallbackEnabled: false };

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, settingsNoFallback);

      await expect(ops.geocode("Berlin")).rejects.toThrow("All geocoding providers failed");
      // Called only once — no retry for permanent errors
      expect(geocoder.geocode).toHaveBeenCalledTimes(1);
    });

    it("should throw after max retries for persistent transient errors", async () => {
      const geocoder = {
        geocode: vi.fn().mockRejectedValue(new GeocodingError("Rate limited", "RATE_LIMITED", true, 429)),
      };

      const provider = createProvider("always-throttled", 100, geocoder);
      const providerManager = createMockProviderManager([provider]);
      const cacheManager = createMockCacheManager();

      const settingsNoFallback: GeocodingSettings = { ...defaultSettings, fallbackEnabled: false };

      const ops = new GeocodingOperations(providerManager as any, cacheManager as any, settingsNoFallback);

      await expect(ops.geocode("Berlin")).rejects.toThrow("All geocoding providers failed");
      // Called twice: initial attempt + 1 retry (default maxRetries = 1)
      expect(geocoder.geocode).toHaveBeenCalledTimes(2);
    });
  });
});
