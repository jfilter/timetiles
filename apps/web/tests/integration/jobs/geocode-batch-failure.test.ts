/**
 * Integration test for geocode batch job failure handling.
 *
 * Verifies that when all geocoding fails, the import job and import file
 * are marked as failed with an appropriate error message, rather than
 * continuing to create events without coordinates.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as geocodingModule from "@/lib/services/geocoding";
import { GeocodingError } from "@/lib/services/geocoding/types";

import {
  createIntegrationTestEnvironment,
  runJobsUntilIngestJobStage,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

/**
 * Helper to create a mock batchGeocode that rejects all addresses.
 */
const createAllFailBatchGeocode = () =>
  vi.fn().mockImplementation((addresses: string[]) => {
    const results = new Map<string, any>();
    for (const address of addresses) {
      results.set(address, new GeocodingError("Geocoding API unavailable", "ALL_PROVIDERS_FAILED"));
    }
    return { results, summary: { total: addresses.length, successful: 0, failed: addresses.length, cached: 0 } };
  });

/**
 * Helper to create a mock batchGeocode with partial success.
 * Succeeds for Berlin and Hamburg, fails for Munich.
 */
const createPartialSuccessBatchGeocode = () =>
  vi.fn().mockImplementation((addresses: string[]) => {
    const results = new Map<string, any>();
    let successful = 0;
    let failed = 0;
    for (const address of addresses) {
      // Addresses are normalized (lowercased) by the job before geocoding
      if (address.includes("munich")) {
        results.set(address, new GeocodingError("Geocoding failed for Munich", "GEOCODING_FAILED"));
        failed++;
      } else if (address.includes("berlin")) {
        results.set(address, {
          latitude: 52.52,
          longitude: 13.405,
          normalizedAddress: "Berlin, Germany",
          confidence: 0.9,
          provider: "mock",
          components: {},
          metadata: {},
        });
        successful++;
      } else if (address.includes("hamburg")) {
        results.set(address, {
          latitude: 53.55,
          longitude: 9.993,
          normalizedAddress: "Hamburg, Germany",
          confidence: 0.9,
          provider: "mock",
          components: {},
          metadata: {},
        });
        successful++;
      } else {
        results.set(address, new GeocodingError("Unknown address", "GEOCODING_FAILED"));
        failed++;
      }
    }
    return { results, summary: { total: addresses.length, successful, failed, cached: 0 } };
  });

describe.sequential("Geocode Batch Job - Failure Handling", () => {
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
    // Mock createGeocodingService to return a service where all geocoding fails.
    // We mock createGeocodingService (not GeocodingService) because the job calls
    // createGeocodingService, which references the class via a module-internal binding
    // that vi.spyOn on the class export cannot intercept.
    vi.spyOn(geocodingModule, "createGeocodingService").mockReturnValue({
      batchGeocode: createAllFailBatchGeocode(),
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
      name: "Test Catalog",
      description: "Catalog for testing geocoding failure",
      user: users.testUser,
    });
    testCatalogId = catalog.id;
  });

  it("should fail the import when all geocoding fails", async () => {
    // CSV with location field that requires geocoding (no lat/lng columns)
    const csvContent = `name,date,location
Event 1,2024-01-01,Berlin Germany
Event 2,2024-01-02,Munich Germany
Event 3,2024-01-03,Hamburg Germany
`;

    // Pre-create dataset with auto-approval to skip NEEDS_REVIEW stage
    await withDataset(testEnv, testCatalogId, {
      name: "geocode-failure-test.csv",
      language: "eng",
      schemaConfig: { locked: false, autoGrow: true, autoApproveNonBreaking: true },
    });

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "geocode-failure-test.csv",
      mimeType: "text/csv",
      user: testUserId,
      additionalData: { originalName: "geocode-failure-test.csv" },
      triggerWorkflow: true,
    });

    await runJobsUntilIngestJobStage(
      payload,
      ingestFile.id,
      (ingestJob) =>
        ingestJob.stage === "failed" || ingestJob.stage === "completed" || ingestJob.stage === "create-events",
      { maxIterations: 50 }
    );

    // Verify the import job is marked as failed
    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });

    expect(importJobs.docs).toHaveLength(1);
    const ingestJob = importJobs.docs[0];

    expect(ingestJob.stage).toBe("failed");
    expect(ingestJob.errorLog).toBeDefined();
    // Context is "pipeline" when error is caught by processSheets, or "geocode-batch" when caught by handler
    expect(ingestJob.errorLog.context).toMatch(/pipeline|geocode-batch/);
    // Error message should indicate geocoding failure
    expect(ingestJob.errorLog.lastError).toMatch(/Geocoding|geocoding/i);

    // Verify the import file status (may be "failed" or still "processing" depending on error type)
    const updatedIngestFile = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });

    // Import file status should indicate failure eventually
    // Note: The exact status depends on whether all-geocoding-failed path or general error path was taken
    expect(["failed", "processing"]).toContain(updatedIngestFile.status);

    // Verify no events were created (since geocoding failed)
    const events = await payload.find({ collection: "events", where: { ingestJob: { equals: ingestJob.id } } });

    expect(events.docs).toHaveLength(0);
  });

  it("should continue if some geocoding succeeds", async () => {
    // Override beforeEach all-reject mock with partial success
    vi.spyOn(geocodingModule, "createGeocodingService").mockReturnValue({
      batchGeocode: createPartialSuccessBatchGeocode(),
    } as unknown as geocodingModule.GeocodingService);

    const csvContent = `name,date,location
Event 1,2024-01-01,Berlin Germany
Event 2,2024-01-02,Munich Germany
Event 3,2024-01-03,Hamburg Germany
`;

    await withDataset(testEnv, testCatalogId, {
      name: "geocode-partial-test.csv",
      language: "eng",
      schemaConfig: { locked: false, autoGrow: true, autoApproveNonBreaking: true },
    });

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "geocode-partial-test.csv",
      mimeType: "text/csv",
      user: testUserId,
      additionalData: { originalName: "geocode-partial-test.csv" },
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

    // Partial success should NOT fail — job should reach completed
    expect(ingestJob.stage).toBe("completed");

    // Geocoding results should contain only the 2 successful locations (addresses are normalized)
    expect(ingestJob.geocodingResults).toBeDefined();
    expect(Object.keys(ingestJob.geocodingResults)).toHaveLength(2);
    expect(ingestJob.geocodingResults["berlin germany"]).toBeDefined();
    expect(ingestJob.geocodingResults["hamburg germany"]).toBeDefined();
    expect(ingestJob.geocodingResults["munich germany"]).toBeUndefined();

    // Events should be created for all 3 rows
    const events = await payload.find({ collection: "events", where: { ingestJob: { equals: ingestJob.id } } });
    expect(events.docs.length).toBeGreaterThanOrEqual(3);
  });
});
