/**
 * Integration tests for the full import pipeline with mocked geocoding.
 *
 * Verifies that a CSV with address data (not lat/lng) goes through the complete
 * import pipeline including geocoding and creates events with coordinates.
 * Geocoding providers are mocked to avoid external service calls.
 *
 * @module
 * @category Integration Tests
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderManager } from "../../../lib/services/geocoding/provider-manager";
import { resetProviderRateLimiter } from "../../../lib/services/geocoding/provider-rate-limiter";

const mockGeocode = vi.fn();

import {
  createIntegrationTestEnvironment,
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  runJobsUntilImportSettled,
  runJobsUntilIngestJobStage,
  withCatalog,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

/** Mock providers array shared between beforeAll and beforeEach */
const createMockProviders = () => [
  { name: "Mock Geocoder", geocoder: { geocode: mockGeocode } as any, priority: 1, enabled: true, rateLimit: 100 },
];

/** Apply the ProviderManager mock spy */
const applyProviderManagerSpy = () => {
  vi.spyOn(ProviderManager.prototype, "loadProviders").mockImplementation(function (this: any) {
    this.providers = createMockProviders();
    this.configureRateLimiter();
    return Promise.resolve(this.providers);
  });
};

/** Generate a mock geocode result for a given address with deterministic coordinates */
const mockGeocodeResult = (address: string, lat: number, lng: number) => [
  {
    latitude: lat,
    longitude: lng,
    formattedAddress: address,
    country: "Germany",
    countryCode: "DE",
    city: address,
    state: undefined,
    streetName: undefined,
    streetNumber: undefined,
    zipcode: undefined,
    extra: { confidence: 0.85 },
  },
];

