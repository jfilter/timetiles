/**
 * Integration tests for geocoding cache functionality during CSV imports.
 *
 * Tests the complete import pipeline with geocoding, verifying that:
 * - Locations are geocoded correctly
 * - Cache is populated and reused across imports
 * - Duplicate locations within one import are only geocoded once
 * - Mixed cached/uncached locations work correctly
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to ensure mocks are set up before imports
const { mockGoogleGeocode, mockNominatimGeocode, mockNodeGeocoder } = vi.hoisted(() => {
  const mockGoogleGeocode = vi.fn();
  const mockNominatimGeocode = vi.fn();

  const mockNodeGeocoder = vi.fn().mockImplementation((config: any) => {
    if (config?.provider === "google") {
      return { geocode: mockGoogleGeocode };
    } else {
      return { geocode: mockNominatimGeocode };
    }
  });

  return { mockGoogleGeocode, mockNominatimGeocode, mockNodeGeocoder };
});

// Mock node-geocoder module (the underlying library used by geocoding providers)
vi.mock("node-geocoder", () => ({
  default: mockNodeGeocoder,
}));

import { createIntegrationTestEnvironment, withCatalog, withImportFile } from "../../setup/integration/environment";

/**
 * Generate deterministic mock coordinates based on address.
 * This ensures same address always gets same coordinates.
 */
const generateMockGeocodingResult = (address: string) => {
  // Use simple hash to generate consistent lat/lng from address
  const hash = address.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const lat = 30 + (hash % 40); // Range: 30-70
  const lng = -120 + (hash % 60); // Range: -120 to -60

  return {
    latitude: lat + (hash % 1000) / 10000, // Add decimal precision
    longitude: lng + ((hash * 13) % 1000) / 10000,
    confidence: 0.95,
    normalizedAddress: address.toLowerCase().trim(),
    provider: "google",
  };
};

