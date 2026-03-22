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
  withImportFile,
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

  it("should run dataset-detection then analyze-duplicates without errors", { timeout: 30_000 }, async () => {
    // CSV matching the E2E test fixture (lat/lon, no location column)
    const csvContent =
      "title,description,date,latitude,longitude,category\n" +
      "Workshop on AI,Hands-on workshop,2025-06-01,52.5200,13.4050,technology\n" +
      "Jazz Night,Open-air jazz,2025-06-15,52.5280,13.4430,music\n" +
      "Food Festival,Street food,2025-07-01,52.5030,13.4290,food\n";

    // Create import file
    const { ingestFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
      filename: "scheduled-events.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      datasetsCount: 0,
      datasetsProcessed: 0,
    });

    // Step 1: Run dataset-detection (auto-queued by import-files afterChange hook)
    const result1 = await payload.jobs.run({ allQueues: true, limit: 10 });
    const jobCount1 = result1?.jobStatus ? Object.keys(result1.jobStatus).length : 0;
    console.log(`dataset-detection: ${jobCount1} jobs processed`);

    // Check that import-job was created
    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    expect(importJobs.docs.length).toBeGreaterThanOrEqual(1);
    const importJobId = importJobs.docs[0].id;

    // Check that analyze-duplicates was queued
    const pendingJobs = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "analyze-duplicates" }, completedAt: { exists: false } },
    });
    console.log(`analyze-duplicates pending: ${pendingJobs.docs.length}`);
    expect(pendingJobs.docs.length).toBe(1);

    // Step 2: Run analyze-duplicates
    const result2 = await payload.jobs.run({ allQueues: true, limit: 10 });
    const jobCount2 = result2?.jobStatus ? Object.keys(result2.jobStatus).length : 0;
    console.log(`analyze-duplicates: ${jobCount2} jobs processed`);

    // Check that it didn't fail
    const analyzeDupJob = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "analyze-duplicates" } },
      limit: 1,
      sort: "-createdAt",
    });

    if (analyzeDupJob.docs.length > 0) {
      const job = analyzeDupJob.docs[0];
      if (job.hasError) {
        console.error("analyze-duplicates FAILED:", JSON.stringify(job.error, null, 2));
      }
      expect(job.hasError).toBeFalsy();
    }

    // Check import-job progressed past analyze-duplicates
    const updatedJob = await payload.findByID({ collection: "ingest-jobs", id: importJobId });
    console.log(`Import job stage after analyze-duplicates: ${updatedJob.stage}`);
    // Should have moved to schema-detection or beyond
    expect(updatedJob.stage).not.toBe("ANALYZE_DUPLICATES");
  });
});