describe.sequential("Full Pipeline with Geocoding", () => {
  const collectionsToReset = [...IMPORT_PIPELINE_COLLECTIONS_TO_RESET, "location-cache", "geocoding-providers"];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testUserId: string | number;

  const runJobsUntilComplete = async (ingestFileId: string | number, maxIterations = 100) => {
    const result = await runJobsUntilImportSettled(payload, ingestFileId, { maxIterations });
    return result.settled;
  };

  const waitForNeedsReview = async (ingestFileId: string | number) => {
    const result = await runJobsUntilIngestJobStage(
      payload,
      ingestFileId,
      (ingestJob) =>
        ingestJob.stage === "needs-review" || ingestJob.stage === "completed" || ingestJob.stage === "failed",
      { maxIterations: 30 }
    );
    expect(result.matched).toBe(true);
    return result.ingestJob;
  };

  const approveSchema = async (ingestJobId: string | number) => {
    const beforeJob = await payload.findByID({ collection: "ingest-jobs", id: ingestJobId });
    await payload.update({
      collection: "ingest-jobs",
      id: ingestJobId,
      data: {
        schemaValidation: {
          ...beforeJob.schemaValidation,
          approved: true,
          approvedBy: testUserId,
          approvedAt: new Date().toISOString(),
        },
      },
    });
  };

  beforeAll(async () => {
    applyProviderManagerSpy();

    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { pipelineUser: { role: "admin" } });
    testUserId = users.pipelineUser.id;

    const { catalog } = await withCatalog(testEnv, {
      name: "Full Pipeline Geocoding Test Catalog",
      description: "Testing full import pipeline with mocked geocoding",
      user: users.pipelineUser,
    });
    testCatalogId = catalog.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    resetProviderRateLimiter();
    applyProviderManagerSpy();

    // Drain lingering pipeline jobs before truncation to avoid deadlocks
    for (let i = 0; i < 5; i++) {
      try {
        const result = await payload.jobs.run({ limit: 50 });
        if (result.noJobsRemaining) break;
      } catch {
        break;
      }
    }

    await testEnv.seedManager.truncate(collectionsToReset);

    // Create a geocoding-providers record in the DB (the service checks the DB for providers)
    await payload.create({
      collection: "geocoding-providers",
      data: {
        name: "Mock Geocoder",
        type: "google",
        enabled: true,
        priority: 1,
        rateLimit: 100,
        apiKey: "test-api-key-for-mock-geocoding",
        tags: ["testing"],
      },
    });

    mockGeocode.mockReset();
  });

  it("should geocode address data and create events with coordinates", async () => {
    // Set up mock to return specific coordinates for each address
    const addressCoords: Record<string, [number, number]> = {
      "berlin, germany": [52.52, 13.405],
      "munich, germany": [48.1351, 11.582],
      "hamburg, germany": [53.5511, 9.9937],
    };

    mockGeocode.mockImplementation((address: string) => {
      const normalizedAddress = typeof address === "string" ? address.toLowerCase().trim() : String(address);
      const coords = addressCoords[normalizedAddress];
      if (coords) {
        return mockGeocodeResult(normalizedAddress, coords[0], coords[1]);
      }
      return mockGeocodeResult(normalizedAddress, 50.0, 10.0);
    });

    const csvContent = `id,title,date,location
1,Berlin Conference,2024-03-01,"Berlin, Germany"
2,Munich Workshop,2024-03-02,"Munich, Germany"
3,Hamburg Summit,2024-03-03,"Hamburg, Germany"`;

    const { ingestFile } = await withIngestFile(testEnv, testCatalogId, csvContent, {
      filename: "pipeline-geocoding-test.csv",
      mimeType: "text/csv",
      user: testUserId,
      triggerWorkflow: true,
    });

    // Run pipeline until NEEDS_REVIEW, then approve
    const ingestJob = await waitForNeedsReview(ingestFile.id);
    expect(ingestJob).toBeDefined();
    await approveSchema(ingestJob!.id);

    // Complete the rest of the pipeline (geocoding + event creation)
    const completed = await runJobsUntilComplete(ingestFile.id);
    expect(completed).toBe(true);

    // Verify the ingest file completed
    const completedFile = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });
    expect(completedFile.status).toBe("completed");

    // Get the dataset from the ingest job
    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    expect(importJobs.docs.length).toBeGreaterThan(0);

    const datasetId =
      typeof importJobs.docs[0].dataset === "object" ? importJobs.docs[0].dataset.id : importJobs.docs[0].dataset;

    // Verify events were created
    const events = await payload.find({ collection: "events", where: { dataset: { equals: datasetId } }, limit: 100 });
    expect(events.docs).toHaveLength(3);

    // Verify all events have geocoded coordinates
    for (const event of events.docs) {
      expect(event.location).toBeDefined();
      expect(event.location.latitude).toBeTypeOf("number");
      expect(event.location.longitude).toBeTypeOf("number");
      expect(event.coordinateSource.type).toBe("geocoded");
    }

    // Verify specific coordinates match our mock
    const berlinEvent = events.docs.find(
      (e: any) => e.transformedData?.title === "Berlin Conference" || e.transformedData?.location === "Berlin, Germany"
    );
    expect(berlinEvent).toBeDefined();
    expect(berlinEvent!.location.latitude).toBeCloseTo(52.52, 1);
    expect(berlinEvent!.location.longitude).toBeCloseTo(13.405, 1);

    const munichEvent = events.docs.find(
      (e: any) => e.transformedData?.title === "Munich Workshop" || e.transformedData?.location === "Munich, Germany"
    );
    expect(munichEvent).toBeDefined();
    expect(munichEvent!.location.latitude).toBeCloseTo(48.1351, 1);
    expect(munichEvent!.location.longitude).toBeCloseTo(11.582, 1);

    const hamburgEvent = events.docs.find(
      (e: any) => e.transformedData?.title === "Hamburg Summit" || e.transformedData?.location === "Hamburg, Germany"
    );
    expect(hamburgEvent).toBeDefined();
    expect(hamburgEvent!.location.latitude).toBeCloseTo(53.5511, 1);
    expect(hamburgEvent!.location.longitude).toBeCloseTo(9.9937, 1);

    // Verify geocoding was called for each unique location
    expect(mockGeocode).toHaveBeenCalledTimes(3);
  });

  it("should deduplicate geocoding calls for repeated locations", async () => {
    mockGeocode.mockImplementation((address: string) => {
      const normalizedAddress = typeof address === "string" ? address.toLowerCase().trim() : String(address);
      return mockGeocodeResult(normalizedAddress, 52.52, 13.405);
    });

    // CSV with duplicate locations: "Berlin" appears 3 times, "Munich" appears 2 times
    const csvContent = `id,title,date,location
1,Event A,2024-04-01,Berlin
2,Event B,2024-04-02,Berlin
3,Event C,2024-04-03,Berlin
4,Event D,2024-04-04,Munich
5,Event E,2024-04-05,Munich`;

    const { ingestFile } = await withIngestFile(testEnv, testCatalogId, csvContent, {
      filename: "dedup-geocoding-test.csv",
      mimeType: "text/csv",
      user: testUserId,
      triggerWorkflow: true,
    });

    const ingestJob = await waitForNeedsReview(ingestFile.id);
    expect(ingestJob).toBeDefined();
    await approveSchema(ingestJob!.id);

    const completed = await runJobsUntilComplete(ingestFile.id);
    expect(completed).toBe(true);

    // Verify only 2 geocoding calls (one per unique location, not 5)
    expect(mockGeocode).toHaveBeenCalledTimes(2);

    // Verify all 5 events were created
    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    const datasetId =
      typeof importJobs.docs[0].dataset === "object" ? importJobs.docs[0].dataset.id : importJobs.docs[0].dataset;

    const events = await payload.find({ collection: "events", where: { dataset: { equals: datasetId } }, limit: 100 });
    expect(events.docs).toHaveLength(5);

    // All events should have coordinates despite deduplication
    for (const event of events.docs) {
      expect(event.location).toBeDefined();
      expect(event.location.latitude).toBeTypeOf("number");
      expect(event.location.longitude).toBeTypeOf("number");
      expect(event.coordinateSource.type).toBe("geocoded");
    }

    // Verify location cache has 2 entries (one per unique location)
    const locationCache = await payload.find({ collection: "location-cache", limit: 100 });
    expect(locationCache.docs).toHaveLength(2);
  });

  it("should handle mixed geocoding results with some failures", async () => {
    mockGeocode.mockImplementation((address: string) => {
      const normalizedAddress = typeof address === "string" ? address.toLowerCase().trim() : String(address);

      // "good city" succeeds, "unknown place" returns empty results
      if (normalizedAddress.includes("good city")) {
        return mockGeocodeResult("Good City", 40.7128, -74.006);
      }
      if (normalizedAddress.includes("another city")) {
        return mockGeocodeResult("Another City", 34.0522, -118.2437);
      }
      // Return empty for unknown locations (geocoding failure)
      return [];
    });

    const csvContent = `id,title,date,location
1,Good Event 1,2024-05-01,Good City
2,Bad Event,2024-05-02,Unknown Place
3,Good Event 2,2024-05-03,Another City`;

    const { ingestFile } = await withIngestFile(testEnv, testCatalogId, csvContent, {
      filename: "mixed-geocoding-test.csv",
      mimeType: "text/csv",
      user: testUserId,
      triggerWorkflow: true,
    });

    const ingestJob = await waitForNeedsReview(ingestFile.id);
    expect(ingestJob).toBeDefined();
    await approveSchema(ingestJob!.id);

    const completed = await runJobsUntilComplete(ingestFile.id);
    expect(completed).toBe(true);

    // All 3 events should be created regardless of geocoding success
    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    const datasetId =
      typeof importJobs.docs[0].dataset === "object" ? importJobs.docs[0].dataset.id : importJobs.docs[0].dataset;

    const events = await payload.find({ collection: "events", where: { dataset: { equals: datasetId } }, limit: 100 });
    expect(events.docs).toHaveLength(3);

    // Events with successful geocoding should have coordinates
    const goodEvent1 = events.docs.find(
      (e: any) => e.transformedData?.title === "Good Event 1" || e.transformedData?.location === "Good City"
    );
    const goodEvent2 = events.docs.find(
      (e: any) => e.transformedData?.title === "Good Event 2" || e.transformedData?.location === "Another City"
    );

    expect(goodEvent1).toBeDefined();
    expect(goodEvent1!.location).toBeDefined();
    expect(goodEvent1!.location.latitude).toBeCloseTo(40.7128, 1);
    expect(goodEvent1!.location.longitude).toBeCloseTo(-74.006, 1);
    expect(goodEvent1!.coordinateSource.type).toBe("geocoded");

    expect(goodEvent2).toBeDefined();
    expect(goodEvent2!.location).toBeDefined();
    expect(goodEvent2!.location.latitude).toBeCloseTo(34.0522, 1);
    expect(goodEvent2!.location.longitude).toBeCloseTo(-118.2437, 1);
    expect(goodEvent2!.coordinateSource.type).toBe("geocoded");

    // The failed geocoding event should exist but without coordinates
    const badEvent = events.docs.find(
      (e: any) => e.transformedData?.title === "Bad Event" || e.transformedData?.location === "Unknown Place"
    );
    expect(badEvent).toBeDefined();
    // Failed geocoding: event has no location or coordinates are null
    if (badEvent!.location) {
      expect(badEvent!.location.latitude).toBeNull();
      expect(badEvent!.location.longitude).toBeNull();
    }
  }, 60000);
});