describe.sequential("Geocoding Cache Integration", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testDir: string;
  let testCounter = 0;

  /**
   * Helper to run all jobs until import file reaches completed/failed status.
   */
  const runJobsUntilComplete = async (importFileId: string, maxIterations = 50): Promise<boolean> => {
    let pipelineComplete = false;
    let iteration = 0;

    while (!pipelineComplete && iteration < maxIterations) {
      iteration++;
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importFile = await payload.findByID({
        collection: "import-files",
        id: importFileId,
      });

      pipelineComplete = importFile.status === "completed" || importFile.status === "failed";

      // Small delay to avoid tight loop
      if (!pipelineComplete) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return pipelineComplete;
  };

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    testDir = testEnv.tempDir ?? "/tmp";

    // Create temp directory for CSV files
    const csvDir = path.join(testDir, "csv-files");
    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Increment counter for unique names
    testCounter++;

    // Clear collections and reset mocks before each test
    await testEnv.seedManager.truncate();

    // Clear location cache explicitly
    const cacheEntries = await payload.find({
      collection: "location-cache",
      limit: 1000,
    });
    for (const entry of cacheEntries.docs) {
      await payload.delete({
        collection: "location-cache",
        id: entry.id,
      });
    }

    // Clear geocoding providers from previous tests
    const existingProviders = await payload.find({
      collection: "geocoding-providers",
      limit: 1000,
    });
    for (const provider of existingProviders.docs) {
      await payload.delete({
        collection: "geocoding-providers",
        id: provider.id,
      });
    }

    // Reset mocks completely
    mockGoogleGeocode.mockReset();
    mockNominatimGeocode.mockReset();

    // Set up mock to return deterministic results
    // node-geocoder returns an array of results
    mockGoogleGeocode.mockImplementation((address: string) => {
      const result = generateMockGeocodingResult(address);
      return Promise.resolve([result]);
    });

    mockNominatimGeocode.mockImplementation((address: string) => {
      const result = generateMockGeocodingResult(address);
      return Promise.resolve([result]);
    });

    // Create geocoding provider in database with unique name
    await payload.create({
      collection: "geocoding-providers",
      data: {
        name: `Google Maps Test ${testCounter}`,
        type: "google",
        enabled: true,
        priority: 1,
        rateLimit: 50,
        config: {
          google: {
            apiKey: "test-api-key-for-geocoding",
            language: "en",
          },
        },
        tags: ["testing"],
      },
    });

    // Initialize geocoding service
    const { initializeGeocoding } = await import("../../../lib/services/geocoding");
    initializeGeocoding(payload);

    // Create test catalog with auto-approval settings
    const { catalog } = await withCatalog(testEnv, {
      name: `Geocoding Test Catalog ${testCounter}`,
      description: "Catalog for geocoding cache testing",
    });
    testCatalogId = catalog.id;
  });

  describe("Debug: Pipeline Stages", () => {
    it("should reach geocode stage and detect location field", async () => {
      const csvContent = fs.readFileSync(path.join(process.cwd(), "tests/fixtures/geocoding-test.csv"), "utf8");

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: "geocoding-test.csv",
      });

      // Run complete import pipeline
      await runJobsUntilComplete(importFile.id);

      // Get the import job to check stages
      const importJobs = await payload.find({
        collection: "import-jobs",
        where: {
          importFile: { equals: importFile.id },
        },
      });

      expect(importJobs.docs.length).toBeGreaterThan(0);
      const importJob = importJobs.docs[0];

      // Debug: Check detected field mappings
      console.log("Import Job Stage:", importJob.stage);
      console.log("Detected Field Mappings:", JSON.stringify(importJob.detectedFieldMappings, null, 2));
      console.log("Geocoding Results:", JSON.stringify(importJob.geocodingResults, null, 2));

      // Verify location field was detected
      expect(importJob.detectedFieldMappings?.locationPath).toBeDefined();
    });
  });

  describe("Scenario 1: First Import with Unique Locations", () => {
    it("should geocode unique locations and populate cache", async () => {
      // Create CSV with 15 rows, 10 unique locations (5 duplicates)
      const csvContent = fs.readFileSync(path.join(process.cwd(), "tests/fixtures/geocoding-test.csv"), "utf8");

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: "geocoding-test.csv",
      });

      // Run complete import pipeline
      await runJobsUntilComplete(importFile.id);

      // Verify location-cache was populated with 10 unique locations
      const locationCache = await payload.find({
        collection: "location-cache",
        limit: 100,
      });

      expect(locationCache.docs.length).toBe(10);

      // Verify geocoding provider was called exactly 10 times (once per unique location)
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(10);

      // Verify all cache entries were created during this test run
      const now = new Date();
      for (const entry of locationCache.docs) {
        const createdAt = new Date(entry.createdAt);
        expect(now.getTime() - createdAt.getTime()).toBeLessThan(60000); // Within 60 seconds (pipeline can be slow)
        expect(entry.hitCount).toBe(1);
      }

      // Verify all events were created with coordinates
      // Since we clear the database before each test, all events belong to this import
      const events = await payload.find({
        collection: "events",
        limit: 100,
      });

      expect(events.docs.length).toBe(15);

      // All events should have coordinates
      for (const event of events.docs) {
        expect(event.location).toBeDefined();
        expect(event.location.latitude).toBeTypeOf("number");
        expect(event.location.longitude).toBeTypeOf("number");
        expect(event.coordinateSource.type).toBe("geocoded");
      }
    });
  });

  describe("Scenario 2: Second Import with Same Locations (Cache Hits)", () => {
    it("should reuse cached locations without calling geocoding API", async () => {
      // First import - populate cache
      const csvContent = fs.readFileSync(path.join(process.cwd(), "tests/fixtures/geocoding-test.csv"), "utf8");

      const { importFile: firstImportFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: "geocoding-test-first.csv",
      });

      await runJobsUntilComplete(firstImportFile.id);

      // Verify first import called geocoding 10 times
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(10);

      // Get cache state after first import
      const cacheAfterFirst = await payload.find({
        collection: "location-cache",
        limit: 100,
      });

      expect(cacheAfterFirst.docs.length).toBe(10);

      // Clear mock call count
      vi.clearAllMocks();

      // Second import - same CSV, should use cache
      const { importFile: secondImportFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: "geocoding-test-second.csv",
      });

      await runJobsUntilComplete(secondImportFile.id);

      // Verify second import did NOT call geocoding API (all from cache)
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(0);

      // Verify cache still has only 10 entries (no duplicates)
      const cacheAfterSecond = await payload.find({
        collection: "location-cache",
        limit: 100,
      });

      expect(cacheAfterSecond.docs.length).toBe(10);

      // Verify hitCount increased for all cached entries
      for (const entry of cacheAfterSecond.docs) {
        expect(entry.hitCount).toBeGreaterThanOrEqual(2); // At least 2 hits now
      }

      // Verify all events (from both imports) were created with coordinates
      // After two imports of 15 events each, we should have 30 events total
      const allEvents = await payload.find({
        collection: "events",
        limit: 100,
      });

      expect(allEvents.docs.length).toBe(30); // 15 from first + 15 from second

      // All events should have coordinates from either first geocoding or cache
      for (const event of allEvents.docs) {
        expect(event.location).toBeDefined();
        expect(event.location.latitude).toBeTypeOf("number");
        expect(event.location.longitude).toBeTypeOf("number");
        expect(event.coordinateSource.type).toBe("geocoded");
      }
    }, 60000); // 60 second timeout - runs two full import pipelines
  });

  describe("Scenario 3: Mixed Cached and Uncached Locations", () => {
    it("should geocode only new locations and reuse cached ones", async () => {
      // First import with 10 unique locations
      const csvContent = fs.readFileSync(path.join(process.cwd(), "tests/fixtures/geocoding-test.csv"), "utf8");

      const { importFile: firstImportFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: "geocoding-test-first.csv",
      });

      await runJobsUntilComplete(firstImportFile.id);

      expect(mockGoogleGeocode).toHaveBeenCalledTimes(10);

      // Clear mock call count
      vi.clearAllMocks();

      // Second import with 5 cached + 5 new locations
      const mixedCsvContent = `id,title,date,location
1,Event at Main St,2024-01-01,123 Main St New York NY
2,Event at Oak Ave,2024-01-02,456 Oak Ave San Francisco CA
3,Event at Pine Rd,2024-01-03,789 Pine Rd Los Angeles CA
4,Event at Elm St,2024-01-04,321 Elm St Chicago IL
5,Event at Maple Dr,2024-01-05,654 Maple Dr Boston MA
6,New Event at Broadway,2024-01-06,111 Broadway New York NY
7,New Event at Market,2024-01-07,222 Market St San Francisco CA
8,New Event at Sunset,2024-01-08,333 Sunset Blvd Los Angeles CA
9,New Event at Michigan,2024-01-09,444 Michigan Ave Chicago IL
10,New Event at Newbury,2024-01-10,555 Newbury St Boston MA`;

      const { importFile: secondImportFile } = await withImportFile(testEnv, testCatalogId, mixedCsvContent, {
        filename: "geocoding-test-mixed.csv",
      });

      await runJobsUntilComplete(secondImportFile.id);

      // Verify only 5 new API calls (for new locations)
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(5);

      // Verify specific calls were for new locations
      const callAddresses = mockGoogleGeocode.mock.calls.map((call) => call[0]);
      expect(callAddresses).toContain("111 Broadway New York NY");
      expect(callAddresses).toContain("222 Market St San Francisco CA");
      expect(callAddresses).toContain("333 Sunset Blvd Los Angeles CA");
      expect(callAddresses).toContain("444 Michigan Ave Chicago IL");
      expect(callAddresses).toContain("555 Newbury St Boston MA");

      // Verify cache now has 15 total entries (10 original + 5 new)
      const cacheAfterMixed = await payload.find({
        collection: "location-cache",
        limit: 100,
      });

      expect(cacheAfterMixed.docs.length).toBe(15);

      // Verify all events created (15 from first + 10 from second = 25 total)
      const allEvents = await payload.find({
        collection: "events",
        limit: 100,
      });

      expect(allEvents.docs.length).toBe(25);

      // All events should have coordinates
      for (const event of allEvents.docs) {
        expect(event.location).toBeDefined();
        expect(event.coordinateSource.type).toBe("geocoded");
      }
    }, 60000); // 60 second timeout - runs two full import pipelines
  });

  describe("Scenario 4: Duplicate Locations Within Single Import", () => {
    it("should geocode each unique location only once per import", async () => {
      // Create CSV with many duplicate locations
      const csvWithDuplicates = `id,title,date,location
1,Event 1,2024-01-01,Same Location Street
2,Event 2,2024-01-02,Same Location Street
3,Event 3,2024-01-03,Same Location Street
4,Event 4,2024-01-04,Same Location Street
5,Event 5,2024-01-05,Same Location Street
6,Event 6,2024-01-06,Another Location Ave
7,Event 7,2024-01-07,Another Location Ave
8,Event 8,2024-01-08,Another Location Ave
9,Event 9,2024-01-09,Third Location Blvd
10,Event 10,2024-01-10,Third Location Blvd`;

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvWithDuplicates, {
        filename: "geocoding-test-duplicates.csv",
      });

      await runJobsUntilComplete(importFile.id);

      // Verify only 3 API calls (for 3 unique locations, not 10 total rows)
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(3);

      // Verify specific calls
      const callAddresses = mockGoogleGeocode.mock.calls.map((call) => call[0]);
      expect(callAddresses).toContain("Same Location Street");
      expect(callAddresses).toContain("Another Location Ave");
      expect(callAddresses).toContain("Third Location Blvd");

      // Verify cache has 3 entries
      const locationCache = await payload.find({
        collection: "location-cache",
        limit: 100,
      });

      expect(locationCache.docs.length).toBe(3);

      // Verify all 10 events were created with coordinates
      // Since we clear database before each test, all events belong to this import
      const events = await payload.find({
        collection: "events",
        limit: 100,
      });

      expect(events.docs.length).toBe(10);

      // Group events by location to verify coordinates are consistent
      const eventsByLocation: Record<string, any[]> = {};
      for (const event of events.docs) {
        const location = event.data.location;
        if (!eventsByLocation[location]) {
          eventsByLocation[location] = [];
        }
        eventsByLocation[location].push(event);
      }

      // Verify all events with same location have same coordinates
      expect(Object.keys(eventsByLocation).length).toBe(3);

      for (const eventsAtLocation of Object.values(eventsByLocation)) {
        const firstEvent = eventsAtLocation[0];
        const lat = firstEvent.location.latitude;
        const lng = firstEvent.location.longitude;

        // All events at this location should have same coordinates
        for (const event of eventsAtLocation) {
          expect(event.location.latitude).toBe(lat);
          expect(event.location.longitude).toBe(lng);
          expect(event.coordinateSource.type).toBe("geocoded");
        }
      }
    });
  });

  describe("Cache Verification", () => {
    it("should store normalized addresses in cache", async () => {
      // Import with various address formats
      const csvWithVariations = `id,title,date,location
1,Event 1,2024-01-01,  123 Main St
2,Event 2,2024-01-02,123 Main St
3,Event 3,2024-01-03,123 MAIN ST
4,Event 4,2024-01-04,456 Oak Ave`;

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvWithVariations, {
        filename: "geocoding-test-variations.csv",
      });

      await runJobsUntilComplete(importFile.id);

      // Should only geocode 2 unique locations (normalized)
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(2);

      const locationCache = await payload.find({
        collection: "location-cache",
        limit: 100,
      });

      expect(locationCache.docs.length).toBe(2);

      // Verify normalized addresses are stored
      const normalizedAddresses = locationCache.docs.map((doc: any) => doc.normalizedAddress);
      expect(normalizedAddresses).toContain("123 main st");
      expect(normalizedAddresses).toContain("456 oak ave");
    });

    it("should track hit counts correctly", async () => {
      const csvContent = `id,title,date,location
1,Event 1,2024-01-01,Test Location
2,Event 2,2024-01-02,Test Location
3,Event 3,2024-01-03,Test Location`;

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: "geocoding-test-hitcount.csv",
      });

      await runJobsUntilComplete(importFile.id);

      // Should geocode once, use cache for other 2
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(1);

      const locationCache = await payload.find({
        collection: "location-cache",
        where: {
          normalizedAddress: { equals: "test location" },
        },
      });

      expect(locationCache.docs.length).toBe(1);
      expect(locationCache.docs[0].hitCount).toBe(1);
    });
  });
});
