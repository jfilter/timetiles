/**
 * Unit tests for the Photon geocoder wrapper.
 *
 * Tests GeoJSON→Entry mapping, error classification (429/404/503),
 * confidence scoring, and query parameter generation.
 *
 * @module
 * @category Unit Tests
 */
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPhotonGeocoder } from "@/lib/services/geocoding/photon-geocoder";
import { GeocodingError } from "@/lib/services/geocoding/types";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

const photonResponse = (features: Record<string, unknown>[]) => {
  return new Response(JSON.stringify({ type: "FeatureCollection", features }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

const photonFeature = (overrides: Record<string, unknown> = {}) => {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [13.4, 52.5] },
    properties: {
      name: "Berlin",
      country: "Germany",
      countrycode: "de",
      city: "Berlin",
      state: "Berlin",
      ...overrides,
    },
  };
};

/**
 * All tests run sequentially because they share a single mockFetch global.
 * The vitest config enables concurrent test execution (sequence.concurrent: true),
 * which causes mock state to interleave between tests sharing the same mock.
 */
describe.sequential("Photon Geocoder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful geocoding", () => {
    it("should map GeoJSON feature to node-geocoder Entry format", async () => {
      mockFetch.mockResolvedValue(
        photonResponse([photonFeature({ street: "Unter den Linden", housenumber: "1", postcode: "10117" })])
      );

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com" });
      const results = await geocoder.geocode("Berlin");

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        latitude: 52.5,
        longitude: 13.4,
        country: "Germany",
        countryCode: "DE",
        city: "Berlin",
        state: "Berlin",
        streetName: "Unter den Linden",
        streetNumber: "1",
        zipcode: "10117",
      });
      expect(results[0]!.formattedAddress).toContain("Berlin");
    });

    it("should return empty array for no results", async () => {
      mockFetch.mockResolvedValue(photonResponse([]));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com" });
      const results = await geocoder.geocode("xyznonexistent");

      expect(results).toEqual([]);
    });
  });

  describe("confidence scoring", () => {
    it("should return 0.9 for house-level matches", async () => {
      mockFetch.mockResolvedValue(photonResponse([photonFeature({ street: "Main St", housenumber: "42" })]));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com" });
      const results = await geocoder.geocode("42 Main St");

      expect((results[0]!.extra as { confidence: number }).confidence).toBe(0.9);
    });

    it("should return 0.75 for street-level matches", async () => {
      mockFetch.mockResolvedValue(photonResponse([photonFeature({ street: "Main St", housenumber: undefined })]));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com" });
      const results = await geocoder.geocode("Main St");

      expect((results[0]!.extra as { confidence: number }).confidence).toBe(0.75);
    });

    it("should return 0.6 for city-level matches", async () => {
      mockFetch.mockResolvedValue(photonResponse([photonFeature({ street: undefined, city: "Berlin" })]));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com" });
      const results = await geocoder.geocode("Berlin");

      expect((results[0]!.extra as { confidence: number }).confidence).toBe(0.6);
    });

    it("should return 0.5 for country-level matches", async () => {
      mockFetch.mockResolvedValue(
        photonResponse([photonFeature({ street: undefined, city: undefined, district: undefined })])
      );

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com" });
      const results = await geocoder.geocode("Germany");

      expect((results[0]!.extra as { confidence: number }).confidence).toBe(0.5);
    });
  });

  describe("error classification", () => {
    it("should throw retryable RATE_LIMITED error on 429", async () => {
      mockFetch.mockResolvedValue(new Response("Too Many Requests", { status: 429 }));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com" });

      try {
        await geocoder.geocode("Berlin");
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GeocodingError);
        expect(error).toMatchObject({ code: "RATE_LIMITED", retryable: true, httpStatus: 429 });
      }
    });

    it("should parse Retry-After header on 429", async () => {
      mockFetch.mockResolvedValue(new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "5" } }));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com" });

      try {
        await geocoder.geocode("Berlin");
      } catch (error) {
        expect(error).toBeInstanceOf(GeocodingError);
        expect((error as GeocodingError).retryAfterMs).toBe(5000);
      }
    });

    it("should throw retryable RATE_LIMITED error on 404 (Photon load-shedding)", async () => {
      mockFetch.mockResolvedValue(new Response("Not Found", { status: 404 }));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com" });

      await expect(geocoder.geocode("Berlin")).rejects.toMatchObject({
        code: "RATE_LIMITED",
        retryable: true,
        httpStatus: 404,
      });
    });

    it("should throw retryable SERVICE_UNAVAILABLE error on 503", async () => {
      mockFetch.mockResolvedValue(new Response("Service Unavailable", { status: 503 }));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com" });

      await expect(geocoder.geocode("Berlin")).rejects.toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        retryable: true,
        httpStatus: 503,
      });
    });

    it("should throw non-retryable error on 500", async () => {
      mockFetch.mockResolvedValue(new Response("Internal Server Error", { status: 500 }));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com" });

      await expect(geocoder.geocode("Berlin")).rejects.toMatchObject({
        code: "GEOCODING_FAILED",
        retryable: false,
        httpStatus: 500,
      });
    });
  });

  describe("query parameters", () => {
    it("should include language parameter", async () => {
      mockFetch.mockResolvedValue(photonResponse([]));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com", language: "de" });
      await geocoder.geocode("Berlin");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(calledUrl.searchParams.get("lang")).toBe("de");
    });

    it("should include location bias parameters", async () => {
      mockFetch.mockResolvedValue(photonResponse([]));

      const geocoder = createPhotonGeocoder({
        baseUrl: "https://example.com",
        locationBias: { lat: 52.5, lon: 13.4, zoom: 10 },
      });
      await geocoder.geocode("Springfield");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(calledUrl.searchParams.get("lat")).toBe("52.5");
      expect(calledUrl.searchParams.get("lon")).toBe("13.4");
      expect(calledUrl.searchParams.get("zoom")).toBe("10");
    });

    it("should include bbox parameter", async () => {
      mockFetch.mockResolvedValue(photonResponse([]));

      const geocoder = createPhotonGeocoder({
        baseUrl: "https://example.com",
        bbox: { minLon: -10, minLat: 35, maxLon: 40, maxLat: 70 },
      });
      await geocoder.geocode("Springfield");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(calledUrl.searchParams.get("bbox")).toBe("-10,35,40,70");
    });

    it("should include osm_tag parameter", async () => {
      mockFetch.mockResolvedValue(photonResponse([]));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com", osmTag: "place:city" });
      await geocoder.geocode("Berlin");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(calledUrl.searchParams.get("osm_tag")).toBe("place:city");
    });

    it("should include layer parameters", async () => {
      mockFetch.mockResolvedValue(photonResponse([]));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com", layer: ["city", "state"] });
      await geocoder.geocode("Berlin");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(calledUrl.searchParams.getAll("layer")).toEqual(["city", "state"]);
    });

    it("should set limit parameter", async () => {
      mockFetch.mockResolvedValue(photonResponse([]));

      const geocoder = createPhotonGeocoder({ baseUrl: "https://example.com", limit: 3 });
      await geocoder.geocode("Berlin");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(calledUrl.searchParams.get("limit")).toBe("3");
    });
  });
});
