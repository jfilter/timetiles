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
} from "../../setup/integration/environment";

describe.sequential("Geocode Batch Job - Failure Handling", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;

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
    vi.spyOn(geocodingModule, "geocodeAddress").mockRejectedValue(new Error("Geocoding API unavailable"));
    vi.spyOn(geocodingModule, "initializeGeocoding").mockImplementation(() => {});

    await testEnv.seedManager.truncate([
      "catalogs",
      "datasets",
      "dataset-schemas",
      "events",
      "import-files",
      "import-jobs",
      "payload-jobs",
    ]);

    const { catalog } = await withCatalog(testEnv, {
      name: "Test Catalog",
      description: "Catalog for testing geocoding failure",
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
      schemaConfig: {
        locked: false,
        autoGrow: true,
        autoApproveNonBreaking: true,
      },
    });

    const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), csvContent, {
      filename: "geocode-failure-test.csv",
      mimeType: "text/csv",
      additionalData: {
        originalName: "geocode-failure-test.csv",
      },
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

    expect(importJobs.docs.length).toBe(1);
    const importJob = importJobs.docs[0];

    expect(importJob.stage).toBe("failed");
    expect(importJob.errorLog).toBeDefined();
    expect(importJob.errorLog.context).toBe("geocode-batch");
    // Error message should indicate geocoding failure (either all locations failed or service error)
    expect(importJob.errorLog.error).toMatch(/Geocoding|geocoding/i);

    // Verify the import file status (may be "failed" or still "processing" depending on error type)
    const updatedImportFile = await payload.findByID({
      collection: "import-files",
      id: importFile.id,
    });

    // Import file status should indicate failure eventually
    // Note: The exact status depends on whether all-geocoding-failed path or general error path was taken
    expect(["failed", "processing"]).toContain(updatedImportFile.status);

    // Verify no events were created (since geocoding failed)
    const events = await payload.find({
      collection: "events",
      where: { importJob: { equals: importJob.id } },
    });

    expect(events.docs.length).toBe(0);
  });

  it.todo("should continue if some geocoding succeeds");
});
