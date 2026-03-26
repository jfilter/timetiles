/**
 * Integration test for fallback geocoding via locationNamePath.
 *
 * Verifies that when source-data lat/lon fields exist but are empty for
 * some rows, the pipeline falls back to geocoding using the location name
 * (venue) field instead of leaving those events without coordinates.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as geocodingModule from "@/lib/services/geocoding";

import {
  createIntegrationTestEnvironment,
  runJobsUntilIngestJobStage,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

/**
 * Mock batchGeocode that succeeds for known venue names.
 */
const createVenueGeocodeBatchGeocode = () =>
  vi.fn().mockImplementation((addresses: string[]) => {
    const results = new Map<string, any>();
    let successful = 0;
    let failed = 0;
    for (const address of addresses) {
      if (address.includes("city hall")) {
        results.set(address, {
          latitude: 50.94,
          longitude: 6.96,
          normalizedAddress: "City Hall, Cologne",
          confidence: 0.7,
          provider: "mock",
          components: {},
          metadata: {},
        });
        successful++;
      } else if (address.includes("market square")) {
        results.set(address, {
          latitude: 50.93,
          longitude: 6.95,
          normalizedAddress: "Market Square, Cologne",
          confidence: 0.65,
          provider: "mock",
          components: {},
          metadata: {},
        });
        successful++;
      } else {
        results.set(address, new (geocodingModule as any).GeocodingError("Unknown venue", "GEOCODING_FAILED"));
        failed++;
      }
    }
    return { results, summary: { total: addresses.length, successful, failed, cached: 0 } };
  });

describe.sequential("Geocode Fallback to Location Name", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testUserId: string | number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    vi.spyOn(geocodingModule, "createGeocodingService").mockReturnValue({
      batchGeocode: createVenueGeocodeBatchGeocode(),
    } as unknown as geocodingModule.GeocodingService);

    await testEnv.seedManager.truncate([
      "users",
      "catalogs",
      "datasets",
      "dataset-schemas",
      "events",
      "ingest-files",
      "ingest-jobs",
      "payload-jobs",
    ]);

    const { users } = await withUsers(testEnv, { testUser: { role: "admin" } });
    testUserId = users.testUser.id;

    const { catalog } = await withCatalog(testEnv, {
      name: "Fallback Geocoding Catalog",
      description: "Catalog for testing location name fallback geocoding",
      user: users.testUser,
    });
    testCatalogId = catalog.id;
  });

  it("should geocode venue names when lat/lon columns exist but are empty", async () => {
    // CSV where some rows have coordinates and some don't — venue name is always present
    const csvContent = `title,date,latitude,longitude,venue
Concert A,2024-06-01,50.937,6.960,Music Hall
Workshop B,2024-06-02,,,City Hall
Festival C,2024-06-03,,,Market Square
`;

    await withDataset(testEnv, testCatalogId, {
      name: "geocode-fallback-test.csv",
      language: "eng",
      schemaConfig: { locked: false, autoGrow: true, autoApproveNonBreaking: true },
    });

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "geocode-fallback-test.csv",
      mimeType: "text/csv",
      user: testUserId,
      additionalData: { originalName: "geocode-fallback-test.csv" },
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(
      payload,
      ingestFile.id,
      (ingestJob) => ingestJob.stage === "failed" || ingestJob.stage === "completed",
      { maxIterations: 50 }
    );

    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });

    expect(importJobs.docs).toHaveLength(1);
    const ingestJob = importJobs.docs[0];
    expect(ingestJob.stage).toBe("completed");

    // Geocoding results should contain the 2 venue names that were geocoded
    expect(ingestJob.geocodingResults).toBeDefined();
    const geocodedKeys = Object.keys(ingestJob.geocodingResults);
    expect(geocodedKeys.length).toBeGreaterThanOrEqual(2);

    // All 3 events should have coordinates
    const events = await payload.find({
      collection: "events",
      where: { ingestJob: { equals: ingestJob.id } },
      sort: "eventTimestamp",
    });
    expect(events.docs).toHaveLength(3);

    // Concert A: source-data coordinates (from CSV lat/lon)
    const concertA = events.docs.find((e: any) => e.transformedData?.title === "Concert A");
    expect(concertA?.location?.latitude).toBeCloseTo(50.937, 2);
    expect(concertA?.coordinateSource?.type).toBe("source-data");

    // Workshop B: geocoded from venue name "City Hall"
    const workshopB = events.docs.find((e: any) => e.transformedData?.title === "Workshop B");
    expect(workshopB?.location?.latitude).toBeCloseTo(50.94, 1);
    expect(workshopB?.coordinateSource?.type).toBe("geocoded");

    // Festival C: geocoded from venue name "Market Square"
    const festivalC = events.docs.find((e: any) => e.transformedData?.title === "Festival C");
    expect(festivalC?.location?.latitude).toBeCloseTo(50.93, 1);
    expect(festivalC?.coordinateSource?.type).toBe("geocoded");
  });
});
