/**
 * Integration test for dataset-detection job.
 *
 * This test verifies that dataset-detection:
 * 1. Creates import-jobs for each sheet/dataset
 * 2. QUEUES the first processing job (analyze-duplicates) to start the pipeline
 *
 * Bug discovered: dataset-detection creates import-jobs but doesn't queue any jobs,
 * leaving the import stuck at "analyze-duplicates" stage with no processing.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createIntegrationTestEnvironment, withCatalog, withImportFile } from "../../setup/integration/environment";

describe.sequential("Dataset Detection Job", () => {
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

    const { catalog } = await withCatalog(testEnv, {
      name: "Test Catalog",
      description: "Catalog for testing dataset detection",
    });
    testCatalogId = catalog.id;
  });

  it("should queue analyze-duplicates job after creating import-job", async () => {
    // Create a simple CSV file
    const csvContent = "name,date\nEvent 1,2024-01-01\nEvent 2,2024-01-02\n";

    // Create import file using helper
    const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), csvContent, {
      filename: "test.csv",
      mimeType: "text/csv",
      datasetsCount: 0,
      datasetsProcessed: 0,
    });

    // NOTE: The import-files collection afterChange hook automatically queues dataset-detection
    // So we just need to run the jobs, not queue manually

    // Run the dataset-detection job (automatically queued by import-files hook)
    const result1 = await payload.jobs.run({ allQueues: true, limit: 10 });
    console.log("First job run:", result1);

    // Check that import-job was created
    const importJobs = await payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFile.id } },
    });

    expect(importJobs.docs.length).toBe(1);
    const importJob = importJobs.docs[0];
    expect(importJob.stage).toBe("analyze-duplicates");

    // After dataset-detection, analyze-duplicates job should be queued
    const result2 = await payload.jobs.run({ allQueues: true, limit: 10 });
    console.log("Second job run (analyze-duplicates):", result2);

    // Verify analyze-duplicates job ran
    expect(Object.keys(result2.jobStatus).length).toBeGreaterThan(0);

    // Verify import-job progressed past analyze-duplicates stage
    const updatedJob = await payload.findByID({
      collection: "import-jobs",
      id: importJob.id,
    });

    expect(updatedJob.stage).not.toBe("analyze-duplicates");
    expect(updatedJob.stage).toBe("detect-schema"); // Should be at next stage
  });
});
