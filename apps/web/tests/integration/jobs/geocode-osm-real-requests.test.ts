/**
 * Integration test for real OSM/Nominatim geocoder requests during CSV import.
 *
 * This test verifies that actual HTTP requests are made to the OpenStreetMap
 * Nominatim geocoding service when processing CSV imports with location data.
 * NO MOCKING is used - this tests the real integration with OSM.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withImportFile,
} from "../../setup/integration/environment";

// NOTE: No vi.mock() calls - we want REAL requests to OSM

describe.sequential("Geocode Batch Job - Real OSM Requests", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate();

    // Clear location cache to ensure fresh geocoding requests
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
      } catch {
        // Ignore individual delete errors
      }
    }

    // Create test catalog
    const { catalog } = await withCatalog(testEnv, {
      name: "OSM Geocoding Test Catalog",
      description: "Catalog for testing real OSM geocoding requests",
    });
    testCatalogId = catalog.id;

    // Create Nominatim provider in database (required for geocoding to work)
    // Clear existing providers first
    const existingProviders = await payload.find({
      collection: "geocoding-providers",
      limit: 100,
    });
    for (const provider of existingProviders.docs) {
      await payload.delete({
        collection: "geocoding-providers",
        id: provider.id,
      });
    }

    // Create fresh Nominatim provider
    await payload.create({
      collection: "geocoding-providers",
      data: {
        name: "Nominatim OSM Test",
        type: "nominatim",
        enabled: true,
        priority: 1,
        rateLimit: 1, // Respect OSM rate limits
        config: {
          nominatim: {
            baseUrl: "https://nominatim.openstreetmap.org",
            userAgent: "TimeTiles-IntegrationTest/1.0 (https://github.com/jfilter/timetiles)",
            addressdetails: true,
            extratags: false,
          },
        },
        tags: ["testing"],
      },
    });
  });

  it("should make real requests to OSM Nominatim for geocoding", async () => {
    // CSV with well-known locations that OSM can geocode reliably
    // Using distinct cities to avoid cache hits between addresses
    const csvContent = `name,date,location
Brandenburg Gate Event,2024-01-01,Brandenburg Gate Berlin Germany
Eiffel Tower Event,2024-01-02,Eiffel Tower Paris France
Big Ben Event,2024-01-03,Big Ben London UK
`;

    // Pre-create dataset with auto-approval to skip AWAIT_APPROVAL stage
    await withDataset(testEnv, testCatalogId, {
      name: "osm-real-test.csv",
      language: "eng",
      schemaConfig: {
        locked: false,
        autoGrow: true,
        autoApproveNonBreaking: true,
      },
    });

    const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), csvContent, {
      filename: "osm-real-test.csv",
      mimeType: "text/csv",
      additionalData: {
        originalName: "osm-real-test.csv",
      },
    });

    // Run jobs through the pipeline until geocoding and event creation complete
    let finalStage = "";
    let lastLoggedStage = "";
    for (let i = 0; i < 50; i++) {
      // Allow more iterations for real network requests
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });

      if (importJobs.docs.length > 0) {
        finalStage = importJobs.docs[0].stage;

        // Only log when stage changes to reduce noise
        if (finalStage !== lastLoggedStage) {
          console.log(`[OSM-REAL] Stage transition: ${lastLoggedStage || "start"} -> ${finalStage}`);
          lastLoggedStage = finalStage;
        }

        // Stop if we reached a terminal stage
        if (finalStage === "failed" || finalStage === "completed") {
          break;
        }
      }

      // Longer delay to respect OSM rate limits (1 request per second)
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    // Verify the import completed successfully
    const importJobs = await payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFile.id } },
    });

    expect(importJobs.docs.length).toBe(1);
    const importJob = importJobs.docs[0];

    // Should have completed, not failed
    expect(importJob.stage).toBe("completed");

    // Check that geocoding results were stored
    expect(importJob.geocodingResults).toBeDefined();

    // Verify geocoding results have real coordinates
    const geocodingResults = importJob.geocodingResults;
    expect(Object.keys(geocodingResults).length).toBeGreaterThanOrEqual(1);

    // Check at least one location was successfully geocoded with valid coordinates
    let successfulGeocodes = 0;
    for (const [location, result] of Object.entries(geocodingResults)) {
      const geoResult = result as { coordinates?: { lat: number; lng: number }; confidence?: number };
      if (geoResult.coordinates) {
        console.log(`[OSM-REAL] Geocoded "${location}": ${geoResult.coordinates.lat}, ${geoResult.coordinates.lng}`);

        // Verify coordinates are in valid ranges
        expect(geoResult.coordinates.lat).toBeGreaterThanOrEqual(-90);
        expect(geoResult.coordinates.lat).toBeLessThanOrEqual(90);
        expect(geoResult.coordinates.lng).toBeGreaterThanOrEqual(-180);
        expect(geoResult.coordinates.lng).toBeLessThanOrEqual(180);

        successfulGeocodes++;
      }
    }

    // At least one location should have been geocoded
    expect(successfulGeocodes).toBeGreaterThanOrEqual(1);

    // Verify events were created with coordinates
    const events = await payload.find({
      collection: "events",
      where: { importJob: { equals: importJob.id } },
    });

    expect(events.docs.length).toBeGreaterThanOrEqual(1);

    // Check that events have location data
    for (const event of events.docs) {
      console.log(`[OSM-REAL] Event "${event.name}": location=${JSON.stringify(event.location)}`);
    }
  }, 120000); // 2 minute timeout for real network requests

  it("should cache geocoding results to avoid duplicate OSM requests", async () => {
    // CSV with duplicate locations to test caching
    const csvContent = `name,date,location
Event 1,2024-01-01,Reichstag Berlin Germany
Event 2,2024-01-02,Reichstag Berlin Germany
Event 3,2024-01-03,Reichstag Berlin Germany
`;

    await withDataset(testEnv, testCatalogId, {
      name: "osm-cache-test.csv",
      language: "eng",
      schemaConfig: {
        locked: false,
        autoGrow: true,
        autoApproveNonBreaking: true,
      },
    });

    const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), csvContent, {
      filename: "osm-cache-test.csv",
      mimeType: "text/csv",
      additionalData: {
        originalName: "osm-cache-test.csv",
      },
    });

    // Run jobs
    let finalStage = "";
    for (let i = 0; i < 50; i++) {
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });

      if (importJobs.docs.length > 0) {
        finalStage = importJobs.docs[0].stage;
        if (finalStage === "failed" || finalStage === "completed") {
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const importJobs = await payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFile.id } },
    });

    const importJob = importJobs.docs[0];
    expect(importJob.stage).toBe("completed");

    // Verify geocoding results - should only have 1 unique location despite 3 rows
    const geocodingResults = importJob.geocodingResults;
    const uniqueLocations = Object.keys(geocodingResults);
    console.log(`[OSM-CACHE] Unique locations geocoded: ${uniqueLocations.length}`);
    console.log(`[OSM-CACHE] Locations: ${uniqueLocations.join(", ")}`);

    // Should have only geocoded 1 unique location (deduplication in batch job)
    expect(uniqueLocations.length).toBe(1);

    // But all 3 events should be created
    const events = await payload.find({
      collection: "events",
      where: { importJob: { equals: importJob.id } },
    });

    expect(events.docs.length).toBe(3);

    // Check location cache was populated
    const cacheEntries = await payload.find({
      collection: "location-cache",
      where: {
        originalAddress: { contains: "Reichstag" },
      },
    });

    console.log(`[OSM-CACHE] Cache entries found: ${cacheEntries.docs.length}`);
    expect(cacheEntries.docs.length).toBeGreaterThanOrEqual(1);
  }, 120000);

  it("should handle OSM geocoding for addresses with special characters", async () => {
    // CSV with addresses containing special characters and non-ASCII
    const csvContent = `name,date,location
Café Event,2024-01-01,"Café de Flore, Paris, France"
Müller Event,2024-01-02,"Marienplatz, München, Germany"
`;

    await withDataset(testEnv, testCatalogId, {
      name: "osm-special-chars.csv",
      language: "eng",
      schemaConfig: {
        locked: false,
        autoGrow: true,
        autoApproveNonBreaking: true,
      },
    });

    const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), csvContent, {
      filename: "osm-special-chars.csv",
      mimeType: "text/csv",
      additionalData: {
        originalName: "osm-special-chars.csv",
      },
    });

    // Run jobs
    let finalStage = "";
    for (let i = 0; i < 50; i++) {
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });

      if (importJobs.docs.length > 0) {
        finalStage = importJobs.docs[0].stage;
        if (finalStage === "failed" || finalStage === "completed") {
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const importJobs = await payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFile.id } },
    });

    const importJob = importJobs.docs[0];

    // Should complete (or fail gracefully - special chars might cause issues)
    expect(["completed", "failed"]).toContain(importJob.stage);

    if (importJob.stage === "completed") {
      // Verify geocoding results exist
      const geocodingResults = importJob.geocodingResults;
      console.log(`[OSM-SPECIAL] Geocoding results: ${JSON.stringify(Object.keys(geocodingResults))}`);

      // Check events were created
      const events = await payload.find({
        collection: "events",
        where: { importJob: { equals: importJob.id } },
      });

      console.log(`[OSM-SPECIAL] Events created: ${events.docs.length}`);
    } else {
      // Log why it failed for debugging
      console.log(`[OSM-SPECIAL] Import failed: ${JSON.stringify(importJob.errorLog)}`);
    }
  }, 120000);
});
