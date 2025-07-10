// Create mock geocoder instances with proper typing - must be defined before mocking
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";

// Use vi.hoisted to ensure mocks are set up before imports
const { mockGoogleGeocode, mockNominatimGeocode, mockNodeGeocoder } =
  vi.hoisted(() => {
    const mockGoogleGeocode = vi.fn();
    const mockNominatimGeocode = vi.fn();

    const mockNodeGeocoder = vi.fn().mockImplementation((config: any) => {
      if (config && config.provider === "google") {
        return { geocode: mockGoogleGeocode };
      } else {
        return { geocode: mockNominatimGeocode };
      }
    });

    return { mockGoogleGeocode, mockNominatimGeocode, mockNodeGeocoder };
  });

// Mock node-geocoder module
vi.mock("node-geocoder", () => ({
  default: mockNodeGeocoder,
}));

// Create getter functions to access the current mocks
const mockGoogleGeocoder = {
  get geocode() {
    return mockGoogleGeocode;
  },
};
const mockNominatimGeocoder = {
  get geocode() {
    return mockNominatimGeocode;
  },
};

import {
  GeocodingService,
  GeocodingError,
} from "../lib/services/geocoding/GeocodingService";
import { createIsolatedTestEnvironment } from "./test-helpers";

describe("GeocodingService", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;
  let payload: any;
  let geocodingService: GeocodingService;
  let testCounter = 0;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    // Increment counter for unique addresses
    testCounter++;

    // Clear collections before each test - this is now isolated per test file
    try {
      await testEnv.seedManager.truncate();
      // Also explicitly clear the location cache to avoid interference
      // Use a more thorough approach to clear the cache
      const cacheEntries = await payload.find({
        collection: "location-cache",
        limit: 1000,
        depth: 0,
      });

      for (const entry of cacheEntries.docs) {
        try {
          await payload.delete({
            collection: "location-cache",
            id: entry.id,
          });
        } catch (deleteError) {
          // Ignore individual delete errors
        }
      }
    } catch (error) {
      console.warn("Failed to truncate collections:", error);
    }

    // Reset the mock functions completely for each test
    mockGoogleGeocode.mockReset();
    mockNominatimGeocode.mockReset();

    // Reset environment variables - let each test set its own
    delete process.env.GOOGLE_MAPS_API_KEY;

    // Don't create the service here - let each test create it after setting up environment
    // This ensures clean state for each test
    geocodingService = null as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe.sequential("constructor", () => {
    it("should initialize with Google geocoder when API key is available", () => {
      process.env.GOOGLE_MAPS_API_KEY = "test-api-key";
      const service = new GeocodingService(payload);
      expect(service).toBeDefined();
    });

    it("should initialize without Google geocoder when API key is not available", () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      const service = new GeocodingService(payload);
      expect(service).toBeDefined();
    });
  });

  // Helper function to ensure service is created
  const ensureServiceCreated = (withGoogleApi = false) => {
    if (withGoogleApi) {
      process.env.GOOGLE_MAPS_API_KEY = "test-api-key";
    } else {
      delete process.env.GOOGLE_MAPS_API_KEY;
    }
    geocodingService = new GeocodingService(payload);
  };

  describe.sequential("geocode", () => {
    const mockAddress = "123 Main St, San Francisco, CA";
    const mockGoogleResult = {
      latitude: 37.7749,
      longitude: -122.4194,
      formattedAddress: "123 Main St, San Francisco, CA 94102, USA",
      streetNumber: "123",
      streetName: "Main St",
      city: "San Francisco",
      state: "CA",
      zipcode: "94102",
      country: "USA",
      extra: {
        googlePlaceId: "ChIJd8BlQ2BZwokRAFUEcm_qrcA",
        confidence: 0.9,
      },
    };

    const mockNominatimResult = {
      latitude: 37.7749,
      longitude: -122.4194,
      formattedAddress: "123 Main Street, San Francisco, California, USA",
      streetNumber: "123",
      streetName: "Main Street",
      city: "San Francisco",
      state: "California",
      country: "USA",
      extra: {
        osmId: "123456",
        importance: 0.7,
      },
    };

    it("should successfully geocode with Google provider", async () => {
      const uniqueAddress = `1234 Unique Google St, San Francisco, CA ${testCounter}-${Date.now()}`;
      const mockGoogleResult = {
        latitude: 37.7749,
        longitude: -122.4194,
        formattedAddress: `1234 Unique Google St, San Francisco, CA 94102, USA ${testCounter}`,
        streetNumber: "1234",
        streetName: "Unique Google St",
        city: "San Francisco",
        state: "CA",
        zipcode: "94102",
        country: "USA",
        extra: {
          googlePlaceId: "ChIJd8BlQ2BZwokRAFUEcm_qrcA",
          confidence: 0.9,
        },
      };

      // Set up mocks BEFORE creating service
      mockGoogleGeocoder.geocode.mockResolvedValue([mockGoogleResult]);
      // Ensure Nominatim is not called by setting it to fail
      mockNominatimGeocoder.geocode.mockRejectedValue(
        new Error("Should not reach Nominatim"),
      );

      // Set up environment and recreate service to include Google geocoder AFTER setting up mocks
      process.env.GOOGLE_MAPS_API_KEY = "test-api-key";
      geocodingService = new GeocodingService(payload);

      const result = await geocodingService.geocode(uniqueAddress);

      expect(result).toMatchObject({
        latitude: 37.7749,
        longitude: -122.4194,
        confidence: expect.any(Number),
        provider: "google",
        normalizedAddress: expect.any(String),
        components: {
          streetNumber: "1234",
          streetName: "Unique Google St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94102",
          country: "USA",
        },
        metadata: expect.any(Object),
      });

      expect(result.fromCache).toBeUndefined(); // fromCache is only set to true for cached results

      // Verify Google was called (may have been called by other tests too)
      expect(mockGoogleGeocoder.geocode).toHaveBeenCalled();
    });

    it("should fallback to Nominatim when Google fails", async () => {
      const uniqueAddress = `5678 Fallback Ave, San Francisco, CA ${testCounter}-${Date.now()}`;

      // Set up mocks BEFORE creating service
      mockGoogleGeocoder.geocode.mockRejectedValue(
        new Error("Google API error"),
      );
      mockNominatimGeocoder.geocode.mockResolvedValue([
        {
          latitude: 37.7749,
          longitude: -122.4194,
          formattedAddress: `5678 Fallback Avenue, San Francisco, California, USA ${testCounter}`,
          streetNumber: "5678",
          streetName: "Fallback Avenue",
          city: "San Francisco",
          state: "California",
          country: "USA",
          extra: {
            osmId: "123456",
            importance: 0.7,
          },
        },
      ]);

      // Set up environment and recreate service to include Google geocoder AFTER setting up mocks
      process.env.GOOGLE_MAPS_API_KEY = "test-api-key";
      geocodingService = new GeocodingService(payload);

      const result = await geocodingService.geocode(uniqueAddress);

      expect(result.provider).toBe("nominatim");
      expect(result.latitude).toBe(37.7749);
      expect(result.longitude).toBe(-122.4194);
      expect(mockGoogleGeocoder.geocode).toHaveBeenCalled();
      expect(mockNominatimGeocoder.geocode).toHaveBeenCalled();
    });

    it("should use Nominatim when Google API key is not available", async () => {
      // Set up mocks BEFORE creating service
      mockGoogleGeocoder.geocode.mockRejectedValue(
        new Error("Google not available"),
      );
      mockNominatimGeocoder.geocode.mockResolvedValue([
        {
          latitude: 37.7749,
          longitude: -122.4194,
          formattedAddress: `9012 Nominatim Boulevard, San Francisco, California, USA ${testCounter}`,
          streetNumber: "9012",
          streetName: "Nominatim Boulevard",
          city: "San Francisco",
          state: "California",
          country: "USA",
          extra: {
            osmId: "123456",
            importance: 0.7,
          },
        },
      ]);

      // Ensure no Google API key and recreate service AFTER setting up mocks
      delete process.env.GOOGLE_MAPS_API_KEY;
      geocodingService = new GeocodingService(payload);

      const uniqueAddress = `9012 Nominatim Blvd, San Francisco, CA ${testCounter}-${Date.now()}`;

      const result = await geocodingService.geocode(uniqueAddress);

      expect(result.provider).toBe("nominatim");
      expect(result.latitude).toBe(37.7749);
      expect(result.longitude).toBe(-122.4194);
      expect(mockNominatimGeocoder.geocode).toHaveBeenCalledWith(uniqueAddress);
    });

    it("should return cached result when available", async () => {
      // Create service instance for this test
      geocodingService = new GeocodingService(payload);

      const uniqueAddress = `111 Cache St, San Francisco, CA ${Date.now()}-${Math.random()}`;

      // Create a cached result
      const cachedResult = await payload.create({
        collection: "location-cache",
        data: {
          address: uniqueAddress,
          normalizedAddress: uniqueAddress
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .replace(/\s+/g, " ")
            .trim(),
          latitude: 37.7749,
          longitude: -122.4194,
          provider: "google",
          confidence: 0.9,
          hitCount: 1,
          lastUsed: new Date().toISOString(),
          components: {
            streetNumber: "111",
            streetName: "Cache St",
            city: "San Francisco",
            region: "CA",
            postalCode: "94102",
            country: "USA",
          },
          metadata: {},
        },
      });

      const result = await geocodingService.geocode(uniqueAddress);

      expect(result.fromCache).toBe(true);
      expect(result.latitude).toBe(37.7749);
      expect(result.longitude).toBe(-122.4194);
      expect(mockGoogleGeocoder.geocode).not.toHaveBeenCalled();
      expect(mockNominatimGeocoder.geocode).not.toHaveBeenCalled();

      // Verify hit count was updated
      const updatedCache = await payload.findByID({
        collection: "location-cache",
        id: cachedResult.id as string,
      });
      expect(updatedCache.hitCount).toBe(2);
    });

    it("should throw GeocodingError when all providers fail", async () => {
      // Create service instance for this test
      geocodingService = new GeocodingService(payload);

      const uniqueAddress = `${mockAddress} ${testCounter}`;

      // Set up mocks to fail for this test
      mockGoogleGeocoder.geocode.mockRejectedValue(
        new Error("Google not available"),
      );
      mockNominatimGeocoder.geocode.mockRejectedValue(
        new Error("Nominatim error"),
      );

      await expect(geocodingService.geocode(uniqueAddress)).rejects.toThrow(
        GeocodingError,
      );
      await expect(geocodingService.geocode(uniqueAddress)).rejects.toThrow(
        "All geocoding providers failed",
      );
    });

    it("should reject results with low confidence", async () => {
      // Reset mocks and set up failure scenario
      mockGoogleGeocoder.geocode.mockRejectedValue(
        new Error("Google not available"),
      );
      mockNominatimGeocoder.geocode.mockResolvedValue([
        {
          latitude: 91, // Invalid latitude (> 90)
          longitude: -122.4194,
          formattedAddress: "Invalid Location",
          extra: { importance: 0.8 },
        },
      ]);

      // Create service instance for this test AFTER setting up mocks
      ensureServiceCreated();

      const uniqueAddress = `${mockAddress} ${testCounter}`;

      await expect(geocodingService.geocode(uniqueAddress)).rejects.toThrow(
        GeocodingError,
      );
    });

    it("should reject results with invalid coordinates", async () => {
      const invalidResult = {
        latitude: 91, // Invalid latitude (> 90)
        longitude: -122.4194,
        formattedAddress: "Invalid Location",
        streetNumber: "123",
        streetName: "Main St",
        city: "San Francisco",
        state: "CA",
        country: "USA",
        extra: { importance: 0.8 },
      };

      // Set up mocks BEFORE creating service: Google fails, Nominatim returns invalid coordinates
      mockGoogleGeocoder.geocode.mockRejectedValue(
        new Error("Google not available"),
      );
      mockNominatimGeocoder.geocode.mockResolvedValue([invalidResult]);

      // Create service instance for this test AFTER setting up mocks
      ensureServiceCreated();

      const uniqueAddress = `${mockAddress} ${testCounter}`;

      await expect(geocodingService.geocode(uniqueAddress)).rejects.toThrow(
        GeocodingError,
      );
    });

    it("should handle empty results from provider", async () => {
      const uniqueAddress = `${mockAddress} Empty Results ${testCounter} ${Date.now()}-${Math.random()}`;

      // Set up mocks BEFORE creating service: Google fails, Nominatim returns empty array
      mockGoogleGeocoder.geocode.mockRejectedValue(
        new Error("Google not available"),
      );
      mockNominatimGeocoder.geocode.mockResolvedValue([]);

      // Create service instance for this test AFTER setting up mocks
      ensureServiceCreated();

      await expect(geocodingService.geocode(uniqueAddress)).rejects.toThrow(
        GeocodingError,
      );
    });
  });

  describe.sequential("batchGeocode", () => {
    const addresses = [
      "123 Main St, San Francisco, CA",
      "456 Oak Ave, New York, NY",
      "789 Pine Rd, Austin, TX",
    ];

    it("should process multiple addresses in batches", async () => {
      // Create service instance for this test
      geocodingService = new GeocodingService(payload);

      // Set up mocks: Google fails, Nominatim succeeds for all addresses
      mockGoogleGeocoder.geocode.mockRejectedValue(
        new Error("Google not available"),
      );
      mockNominatimGeocoder.geocode.mockImplementation((address: string) => {
        // Ensure all addresses get valid coordinates and components
        return Promise.resolve([
          {
            latitude: 37.7749,
            longitude: -122.4194,
            formattedAddress: address,
            streetNumber: "123",
            streetName: "Test St",
            city: "Test City",
            state: "CA",
            country: "USA",
            extra: { importance: 0.8 },
          },
        ]);
      });

      const result = await geocodingService.batchGeocode(addresses, 2);

      expect(result.summary.total).toBe(3);
      expect(result.summary.successful).toBe(3);
      expect(result.summary.failed).toBe(0);
      expect(result.results.size).toBe(3);

      for (const address of addresses) {
        expect(result.results.has(address)).toBe(true);
        const geocodeResult = result.results.get(address);
        expect(geocodeResult).toHaveProperty("latitude");
        expect(geocodeResult).toHaveProperty("longitude");
      }
    });

    it("should handle mixed success and failure results", async () => {
      const testAddresses = [
        `123 Mixed Main St, San Francisco, CA ${testCounter}-${Date.now()}-${Math.random()}`,
        `456 Mixed Oak Ave, New York, NY ${testCounter}-${Date.now()}-${Math.random()}`,
        `789 Mixed Pine Rd, Austin, TX ${testCounter}-${Date.now()}-${Math.random()}`,
      ];

      // Set up mocks BEFORE creating service
      mockGoogleGeocoder.geocode.mockRejectedValue(
        new Error("Google not available"),
      );
      mockNominatimGeocoder.geocode.mockImplementation((address: string) => {
        if (address.includes("Mixed Main St")) {
          return Promise.resolve([
            {
              latitude: 37.7749,
              longitude: -122.4194,
              formattedAddress: address,
              streetNumber: "123",
              streetName: "Mixed Main St",
              city: "San Francisco",
              state: "CA",
              country: "USA",
              extra: { importance: 0.8 },
            },
          ]);
        } else {
          throw new Error("Geocoding failed");
        }
      });

      // Create service instance for this test AFTER setting up mocks
      geocodingService = new GeocodingService(payload);

      const result = await geocodingService.batchGeocode(testAddresses);

      expect(result.summary.total).toBe(3);
      expect(result.summary.successful).toBe(1);
      expect(result.summary.failed).toBe(2);

      const mainStResult = result.results.get(testAddresses[0]!);
      expect(mainStResult).toHaveProperty("latitude");

      const failedResult = result.results.get(testAddresses[1]!);
      expect(failedResult).toBeInstanceOf(GeocodingError);
    });

    it("should use cached results when available", async () => {
      // Create service instance for this test
      geocodingService = new GeocodingService(payload);

      // Create unique addresses for this test
      const uniqueAddresses = [
        `123 Batch St, San Francisco, CA ${Date.now()}-${Math.random()}`,
        `456 Batch Ave, New York, NY ${Date.now()}-${Math.random()}`,
        `789 Batch Rd, Austin, TX ${Date.now()}-${Math.random()}`,
      ];

      // Create cached result for first address
      await payload.create({
        collection: "location-cache",
        data: {
          address: uniqueAddresses[0]!,
          normalizedAddress: uniqueAddresses[0]!
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .replace(/\s+/g, " ")
            .trim(),
          latitude: 37.7749,
          longitude: -122.4194,
          provider: "google",
          confidence: 0.9,
          hitCount: 1,
          lastUsed: new Date().toISOString(),
          components: {},
          metadata: {},
        },
      });

      mockNominatimGeocoder.geocode.mockResolvedValue([
        {
          latitude: 40.7128,
          longitude: -74.006,
          formattedAddress: "Test Address",
          city: "Test City",
          country: "USA",
          extra: { importance: 0.8 },
        },
      ]);

      const result = await geocodingService.batchGeocode(uniqueAddresses);

      expect(result.summary.cached).toBe(1);
      expect(result.summary.successful).toBe(3);

      const cachedResult = result.results.get(uniqueAddresses[0]!);
      expect(cachedResult).toHaveProperty("fromCache", true);
    });
  });

  describe.sequential("confidence calculation", () => {
    it("should calculate higher confidence for Google results with place ID", async () => {
      const uniqueAddress = `123 Main St, San Francisco, CA ${testCounter}`;
      const resultWithPlaceId = {
        latitude: 37.7749,
        longitude: -122.4194,
        streetNumber: "123",
        streetName: "Main St",
        city: "San Francisco",
        country: "USA",
        extra: {
          googlePlaceId: "ChIJd8BlQ2BZwokRAFUEcm_qrcA",
          confidence: 0.9,
        },
      };

      // Set up mocks BEFORE creating service
      mockGoogleGeocoder.geocode.mockResolvedValue([resultWithPlaceId]);
      mockNominatimGeocoder.geocode.mockRejectedValue(
        new Error("Should not reach Nominatim"),
      );

      // Create service with Google API enabled AFTER setting up mocks
      process.env.GOOGLE_MAPS_API_KEY = "test-api-key";
      geocodingService = new GeocodingService(payload);

      const result = await geocodingService.geocode(uniqueAddress);

      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it("should calculate appropriate confidence for Nominatim results", async () => {
      const nominatimResult = {
        latitude: 37.7749,
        longitude: -122.4194,
        streetNumber: "123",
        streetName: "Main St",
        city: "San Francisco",
        country: "USA",
        extra: {
          osmId: "123456",
          importance: 0.7,
        },
      };

      // Set up mocks BEFORE creating service
      mockGoogleGeocoder.geocode.mockRejectedValue(
        new Error("Google not available"),
      );
      mockNominatimGeocoder.geocode.mockResolvedValue([nominatimResult]);

      // Create service instance for this test AFTER setting up mocks
      ensureServiceCreated();

      const result = await geocodingService.geocode(
        "123 Main St, San Francisco, CA",
      );

      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe.sequential("cache management", () => {
    it("should normalize addresses for better cache matching", async () => {
      const baseAddress = `123 Cache Normalize St, San Francisco, CA ${testCounter}-${Date.now()}-${Math.random()}`;
      const address1 = baseAddress;
      const address2 =
        baseAddress.toUpperCase().replace(/,/g, ", ").replace(/\s+/g, "  ") +
        "!!!";

      // Set up mocks BEFORE creating service
      mockGoogleGeocoder.geocode.mockRejectedValue(
        new Error("Google not available"),
      );
      mockNominatimGeocoder.geocode.mockResolvedValue([
        {
          latitude: 37.7749,
          longitude: -122.4194,
          formattedAddress: address1,
          streetNumber: "123",
          streetName: "Cache Normalize St",
          city: "San Francisco",
          state: "CA",
          country: "USA",
          extra: { importance: 0.8 },
        },
      ]);

      // Create service instance for this test AFTER setting up mocks
      ensureServiceCreated();

      // First call should hit the geocoding service and create cache entry
      const result1 = await geocodingService.geocode(address1);
      expect(result1.fromCache).toBeUndefined(); // Should not be from cache

      // Second address should hit cache due to normalization
      const result2 = await geocodingService.geocode(address2);

      expect(result2.fromCache).toBe(true);
      // First call should have created cache, second call should use cache
      expect(mockNominatimGeocoder.geocode).toHaveBeenCalledTimes(1);
      expect(mockNominatimGeocoder.geocode).toHaveBeenCalledWith(address1);
    });

    it("should clean up old cache entries", async () => {
      // Create service instance for this test
      ensureServiceCreated();

      // Create old cache entry
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
      const uniqueAddress = `Old Address ${Date.now()}-${Math.random()}`;

      await payload.create({
        collection: "location-cache",
        data: {
          address: uniqueAddress,
          normalizedAddress: uniqueAddress
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .replace(/\s+/g, " ")
            .trim(),
          latitude: 37.7749,
          longitude: -122.4194,
          provider: "nominatim",
          confidence: 0.5,
          hitCount: 1,
          lastUsed: oldDate.toISOString(),
          components: {},
          metadata: {},
        },
      });

      await geocodingService.cleanupCache();

      const remainingEntries = await payload.find({
        collection: "location-cache",
        where: {
          address: { equals: uniqueAddress },
        },
      });

      expect(remainingEntries.docs).toHaveLength(0);
    });

    it("should not clean up frequently used cache entries", async () => {
      // Create service instance for this test
      ensureServiceCreated();

      // Create recent cache entry with high hit count
      const uniqueAddress = `Popular Address ${Date.now()}-${Math.random()}`;

      await payload.create({
        collection: "location-cache",
        data: {
          address: uniqueAddress,
          normalizedAddress: uniqueAddress
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .replace(/\s+/g, " ")
            .trim(),
          latitude: 37.7749,
          longitude: -122.4194,
          provider: "nominatim",
          confidence: 0.5,
          hitCount: 10, // High hit count
          lastUsed: new Date().toISOString(),
          components: {},
          metadata: {},
        },
      });

      await geocodingService.cleanupCache();

      const remainingEntries = await payload.find({
        collection: "location-cache",
        where: {
          address: { equals: uniqueAddress },
        },
      });

      expect(remainingEntries.docs).toHaveLength(1);
    });
  });

  describe.sequential("error handling", () => {
    it("should handle network errors gracefully", async () => {
      // Create service instance for this test
      ensureServiceCreated();

      const uniqueAddress = `Test Address ${testCounter}`;

      // Set up mocks: Both providers fail with network errors
      mockGoogleGeocoder.geocode.mockRejectedValue(
        new Error("Google network error"),
      );
      mockNominatimGeocoder.geocode.mockRejectedValue(
        new Error("Network error"),
      );

      await expect(geocodingService.geocode(uniqueAddress)).rejects.toThrow(
        GeocodingError,
      );
    });

    it("should continue processing batch even when individual geocodes fail", async () => {
      const testAddresses = [
        `Good Continue Address ${testCounter}-${Date.now()}`,
        `Bad Continue Address ${testCounter}-${Date.now()}`,
        `Another Good Continue Address ${testCounter}-${Date.now()}`,
      ];

      // Set up mocks BEFORE creating service
      mockGoogleGeocoder.geocode.mockRejectedValue(
        new Error("Google not available"),
      );
      mockNominatimGeocoder.geocode.mockImplementation((address: string) => {
        if (address.includes("Bad Continue Address")) {
          throw new Error("Geocoding failed");
        }
        return Promise.resolve([
          {
            latitude: 37.7749,
            longitude: -122.4194,
            formattedAddress: address,
            streetNumber: "123",
            streetName: "Continue St",
            city: "Test City",
            state: "CA",
            country: "USA",
            extra: { importance: 0.8 },
          },
        ]);
      });

      // Create service instance for this test AFTER setting up mocks
      ensureServiceCreated();

      const result = await geocodingService.batchGeocode(testAddresses);

      expect(result.summary.successful).toBe(2);
      expect(result.summary.failed).toBe(1);
      expect(result.results.get(testAddresses[1]!)).toBeInstanceOf(
        GeocodingError,
      );
    });

    it("should handle cache errors gracefully", async () => {
      // Create service instance for this test
      ensureServiceCreated();

      // Create a unique address to avoid conflicts
      const uniqueAddress = `Test Address ${Date.now()}-${Math.random()}`;

      // Mock payload to throw error on cache operations
      const originalFind = payload.find;
      const originalUpdate = payload.update;
      const originalCreate = payload.create;

      payload.find = vi
        .fn()
        .mockRejectedValue(new Error("Database error")) as any;
      payload.update = vi
        .fn()
        .mockRejectedValue(new Error("Database error")) as any;
      payload.create = vi
        .fn()
        .mockRejectedValue(new Error("Database error")) as any;

      mockNominatimGeocoder.geocode.mockResolvedValue([
        {
          latitude: 37.7749,
          longitude: -122.4194,
          formattedAddress: uniqueAddress,
          city: "Test City",
          country: "USA",
          extra: { importance: 0.8 },
        },
      ]);

      // Should still work even if cache lookup fails
      const result = await geocodingService.geocode(uniqueAddress);

      expect(result).toHaveProperty("latitude");
      expect(result.fromCache).toBeFalsy();

      // Restore original methods immediately
      payload.find = originalFind;
      payload.update = originalUpdate;
      payload.create = originalCreate;
    });
  });
});
