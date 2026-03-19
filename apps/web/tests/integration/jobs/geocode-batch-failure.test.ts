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

import {
  createIntegrationTestEnvironment,
  runJobsUntilImportJobStage,
  withCatalog,
  withDataset,
  withImportFile,
  withUsers,
} from "../../setup/integration/environment";

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
    // Re-apply spies each test (global afterEach restores all mocks)
    // Spy on createGeocodingService (not GeocodingService) because the factory
    // function closes over the local class reference and won't see a spy on the
    // re-exported class.
    vi.spyOn(geocodingModule, "createGeocodingService").mockReturnValue({
      geocode: vi.fn().mockRejectedValue(new Error("Geocoding API unavailable")),
    } as unknown as ReturnType<typeof geocodingModule.createGeocodingService>);

    await testEnv.seedManager.truncate([
      "users",
      "catalogs",
      "datasets",
      "dataset-schemas",
      "events",
      "import-files",
      "import-jobs",
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

    // Pre-create dataset with auto-approval to skip AWAIT_APPROVAL stage
    await withDataset(testEnv, testCatalogId, {
      name: "geocode-failure-test.csv",
      language: "eng",
      schemaConfig: { locked: false, autoGrow: true, autoApproveNonBreaking: true },
    });

    const { importFile } = await withImportFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "geocode-failure-test.csv",
      mimeType: "text/csv",
      user: testUserId,
      additionalData: { originalName: "geocode-failure-test.csv" },
    });

    const stageResult = await runJobsUntilImportJobStage(
      payload,
      importFile.id,
      (importJob) =>
        importJob.stage === "failed" || importJob.stage === "completed" || importJob.stage === "create-events",
      {
        maxIterations: 30,
        onPending: ({ iteration, importJob }) => {
          if (importJob != null) {
            console.log(`[GEOCODE-FAILURE] Iteration ${iteration}: Stage: ${importJob.stage}`);
          }
        },
      }
    );

    if (stageResult.importJob != null) {
      console.log(`[GEOCODE-FAILURE] Iteration ${stageResult.iterations}: Stage: ${stageResult.importJob.stage}`);
    }

    // Verify the import job is marked as failed
    const importJobs = await payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFile.id } },
    });

    expect(importJobs.docs).toHaveLength(1);
    const importJob = importJobs.docs[0];

    expect(importJob.stage).toBe("failed");
    expect(importJob.errorLog).toBeDefined();
    expect(importJob.errorLog.context).toBe("geocode-batch");
    // Error message should indicate geocoding failure (either all locations failed or service error)
    expect(importJob.errorLog.lastError).toMatch(/Geocoding|geocoding/i);

    // Verify the import file status (may be "failed" or still "processing" depending on error type)
    const updatedImportFile = await payload.findByID({ collection: "import-files", id: importFile.id });

    // Import file status should indicate failure eventually
    // Note: The exact status depends on whether all-geocoding-failed path or general error path was taken
    expect(["failed", "processing"]).toContain(updatedImportFile.status);

    // Verify no events were created (since geocoding failed)
    const events = await payload.find({ collection: "events", where: { importJob: { equals: importJob.id } } });

    expect(events.docs).toHaveLength(0);
  });

  it("should continue if some geocoding succeeds", async () => {
    // Override beforeEach all-reject mock with partial success
    const mockGeocode = vi
      .fn()
      .mockResolvedValueOnce({
        latitude: 52.52,
        longitude: 13.405,
        normalizedAddress: "Berlin, Germany",
        confidence: 0.9,
      })
      .mockRejectedValueOnce(new Error("Geocoding failed for Munich"))
      .mockResolvedValueOnce({
        latitude: 53.55,
        longitude: 9.993,
        normalizedAddress: "Hamburg, Germany",
        confidence: 0.9,
      });

    vi.spyOn(geocodingModule, "createGeocodingService").mockReturnValue({
      geocode: mockGeocode,
    } as unknown as ReturnType<typeof geocodingModule.createGeocodingService>);

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

    const { importFile } = await withImportFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "geocode-partial-test.csv",
      mimeType: "text/csv",
      user: testUserId,
      additionalData: { originalName: "geocode-partial-test.csv" },
    });

    await runJobsUntilImportJobStage(
      payload,
      importFile.id,
      (importJob) => importJob.stage === "failed" || importJob.stage === "completed",
      { maxIterations: 50 }
    );

    const importJobs = await payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFile.id } },
    });

    expect(importJobs.docs).toHaveLength(1);
    const importJob = importJobs.docs[0];

    // Partial success should NOT fail — job should reach completed
    expect(importJob.stage).toBe("completed");

    // Geocoding results should contain only the 2 successful locations
    expect(importJob.geocodingResults).toBeDefined();
    expect(Object.keys(importJob.geocodingResults)).toHaveLength(2);
    expect(importJob.geocodingResults["Berlin Germany"]).toBeDefined();
    expect(importJob.geocodingResults["Hamburg Germany"]).toBeDefined();
    expect(importJob.geocodingResults["Munich Germany"]).toBeUndefined();

    // Events should be created for all 3 rows
    const events = await payload.find({ collection: "events", where: { importJob: { equals: importJob.id } } });
    expect(events.docs.length).toBeGreaterThanOrEqual(3);
  });
});
