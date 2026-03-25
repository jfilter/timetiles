// @vitest-environment node
/**
 * Integration tests for the schema drift guard in the validate-schema job.
 *
 * Verifies that when one import pauses for NEEDS_REVIEW due to schema changes,
 * a second concurrent import to the same dataset is detected as conflicting.
 * This prevents schema drift when multiple imports run concurrently.
 *
 * Tests import `hasConflictingReviewJob` directly from validation-persistence
 * and run it against real Payload collections.
 *
 * Tests use unique datasets and ingest files per test, so no truncation is needed.
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { hasConflictingReviewJob } from "@/lib/jobs/handlers/validate-schema/validation-persistence";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Schema Drift Guard - Concurrent Review Detection", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  let testUser: any;
  let testCatalogId: number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { uploader: { role: "user" } });
    testUser = users.uploader;

    const { catalog } = await withCatalog(testEnv, { user: testUser });
    testCatalogId = catalog.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  /** Helper to create a fresh ingest file for this test. */
  const createIngestFile = async () => {
    const csvContent = "title,date\nEvent 1,2024-01-01";
    const { ingestFile } = await withIngestFile(testEnv, testCatalogId, csvContent, {
      status: "completed",
      user: testUser.id,
    });
    return ingestFile;
  };

  it("should detect a conflicting NEEDS_REVIEW job on the same dataset", async () => {
    const { dataset } = await withDataset(testEnv, testCatalogId);

    const ingestFile1 = await createIngestFile();
    const ingestFile2 = await createIngestFile();

    // Create ingest-job #1 in NEEDS_REVIEW state (simulating a paused import)
    const job1 = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile1.id, dataset: dataset.id, stage: PROCESSING_STAGE.NEEDS_REVIEW, sheetIndex: 0 },
      overrideAccess: true,
    });

    // Create ingest-job #2 for the same dataset (the concurrent import)
    const job2 = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile2.id, dataset: dataset.id, stage: PROCESSING_STAGE.VALIDATE_SCHEMA, sheetIndex: 0 },
      overrideAccess: true,
    });

    // Check from job2's perspective: job1 should be detected as conflicting
    const result = await hasConflictingReviewJob(payload, dataset.id, job2.id);

    expect(result.conflicting).toBe(true);
    expect(result.conflictingJobId).toBe(job1.id);
  });

  it("should not flag a conflict when no other job is in NEEDS_REVIEW", async () => {
    const { dataset } = await withDataset(testEnv, testCatalogId);

    const ingestFile = await createIngestFile();

    // Create a single ingest-job NOT in NEEDS_REVIEW
    const job = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile.id, dataset: dataset.id, stage: PROCESSING_STAGE.VALIDATE_SCHEMA, sheetIndex: 0 },
      overrideAccess: true,
    });

    const result = await hasConflictingReviewJob(payload, dataset.id, job.id);

    expect(result.conflicting).toBe(false);
    expect(result.conflictingJobId).toBeUndefined();
  });

  it("should not flag a job as conflicting with itself", async () => {
    const { dataset } = await withDataset(testEnv, testCatalogId);

    const ingestFile = await createIngestFile();

    // Create a single ingest-job in NEEDS_REVIEW
    const job = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile.id, dataset: dataset.id, stage: PROCESSING_STAGE.NEEDS_REVIEW, sheetIndex: 0 },
      overrideAccess: true,
    });

    // Check from the same job's perspective — should NOT conflict with itself
    const result = await hasConflictingReviewJob(payload, dataset.id, job.id);

    expect(result.conflicting).toBe(false);
    expect(result.conflictingJobId).toBeUndefined();
  });

  it("should not flag a conflict when the NEEDS_REVIEW job is on a different dataset", async () => {
    const { dataset: dataset1 } = await withDataset(testEnv, testCatalogId, { name: "Drift Guard Dataset A" });
    const { dataset: dataset2 } = await withDataset(testEnv, testCatalogId, { name: "Drift Guard Dataset B" });

    const ingestFile1 = await createIngestFile();
    const ingestFile2 = await createIngestFile();

    // Create a NEEDS_REVIEW job on dataset1
    await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile1.id, dataset: dataset1.id, stage: PROCESSING_STAGE.NEEDS_REVIEW, sheetIndex: 0 },
      overrideAccess: true,
    });

    // Create a job on dataset2
    const job2 = await payload.create({
      collection: "ingest-jobs",
      data: {
        ingestFile: ingestFile2.id,
        dataset: dataset2.id,
        stage: PROCESSING_STAGE.VALIDATE_SCHEMA,
        sheetIndex: 0,
      },
      overrideAccess: true,
    });

    // Check from job2's perspective on dataset2 — should NOT find the dataset1 NEEDS_REVIEW job
    const result = await hasConflictingReviewJob(payload, dataset2.id, job2.id);

    expect(result.conflicting).toBe(false);
    expect(result.conflictingJobId).toBeUndefined();
  });

  it("should detect conflict even when multiple jobs exist in various stages", async () => {
    const { dataset } = await withDataset(testEnv, testCatalogId);

    const ingestFile1 = await createIngestFile();
    const ingestFile2 = await createIngestFile();
    const ingestFile3 = await createIngestFile();

    // Job 1: COMPLETED (should not conflict)
    await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile1.id, dataset: dataset.id, stage: PROCESSING_STAGE.COMPLETED, sheetIndex: 0 },
      overrideAccess: true,
    });

    // Job 2: NEEDS_REVIEW (should conflict)
    const reviewJob = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile2.id, dataset: dataset.id, stage: PROCESSING_STAGE.NEEDS_REVIEW, sheetIndex: 0 },
      overrideAccess: true,
    });

    // Job 3: the new concurrent import checking for conflicts
    const newJob = await payload.create({
      collection: "ingest-jobs",
      data: { ingestFile: ingestFile3.id, dataset: dataset.id, stage: PROCESSING_STAGE.VALIDATE_SCHEMA, sheetIndex: 0 },
      overrideAccess: true,
    });

    const result = await hasConflictingReviewJob(payload, dataset.id, newJob.id);

    expect(result.conflicting).toBe(true);
    expect(result.conflictingJobId).toBe(reviewJob.id);
  });
});
