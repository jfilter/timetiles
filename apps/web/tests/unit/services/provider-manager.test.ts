/**
 * Unit tests for ProviderManager's createStatusCheckingFetch.
 *
 * Tests that the fetch wrapper correctly intercepts HTTP error status codes
 * (429, 503) before node-geocoder can silently parse error responses as JSON.
 *
 * The node-geocoder patch preserves the original GeocodingError as HttpError.cause;
 * these tests verify its retry metadata and safe provider-initialization diagnostics.
 *
 * @module
 * @category Unit Tests
 */
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderManager } from "@/lib/services/geocoding/provider-manager";
import { GEOCODING_ERROR_CODES } from "@/lib/services/geocoding/types";
import { TEST_SECRETS } from "@/tests/constants/test-credentials";
import { mockLogger } from "@/tests/mocks/services/logger";

const providerLogger =
  mockLogger.createLogger.mock.results[
    mockLogger.createLogger.mock.calls.findIndex(([name]: [string]) => name === "geocoding-provider-manager")
  ].value;

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

const mockPayload = { find: vi.fn() } as any;

// Keep tests sequential because they share the mockFetch global.
describe.sequential("ProviderManager - createStatusCheckingFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not log provider credentials when initialization fails", async () => {
    mockPayload.find.mockResolvedValue({
      docs: [
        {
          id: 1,
          name: "Broken provider",
          type: "google",
          enabled: true,
          apiKey: TEST_SECRETS.payloadSecret,
          countryCodes: 42,
        },
      ],
    });

    expect(await new ProviderManager(mockPayload, null).loadProviders()).toEqual([]);
    expect(providerLogger.error).toHaveBeenCalledOnce();
    expect(JSON.stringify(providerLogger.error.mock.calls)).not.toContain(TEST_SECRETS.payloadSecret);
  });

  it.each(["photon", "nominatim"])("does not log the %s endpoint during initialization", async (type) => {
    mockPayload.find.mockResolvedValue({
      docs: [
        {
          id: 1,
          name: "Private endpoint",
          type,
          enabled: true,
          baseUrl: `https://example.com/${TEST_SECRETS.payloadSecret}`,
        },
      ],
    });

    expect(await new ProviderManager(mockPayload, null).loadProviders()).toHaveLength(1);
    expect(JSON.stringify(providerLogger.debug.mock.calls)).not.toContain(TEST_SECRETS.payloadSecret);
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

  it.each([
    ["10", 10000],
    ["0", 0],
    ["-1", undefined],
    ["5garbage", undefined],
    ["1.5", undefined],
  ])("validates Retry-After %s on 429", async (header, expected) => {
    const provider = await getDefaultProvider();

    mockFetch.mockResolvedValue(new Response("Too Many Requests", { status: 429, headers: { "Retry-After": header } }));

    try {
      await provider.geocoder.geocode("Berlin");
      expect.unreachable("should have thrown");
    } catch (error: any) {
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(GEOCODING_ERROR_CODES.RATE_LIMITED);
      expect(error.cause).toMatchObject({ retryable: true, httpStatus: 429, retryAfterMs: expected });
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
