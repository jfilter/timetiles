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

import { ProviderManager } from "../../../lib/services/geocoding/provider-manager";
import { resetProviderRateLimiter } from "../../../lib/services/geocoding/provider-rate-limiter";

const mockGoogleGeocode = vi.fn();
const mockNominatimGeocode = vi.fn();

import {
  createIntegrationTestEnvironment,
  runJobsUntilImportSettled,
  withCatalog,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

/**
 * Generate deterministic mock coordinates based on address.
 * This ensures same address always gets same coordinates.
 */
const generateMockGeocodingResult = (address: string) => {
  // Use simple hash to generate consistent lat/lng from address
  const hash = address.split("").reduce((acc, char) => acc + (char.codePointAt(0) ?? 0), 0);
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
  const collectionsToReset = [
    "events",
    "ingest-files",
    "ingest-jobs",
    "datasets",
    "dataset-schemas",
    "user-usage",
    "location-cache",
    "payload-jobs",
  ];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testUserId: string | number;
  let fixtureCsvContent: string;

  /**
   * Helper to run all jobs until import file reaches completed/failed status.
   */
  const runJobsUntilComplete = async (ingestFileId: string, maxIterations = 50): Promise<boolean> => {
    const result = await runJobsUntilImportSettled(payload, ingestFileId, { maxIterations });
    return result.settled;
  };

  const createIngestFile = async (csvContent: string | Buffer, filename: string) =>
    withIngestFile(testEnv, testCatalogId, csvContent, { filename, user: testUserId, triggerWorkflow: true });

  beforeAll(async () => {
    // Spy on loadProviders to return mock providers instead of calling real NodeGeocoder
    const mockProviders = [
      {
        name: "Google Maps Test Provider",
        geocoder: { geocode: mockGoogleGeocode } as any,
        priority: 1,
        enabled: true,
        rateLimit: 50,
      },
      {
        name: "Nominatim",
        geocoder: { geocode: mockNominatimGeocode } as any,
        priority: 10,
        enabled: true,
        rateLimit: 1,
      },
    ];
    vi.spyOn(ProviderManager.prototype, "loadProviders").mockImplementation(function (this: any) {
      this.providers = mockProviders;
      this.configureRateLimiter();
      return Promise.resolve(mockProviders);
    });

    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;
    fixtureCsvContent = fs.readFileSync(path.join(process.cwd(), "tests/fixtures/geocoding-test.csv"), "utf8");

    await payload.create({
      collection: "geocoding-providers",
      data: {
        name: "Google Maps Test Provider",
        type: "google",
        enabled: true,
        priority: 1,
        rateLimit: 50,
        config: { google: { apiKey: "test-api-key-for-geocoding", language: "en" } },
        tags: ["testing"],
      },
    });

    const { users } = await withUsers(testEnv, { importer: { role: "user" } });
    testUserId = users.importer.id;

    const { catalog } = await withCatalog(testEnv, {
      name: "Geocoding Test Catalog",
      description: "Catalog for geocoding cache testing",
      user: users.importer,
    });
    testCatalogId = catalog.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Reset rate limiter to prevent promise-chain buildup across tests
    resetProviderRateLimiter();

    // Re-apply the ProviderManager spy BEFORE draining jobs to ensure any
    // lingering geocoding jobs from the prior test use the mock instead of
    // real providers (the global afterEach restores all mocks between tests).
    const mockProviders = [
      {
        name: "Google Maps Test Provider",
        geocoder: { geocode: mockGoogleGeocode } as any,
        priority: 1,
        enabled: true,
        rateLimit: 50,
      },
      {
        name: "Nominatim",
        geocoder: { geocode: mockNominatimGeocode } as any,
        priority: 10,
        enabled: true,
        rateLimit: 1,
      },
    ];
    vi.spyOn(ProviderManager.prototype, "loadProviders").mockImplementation(function (this: any) {
      this.providers = mockProviders;
      this.configureRateLimiter();
      return Promise.resolve(mockProviders);
    });

    // Drain lingering pipeline jobs before truncation to avoid deadlocks.
    for (let i = 0; i < 5; i++) {
      try {
        const result = await payload.jobs.run({ limit: 50 });
        if (result.noJobsRemaining) break;
      } catch {
        break;
      }
    }

    await testEnv.seedManager.truncate(collectionsToReset);

    // Verify location-cache was actually cleared — fallback to DELETE if not
    const cacheCheck = await payload.find({ collection: "location-cache", limit: 1, overrideAccess: true });
    if (cacheCheck.totalDocs > 0) {
      const allDocs = await payload.find({ collection: "location-cache", limit: 1000, overrideAccess: true });
      for (const doc of allDocs.docs) {
        await payload.delete({ collection: "location-cache", id: doc.id, overrideAccess: true });
      }
    }

    // Verify user-usage was cleared (prevents quota errors)
    const usageCheck = await payload.find({ collection: "user-usage", limit: 1, overrideAccess: true });
    if (usageCheck.totalDocs > 0) {
      const allDocs = await payload.find({ collection: "user-usage", limit: 1000, overrideAccess: true });
      for (const doc of allDocs.docs) {
        await payload.delete({ collection: "user-usage", id: doc.id, overrideAccess: true });
      }
    }

    mockGoogleGeocode.mockReset();
    mockNominatimGeocode.mockReset();

    mockGoogleGeocode.mockImplementation((address: string) => {
      const result = generateMockGeocodingResult(address);
      return Promise.resolve([result]);
    });

    mockNominatimGeocode.mockImplementation((address: string) => {
      const result = generateMockGeocodingResult(address);
      return Promise.resolve([result]);
    });
  });

  describe("Scenario 1: First Import with Unique Locations", () => {
    it("should geocode unique locations and populate cache", async () => {
      // Create CSV with 15 rows, 10 unique locations (5 duplicates)
      const { ingestFile } = await createIngestFile(fixtureCsvContent, "geocoding-test.csv");

      // Run complete import pipeline
      await runJobsUntilComplete(ingestFile.id);

      // Verify location field was detected
      const importJobs = await payload.find({
        collection: "ingest-jobs",
        where: { ingestFile: { equals: ingestFile.id } },
      });
      expect(importJobs.docs.length).toBeGreaterThan(0);
      expect(importJobs.docs[0].detectedFieldMappings?.locationPath).toBeDefined();

      // Verify location-cache was populated with 10 unique locations
      const locationCache = await payload.find({ collection: "location-cache", limit: 100 });

      expect(locationCache.docs).toHaveLength(10);

      // Verify geocoding provider was called exactly 10 times (once per unique location)
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(10);

      // Verify all cache entries were created during this test run
      const now = new Date();
      for (const entry of locationCache.docs) {
        const createdAt = new Date(entry.createdAt);
        expect(now.getTime() - createdAt.getTime()).toBeLessThan(60000); // Within 60 seconds (pipeline can be slow)
        expect(entry.hitCount).toBe(1);
      }

      // Verify all events were created with coordinates (scoped to this import's dataset)
      const ingestJobDoc = importJobs.docs[0];
      const datasetId = typeof ingestJobDoc.dataset === "object" ? ingestJobDoc.dataset.id : ingestJobDoc.dataset;
      const events = await payload.find({
        collection: "events",
        where: { dataset: { equals: datasetId } },
        limit: 100,
      });

      expect(events.docs).toHaveLength(15);

      // All events should have coordinates
      for (const event of events.docs) {
        expect(event.location).toBeDefined();
        expect(event.location.latitude).toBeTypeOf("number");
        expect(event.location.longitude).toBeTypeOf("number");
        expect(event.coordinateSource.type).toBe("geocoded");
      }
    });
  });

  describe("Scenario 2: Cache Reuse Across Follow-up Imports", () => {
    it("should reuse cached locations and geocode only new follow-up locations", async () => {
      // First import - populate cache
      const { ingestFile: firstIngestFile } = await createIngestFile(fixtureCsvContent, "geocoding-test-first.csv");

      await runJobsUntilComplete(firstIngestFile.id);

      // Verify first import called geocoding 10 times
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(10);

      // Get cache state after first import
      const cacheAfterFirst = await payload.find({ collection: "location-cache", limit: 100 });

      expect(cacheAfterFirst.docs).toHaveLength(10);

      // Clear mock call count
      vi.clearAllMocks();

      // Second import - same CSV, should use cache
      const { ingestFile: secondIngestFile } = await createIngestFile(fixtureCsvContent, "geocoding-test-second.csv");

      await runJobsUntilComplete(secondIngestFile.id);

      // Verify second import did NOT call geocoding API (all from cache)
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(0);

      // Verify cache still has only 10 entries (no duplicates)
      const cacheAfterSecond = await payload.find({ collection: "location-cache", limit: 100 });

      expect(cacheAfterSecond.docs).toHaveLength(10);

      // Verify hitCount increased for all cached entries
      for (const entry of cacheAfterSecond.docs) {
        expect(entry.hitCount).toBeGreaterThanOrEqual(2); // At least 2 hits now
      }

      // Verify events from both imports were created with coordinates
      // Get datasets for both imports
      const firstImportJobs = await payload.find({
        collection: "ingest-jobs",
        where: { ingestFile: { equals: firstIngestFile.id } },
      });
      const secondImportJobs = await payload.find({
        collection: "ingest-jobs",
        where: { ingestFile: { equals: secondIngestFile.id } },
      });
      const firstDatasetId =
        typeof firstImportJobs.docs[0].dataset === "object"
          ? firstImportJobs.docs[0].dataset.id
          : firstImportJobs.docs[0].dataset;
      const secondDatasetId =
        typeof secondImportJobs.docs[0].dataset === "object"
          ? secondImportJobs.docs[0].dataset.id
          : secondImportJobs.docs[0].dataset;

      const firstEvents = await payload.find({
        collection: "events",
        where: { dataset: { equals: firstDatasetId } },
        limit: 100,
      });
      const secondEvents = await payload.find({
        collection: "events",
        where: { dataset: { equals: secondDatasetId } },
        limit: 100,
      });
      // Both imports use same CSV (15 events each) — may share or differ in dataset
      expect(
        firstEvents.docs.length + (firstDatasetId === secondDatasetId ? 0 : secondEvents.docs.length)
      ).toBeGreaterThanOrEqual(15);

      // All events should have coordinates from either first geocoding or cache
      for (const event of [...firstEvents.docs, ...secondEvents.docs]) {
        expect(event.location).toBeDefined();
        expect(event.location.latitude).toBeTypeOf("number");
        expect(event.location.longitude).toBeTypeOf("number");
        expect(event.coordinateSource.type).toBe("geocoded");
      }

      // Clear mock call count
      vi.clearAllMocks();

      // Third import with 5 cached + 5 new locations
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

      const { ingestFile: thirdIngestFile } = await createIngestFile(mixedCsvContent, "geocoding-test-mixed.csv");

      await runJobsUntilComplete(thirdIngestFile.id);

      // Verify only 5 new API calls (for new locations)
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(5);

      // Verify specific calls were for new locations (normalized before geocoding)
      const callAddresses = mockGoogleGeocode.mock.calls.map((call: unknown[]) => call[0]);
      expect(callAddresses).toContain("111 broadway new york ny");
      expect(callAddresses).toContain("222 market st san francisco ca");
      expect(callAddresses).toContain("333 sunset blvd los angeles ca");
      expect(callAddresses).toContain("444 michigan ave chicago il");
      expect(callAddresses).toContain("555 newbury st boston ma");

      // Verify cache now has 15 total entries (10 original + 5 new)
      const cacheAfterMixed = await payload.find({ collection: "location-cache", limit: 100 });

      expect(cacheAfterMixed.docs).toHaveLength(15);

      // Verify events from the third import (10 events)
      const thirdImportJobs = await payload.find({
        collection: "ingest-jobs",
        where: { ingestFile: { equals: thirdIngestFile.id } },
      });
      const thirdDatasetId =
        typeof thirdImportJobs.docs[0].dataset === "object"
          ? thirdImportJobs.docs[0].dataset.id
          : thirdImportJobs.docs[0].dataset;
      const thirdEvents = await payload.find({
        collection: "events",
        where: { dataset: { equals: thirdDatasetId } },
        limit: 100,
      });
      expect(thirdEvents.docs).toHaveLength(10);

      // All events from third import should have coordinates
      for (const event of thirdEvents.docs) {
        expect(event.location).toBeDefined();
        expect(event.coordinateSource.type).toBe("geocoded");
      }
    }, 60000); // 60 second timeout - runs three full import pipelines
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

      const { ingestFile } = await createIngestFile(csvWithDuplicates, "geocoding-test-duplicates.csv");

      await runJobsUntilComplete(ingestFile.id);

      // Verify only 3 API calls (for 3 unique locations, not 10 total rows)
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(3);

      // Verify specific calls (normalized before geocoding)
      const callAddresses = mockGoogleGeocode.mock.calls.map((call: unknown[]) => call[0]);
      expect(callAddresses).toContain("same location street");
      expect(callAddresses).toContain("another location ave");
      expect(callAddresses).toContain("third location blvd");

      // Verify cache has 3 entries
      const locationCache = await payload.find({ collection: "location-cache", limit: 100 });

      expect(locationCache.docs).toHaveLength(3);

      // Verify all 10 events were created with coordinates (scoped to this import's dataset)
      const dupImportJobs = await payload.find({
        collection: "ingest-jobs",
        where: { ingestFile: { equals: ingestFile.id } },
      });
      const dupDatasetId =
        typeof dupImportJobs.docs[0].dataset === "object"
          ? dupImportJobs.docs[0].dataset.id
          : dupImportJobs.docs[0].dataset;
      const events = await payload.find({
        collection: "events",
        where: { dataset: { equals: dupDatasetId } },
        limit: 100,
      });

      expect(events.docs).toHaveLength(10);

      // Group events by location to verify coordinates are consistent
      const eventsByLocation: Record<string, any[]> = {};
      for (const event of events.docs) {
        const location = event.transformedData.location;
        eventsByLocation[location] ??= [];
        eventsByLocation[location].push(event);
      }

      // Verify all events with same location have same coordinates
      expect(Object.keys(eventsByLocation)).toHaveLength(3);

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

      const { ingestFile } = await createIngestFile(csvWithVariations, "geocoding-test-variations.csv");

      await runJobsUntilComplete(ingestFile.id);

      // Addresses are normalized before geocoding: "  123 Main St", "123 Main St",
      // and "123 MAIN ST" all normalize to "123 main st" → only 2 unique locations.
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(2);

      const locationCache = await payload.find({ collection: "location-cache", limit: 100 });

      expect(locationCache.docs).toHaveLength(2);

      const normalizedAddresses = locationCache.docs.map((doc: any) => doc.normalizedAddress);
      expect(normalizedAddresses).toContain("123 main st");
      expect(normalizedAddresses).toContain("456 oak ave");
    });

    it("should track hit counts correctly", async () => {
      const csvContent = `id,title,date,location
1,Event 1,2024-01-01,Test Location
2,Event 2,2024-01-02,Test Location
3,Event 3,2024-01-03,Test Location`;

      const { ingestFile } = await createIngestFile(csvContent, "geocoding-test-hitcount.csv");

      await runJobsUntilComplete(ingestFile.id);

      // Should geocode once, use cache for other 2
      expect(mockGoogleGeocode).toHaveBeenCalledTimes(1);

      const locationCache = await payload.find({
        collection: "location-cache",
        where: { normalizedAddress: { equals: "test location" } },
      });

      expect(locationCache.docs).toHaveLength(1);
      expect(locationCache.docs[0].hitCount).toBe(1);
    });
  });
});
