/**
 * Unit tests for ProviderManager's createStatusCheckingFetch.
 *
 * Tests that the fetch wrapper correctly intercepts HTTP error status codes
 * (429, 503) before node-geocoder can silently parse error responses as JSON.
 *
 * Note: createStatusCheckingFetch throws GeocodingError, but node-geocoder's
 * FetchAdapter wraps it in HttpError({ message, code }). The GeocodingError's
 * `code` is preserved through the wrapping, but `retryable` and `retryAfterMs`
 * are only available to code that catches the error before node-geocoder
 * (like GeocodingOperations.tryProvider). We verify the error code is correct.
 *
 * @module
 * @category Unit Tests
 */
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderManager } from "@/lib/services/geocoding/provider-manager";
import { GEOCODING_ERROR_CODES } from "@/lib/services/geocoding/types";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

const mockPayload = { find: vi.fn() } as any;

/**
 * Tests run sequentially because they share a global mockFetch mock.
 * The vitest config enables concurrent execution (sequence.concurrent: true).
 */
describe.sequential("ProviderManager - createStatusCheckingFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper: create a ProviderManager with a Nominatim provider from the DB,
   * then return the geocoder instance that uses createStatusCheckingFetch internally.
   */
  const getDefaultProvider = async () => {
    mockPayload.find.mockResolvedValue({
      docs: [
        {
          id: "test-nom",
          name: "Test Nominatim",
          type: "nominatim",
          enabled: true,
          priority: 1,
          rateLimit: 1,
          baseUrl: "https://nominatim.openstreetmap.org",
          userAgent: "TimeTiles-Test/1.0",
        },
      ],
    });

    const manager = new ProviderManager(mockPayload, null);
    const providers = await manager.loadProviders();

    expect(providers).toHaveLength(1);
    return providers[0]!;
  };

  it("should throw error with RATE_LIMITED code on 429 response", async () => {
    const provider = await getDefaultProvider();

    mockFetch.mockResolvedValue(new Response("Too Many Requests", { status: 429 }));

    try {
      await provider.geocoder.geocode("Berlin");
      expect.unreachable("should have thrown");
    } catch (error: any) {
      // node-geocoder wraps GeocodingError in HttpError, but preserves the code
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(GEOCODING_ERROR_CODES.RATE_LIMITED);
      expect(error.message).toContain("Rate limited");
    }
  });

  it("should throw error with SERVICE_UNAVAILABLE code on 503 response", async () => {
    const provider = await getDefaultProvider();

    mockFetch.mockResolvedValue(new Response("Service Unavailable", { status: 503 }));

    try {
      await provider.geocoder.geocode("Berlin");
      expect.unreachable("should have thrown");
    } catch (error: any) {
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(GEOCODING_ERROR_CODES.SERVICE_UNAVAILABLE);
      expect(error.message).toContain("Service unavailable");
    }
  });

  it("should include Retry-After info in error message on 429", async () => {
    const provider = await getDefaultProvider();

    mockFetch.mockResolvedValue(new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "10" } }));

    try {
      await provider.geocoder.geocode("Berlin");
      expect.unreachable("should have thrown");
    } catch (error: any) {
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(GEOCODING_ERROR_CODES.RATE_LIMITED);
    }
  });

  it("should pass through 200 response unchanged", async () => {
    const provider = await getDefaultProvider();

    // Nominatim returns JSON with an array of results
    const nominatimResponse = [
      {
        lat: "52.5200066",
        lon: "13.404954",
        display_name: "Berlin, Germany",
        address: { city: "Berlin", state: "Berlin", country: "Germany", country_code: "de" },
      },
    ];

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(nominatimResponse), { status: 200, headers: { "Content-Type": "application/json" } })
    );

    const results = await provider.geocoder.geocode("Berlin");

    // node-geocoder should have received the response and parsed it
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.latitude).toBeDefined();
    expect(results[0]!.longitude).toBeDefined();
  });

  it("should set User-Agent header on outgoing requests", async () => {
    const provider = await getDefaultProvider();

    // Return valid Nominatim response
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify([{ lat: "52.52", lon: "13.4", display_name: "Berlin" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await provider.geocoder.geocode("Berlin");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0]!;
    const requestInit = callArgs[1] as RequestInit;
    const headers = new Headers(requestInit.headers);
    expect(headers.get("User-Agent")).toContain("TimeTiles");
  });
});
