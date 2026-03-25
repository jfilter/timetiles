/**
 * Integration tests for data quality review checks in the import pipeline.
 *
 * Tests that the pipeline correctly pauses at NEEDS_REVIEW when:
 * - No timestamp/date field is detected
 * - No location field is detected
 * - Both checks can be skipped via processingOptions.reviewChecks
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createIntegrationTestEnvironment,
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  runJobsUntilImportSettled,
  withCatalog,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Review Checks Pipeline", () => {
  const collectionsToReset = [...IMPORT_PIPELINE_COLLECTIONS_TO_RESET];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let uploadUserId: string | number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { uploader: { role: "user" } });
    uploadUserId = users.uploader.id;

    const { catalog } = await withCatalog(testEnv, {
      name: "Review Checks Test Catalog",
      description: "Catalog for testing review checks",
      user: users.uploader,
    });
    testCatalogId = catalog.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(collectionsToReset);
  });

  it("should pause at NEEDS_REVIEW when no timestamp field is detected", async () => {
    // CSV with name and location but NO date/timestamp column
    const csvContent = "name,location\nConference,Berlin\nWorkshop,Munich\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "no-timestamp.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
    });

    // Run until pipeline settles
    await runJobsUntilImportSettled(payload, ingestFile.id);

    // Check that the ingest-job paused at needs-review with the correct reason
    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });

    expect(jobs.docs).toHaveLength(1);
    const ingestJob = jobs.docs[0];
    expect(ingestJob.stage).toBe("needs-review");
    expect(ingestJob.reviewReason).toBe("no-timestamp");
    expect(ingestJob.reviewDetails).toBeDefined();
    expect(ingestJob.reviewDetails.message).toContain("timestamp");
  });

  it("should pause at NEEDS_REVIEW when no location field is detected", async () => {
    // CSV with name and date but NO location column
    const csvContent = "name,date\nConference,2024-06-15\nWorkshop,2024-07-20\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "no-location.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
    });

    await runJobsUntilImportSettled(payload, ingestFile.id);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });

    expect(jobs.docs).toHaveLength(1);
    const ingestJob = jobs.docs[0];
    expect(ingestJob.stage).toBe("needs-review");
    expect(ingestJob.reviewReason).toBe("no-location");
    expect(ingestJob.reviewDetails).toBeDefined();
    expect(ingestJob.reviewDetails.message).toContain("location");
  });

  it("should complete pipeline when both timestamp and location fields are present", async () => {
    // CSV with all required fields
    const csvContent = "name,date,location\nConference,2024-06-15,Berlin\nWorkshop,2024-07-20,Munich\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "complete-data.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
    });

    await runJobsUntilImportSettled(payload, ingestFile.id);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });

    expect(jobs.docs).toHaveLength(1);
    expect(jobs.docs[0].stage).toBe("completed");
  });

  it("should skip no-timestamp check when skipTimestampCheck is set", async () => {
    // CSV with NO timestamp — but review check is skipped
    const csvContent = "name,location\nConference,Berlin\nWorkshop,Munich\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "skip-timestamp-check.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
      additionalData: { processingOptions: { reviewChecks: { skipTimestampCheck: true } } },
    });

    await runJobsUntilImportSettled(payload, ingestFile.id);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });

    expect(jobs.docs).toHaveLength(1);
    const ingestJob = jobs.docs[0];
    // Should NOT be paused for no-timestamp — but will hit no-location next
    expect(ingestJob.reviewReason).not.toBe("no-timestamp");
  });

  it("should complete pipeline when both checks are skipped even without timestamp/location", async () => {
    // CSV with NO timestamp and NO location — but both checks skipped
    const csvContent = "name,description\nConference,A great event\nWorkshop,Learn something\n";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "skip-all-checks.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      triggerWorkflow: true,
      additionalData: { processingOptions: { reviewChecks: { skipTimestampCheck: true, skipLocationCheck: true } } },
    });

    await runJobsUntilImportSettled(payload, ingestFile.id);

    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });

    expect(jobs.docs).toHaveLength(1);
    expect(jobs.docs[0].stage).toBe("completed");
  });
});
