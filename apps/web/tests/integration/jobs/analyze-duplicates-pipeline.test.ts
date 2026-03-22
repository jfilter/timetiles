/**
 * Integration test for the analyze-duplicates pipeline step.
 *
 * Reproduces the E2E failure where analyze-duplicates job fails with hasError:true
 * and the import pipeline stalls.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createIntegrationTestEnvironment,
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  withCatalog,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Analyze Duplicates Pipeline", () => {
  const collectionsToReset = [...IMPORT_PIPELINE_COLLECTIONS_TO_RESET];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: number;
  let uploadUserId: number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { uploader: { role: "admin" } });
    uploadUserId = users.uploader.id;

    const { catalog } = await withCatalog(testEnv, { name: "Analyze Duplicates Test Catalog", user: users.uploader });
    testCatalogId = catalog.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(collectionsToReset);
  });

  it("should run the full pipeline without errors", { timeout: 30_000 }, async () => {
    // CSV matching the E2E test fixture (lat/lon, no location column)
    const csvContent =
      "title,description,date,latitude,longitude,category\n" +
      "Workshop on AI,Hands-on workshop,2025-06-01,52.5200,13.4050,technology\n" +
      "Jazz Night,Open-air jazz,2025-06-15,52.5280,13.4430,music\n" +
      "Food Festival,Street food,2025-07-01,52.5030,13.4290,food\n";

    // Create import file (triggers manual-ingest workflow via afterChange hook)
    const { ingestFile } = await withIngestFile(testEnv, testCatalogId, csvContent, {
      filename: "scheduled-events.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      datasetsCount: 0,
      datasetsProcessed: 0,
      triggerWorkflow: true,
    });

    // Run the workflow until completion (manual-ingest runs all stages)
    for (let i = 0; i < 20; i++) {
      const result = await payload.jobs.run({ allQueues: true, limit: 10 });
      if (result.noJobsRemaining) break;
    }

    // Check that import-job was created
    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    expect(importJobs.docs.length).toBeGreaterThanOrEqual(1);
    const importJobId = importJobs.docs[0].id;

    // Check the workflow job completed without errors
    const workflowJobs = await payload.find({
      collection: "payload-jobs",
      where: { workflowSlug: { equals: "manual-ingest" } },
      limit: 1,
      sort: "-createdAt",
    });

    if (workflowJobs.docs.length > 0) {
      const job = workflowJobs.docs[0];
      if (job.hasError) {
        console.error("manual-ingest workflow FAILED:", JSON.stringify(job.error, null, 2));
      }
      expect(job.hasError).toBeFalsy();
    }

    // Check import-job completed successfully (pipeline ran through analyze-duplicates and beyond)
    const updatedJob = await payload.findByID({ collection: "ingest-jobs", id: importJobId });
    expect(updatedJob.stage).toBe("completed");
  });
});
