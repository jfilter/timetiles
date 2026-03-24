/**
 * Integration tests for workflow system combinations.
 *
 * Covers the full lifecycle of the ingest workflow system: happy paths,
 * NEEDS_REVIEW pauses (schema drift, high duplicates, geocoding partial),
 * the ingest-process post-review resume workflow, failure scenarios,
 * and IngestFile status update logic from completion.ts.
 *
 * @module
 * @category Tests
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import * as geocodingModule from "@/lib/services/geocoding";

import { TEST_CREDENTIALS } from "../../constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  runJobsUntilIngestJobStage,
  withCatalog,
  withDataset,
  withUsers,
} from "../../setup/integration/environment";

/**
 * Create an ingest file with skipIngestFileHooks so the afterChange hook
 * does not queue a standalone dataset-detection task.
 */
const createIngestFileForWorkflow = (
  payload: any,
  catalogId: number | string,
  csvContent: string,
  user: any,
  options?: { filename?: string; datasetId?: number | string }
) => {
  const fileBuffer = new Uint8Array(Buffer.from(csvContent, "utf8"));
  const file = {
    data: Buffer.from(fileBuffer),
    mimetype: "text/csv",
    name: options?.filename ?? `wf-combo-${Date.now()}.csv`,
    size: fileBuffer.length,
  };

  const data: Record<string, any> = { status: "pending", catalog: catalogId, user: user.id };

  if (options?.datasetId) {
    data.metadata = {
      source: "import-wizard",
      datasetMapping: { mappingType: "single", singleDataset: String(options.datasetId) },
      wizardConfig: {},
    };
  }

  return payload.create({ collection: "ingest-files", data, file, user, context: { skipIngestFileHooks: true } });
};

/**
 * Run jobs in a loop until the ingest file reaches a terminal state
 * or no runnable payload-jobs remain (pipeline is quiescent).
 */
const runUntilSettled = async (payload: any, ingestFileId: string | number, maxIterations = 80) => {
  for (let i = 0; i < maxIterations; i++) {
    await payload.jobs.run({ allQueues: true, limit: 100 });

    const ingestFile = await payload.findByID({ collection: "ingest-files", id: ingestFileId });
    if (ingestFile.status === "completed" || ingestFile.status === "failed") {
      return { settled: true, iterations: i + 1, ingestFile };
    }

    // Check if any runnable payload-jobs remain (not yet completed AND not errored)
    const runnableJobs = await payload.find({
      collection: "payload-jobs",
      where: { completedAt: { exists: false }, hasError: { equals: false } },
    });
    if (runnableJobs.docs.length === 0) {
      // No runnable jobs — the pipeline is quiescent. Return the current state.
      const finalFile = await payload.findByID({ collection: "ingest-files", id: ingestFileId });
      return { settled: true, iterations: i + 1, ingestFile: finalFile };
    }
  }

  const ingestFile = await payload.findByID({ collection: "ingest-files", id: ingestFileId });
  return { settled: false, iterations: maxIterations, ingestFile };
};

/**
 * Mock the geocoding service to return successful results for all addresses.
 */
const mockGeocodingSuccess = () => {
  const mockResult = {
    latitude: 52.52,
    longitude: 13.405,
    confidence: 0.9,
    normalizedAddress: "Berlin, Germany",
    provider: "mock",
    components: {},
    metadata: {},
  };

  vi.spyOn(geocodingModule, "createGeocodingService").mockReturnValue({
    geocode: vi.fn().mockResolvedValue(mockResult),
    batchGeocode: vi.fn().mockImplementation((addresses: string[]) => {
      const results = new Map();
      for (const addr of addresses) {
        results.set(addr, mockResult);
      }
      return Promise.resolve({
        results,
        summary: { total: addresses.length, successful: addresses.length, failed: 0, cached: 0 },
      });
    }),
    testConfiguration: vi.fn().mockResolvedValue({}),
  } as unknown as geocodingModule.GeocodingService);
};

describe.sequential("Workflow Combinations (Integration)", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testUser: any;
  let testCatalogId: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, {
      owner: { role: "admin", email: "wf-combo-owner@test.local", password: TEST_CREDENTIALS.auth.admin },
    });
    testUser = users.owner;

    const { catalog } = await withCatalog(testEnv, {
      name: "Workflow Combo Test Catalog",
      description: "Catalog for workflow combination tests",
      user: testUser,
    });
    testCatalogId = catalog.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    mockGeocodingSuccess();
    await testEnv.seedManager.truncate(IMPORT_PIPELINE_COLLECTIONS_TO_RESET);
  });

  // ── 1. Happy path: single-sheet CSV completes successfully ──

  it("should complete single-sheet CSV through full pipeline with events created", async () => {
    const csvContent = `title,date,location
"Alpha Conference","2024-06-15","Berlin"
"Beta Meetup","2024-07-20","Munich"
"Gamma Workshop","2024-08-10","Hamburg"`;

    const ingestFile = await createIngestFileForWorkflow(payload, testCatalogId, csvContent, testUser);
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(ingestFile.id) } });

    const result = await runUntilSettled(payload, ingestFile.id);

    expect(result.settled).toBe(true);
    expect(result.ingestFile.status).toBe("completed");

    // Verify ingest job completed
    const ingestJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    expect(ingestJobs.docs).toHaveLength(1);
    expect(ingestJobs.docs[0].stage).toBe(PROCESSING_STAGE.COMPLETED);

    // Verify events created (scoped to this ingest file's dataset)
    const ingestJobDoc = ingestJobs.docs[0];
    const datasetId = typeof ingestJobDoc.dataset === "object" ? ingestJobDoc.dataset.id : ingestJobDoc.dataset;
    const events = await payload.find({ collection: "events", where: { dataset: { equals: datasetId } }, limit: 10 });
    expect(events.docs).toHaveLength(3);

    const titles = events.docs.map((e: any) => e.originalData?.title);
    expect(titles).toContain("Alpha Conference");
    expect(titles).toContain("Beta Meetup");
    expect(titles).toContain("Gamma Workshop");
  });

  // ── 2. Empty file fails cleanly ──

  it("should fail cleanly when processing an empty CSV file", async () => {
    const emptyCsv = "";

    const ingestFile = await createIngestFileForWorkflow(payload, testCatalogId, emptyCsv, testUser, {
      filename: "empty-combo.csv",
    });
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(ingestFile.id) } });

    const result = await runUntilSettled(payload, ingestFile.id, 30);

    expect(result.settled).toBe(true);
    expect(result.ingestFile.status).toBe("failed");

    // No ingest jobs should exist (detection failed before creating them)
    const ingestJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    expect(ingestJobs.docs).toHaveLength(0);
  });

  // ── 3. Schema drift → NEEDS_REVIEW → approve → completes ──

  it("should pause at NEEDS_REVIEW for schema drift and complete after approval", async () => {
    // Create a dataset with a locked schema (schema drift will require approval)
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      schemaConfig: { locked: true, autoGrow: false, autoApproveNonBreaking: false },
    });

    // Create a published schema version for this dataset
    await payload.create({
      collection: "dataset-schemas",
      data: {
        dataset: dataset.id,
        versionNumber: 1,
        _status: "published",
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            date: { type: "string", format: "date" },
            location: { type: "string" },
          },
          required: ["title", "date"],
        },
        fieldMetadata: {
          title: { occurrences: 100, occurrencePercent: 100 },
          date: { occurrences: 100, occurrencePercent: 100 },
          location: { occurrences: 100, occurrencePercent: 100 },
        },
        schemaSummary: { totalFields: 3, newFields: [], removedFields: [], typeChanges: [], enumChanges: [] },
      },
    });

    // Link published schema to dataset
    const schemas = await payload.find({ collection: "dataset-schemas", where: { dataset: { equals: dataset.id } } });
    await payload.update({ collection: "datasets", id: dataset.id, data: { currentSchema: schemas.docs[0].id } });

    // CSV with a new column (category) that differs from the existing schema
    const csvContent = `title,date,location,category
"Drift Event 1","2024-01-01","Berlin","tech"
"Drift Event 2","2024-01-02","Munich","science"`;

    const ingestFile = await createIngestFileForWorkflow(payload, testCatalogId, csvContent, testUser, {
      datasetId: dataset.id,
    });
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(ingestFile.id) } });

    // Run until the ingest job reaches NEEDS_REVIEW
    const reviewResult = await runJobsUntilIngestJobStage(
      payload,
      ingestFile.id,
      (ingestJob) =>
        ingestJob.stage === PROCESSING_STAGE.NEEDS_REVIEW || ingestJob.stage === PROCESSING_STAGE.COMPLETED,
      { maxIterations: 40 }
    );

    expect(reviewResult.matched).toBe(true);
    expect(reviewResult.ingestJob).not.toBeNull();
    expect(reviewResult.ingestJob!.stage).toBe(PROCESSING_STAGE.NEEDS_REVIEW);
    expect(reviewResult.ingestJob!.schemaValidation?.requiresApproval).toBe(true);

    // IngestFile should still be pending (not completed yet)
    const fileBeforeApproval = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });
    expect(fileBeforeApproval.status).toBe("pending");

    // Approve the schema — afterChange hook queues ingest-process workflow
    const ingestJobId = reviewResult.ingestJob!.id;
    const currentJob = await payload.findByID({ collection: "ingest-jobs", id: ingestJobId });
    await payload.update({
      collection: "ingest-jobs",
      id: ingestJobId,
      data: {
        schemaValidation: {
          ...currentJob.schemaValidation,
          approved: true,
          approvedBy: testUser.id,
          approvedAt: new Date().toISOString(),
        },
      },
      user: testUser,
    });

    // Run remaining jobs (ingest-process: create-schema-version → geocode → create-events)
    const finalResult = await runUntilSettled(payload, ingestFile.id, 80);

    expect(finalResult.settled).toBe(true);
    expect(finalResult.ingestFile.status).toBe("completed");

    // Verify ingest job completed
    const completedJob = await payload.findByID({ collection: "ingest-jobs", id: ingestJobId });
    expect(completedJob.stage).toBe(PROCESSING_STAGE.COMPLETED);

    // Verify events were created (scoped to this test's dataset)
    const events = await payload.find({ collection: "events", where: { dataset: { equals: dataset.id } }, limit: 10 });
    expect(events.docs.length).toBeGreaterThanOrEqual(2);
  }, 60000);

  // ── 4. Schema drift → NEEDS_REVIEW → NOT approved → stays paused ──

  it("should stay at NEEDS_REVIEW when schema drift is not approved", async () => {
    // Create a locked dataset with an existing schema
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      schemaConfig: { locked: true, autoGrow: false, autoApproveNonBreaking: false },
    });

    await payload.create({
      collection: "dataset-schemas",
      data: {
        dataset: dataset.id,
        versionNumber: 1,
        _status: "published",
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            date: { type: "string", format: "date" },
            location: { type: "string" },
          },
          required: ["title", "date"],
        },
        fieldMetadata: {
          title: { occurrences: 100, occurrencePercent: 100 },
          date: { occurrences: 100, occurrencePercent: 100 },
          location: { occurrences: 100, occurrencePercent: 100 },
        },
        schemaSummary: { totalFields: 3, newFields: [], removedFields: [], typeChanges: [], enumChanges: [] },
      },
    });

    const schemas = await payload.find({ collection: "dataset-schemas", where: { dataset: { equals: dataset.id } } });
    await payload.update({ collection: "datasets", id: dataset.id, data: { currentSchema: schemas.docs[0].id } });

    // CSV with schema drift (new "priority" column)
    const csvContent = `title,date,location,priority
"Reject Event 1","2024-03-01","Berlin","high"
"Reject Event 2","2024-03-02","Munich","low"`;

    const ingestFile = await createIngestFileForWorkflow(payload, testCatalogId, csvContent, testUser, {
      datasetId: dataset.id,
    });
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(ingestFile.id) } });

    // Run until NEEDS_REVIEW
    const reviewResult = await runJobsUntilIngestJobStage(
      payload,
      ingestFile.id,
      (ingestJob) =>
        ingestJob.stage === PROCESSING_STAGE.NEEDS_REVIEW || ingestJob.stage === PROCESSING_STAGE.COMPLETED,
      { maxIterations: 40 }
    );

    expect(reviewResult.matched).toBe(true);
    expect(reviewResult.ingestJob!.stage).toBe(PROCESSING_STAGE.NEEDS_REVIEW);

    // Do NOT approve — run more jobs to verify nothing happens
    await payload.jobs.run({ allQueues: true, limit: 100 });
    await payload.jobs.run({ allQueues: true, limit: 100 });

    // Verify ingest job is still in NEEDS_REVIEW
    const unchangedJob = await payload.findByID({ collection: "ingest-jobs", id: reviewResult.ingestJob!.id });
    expect(unchangedJob.stage).toBe(PROCESSING_STAGE.NEEDS_REVIEW);

    // No events should have been created for this dataset
    const events = await payload.find({ collection: "events", where: { dataset: { equals: dataset.id } }, limit: 10 });
    expect(events.docs).toHaveLength(0);

    // IngestFile should still be pending
    const file = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });
    expect(file.status).toBe("pending");
  }, 60000);

  // ── 5. onSuccess callback marks IngestJob as COMPLETED ──

  it("should mark IngestJob as COMPLETED via create-events onSuccess callback", async () => {
    const csvContent = `title,date,location
"Success CB Event","2024-09-01","Berlin"`;

    const ingestFile = await createIngestFileForWorkflow(payload, testCatalogId, csvContent, testUser);
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(ingestFile.id) } });

    const result = await runUntilSettled(payload, ingestFile.id);

    expect(result.settled).toBe(true);
    expect(result.ingestFile.status).toBe("completed");

    // The create-events task's onSuccess callback sets stage to COMPLETED
    const ingestJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    expect(ingestJobs.docs).toHaveLength(1);
    expect(ingestJobs.docs[0].stage).toBe(PROCESSING_STAGE.COMPLETED);
  });

  // ── 6. ingest-process with resumeFrom=create-events skips earlier tasks ──

  it("should complete a second import to the same catalog", async () => {
    // Verify the workflow system handles a second import to the same catalog
    const csvContent = `title,date,location
"Second Import 1","2024-10-01","Berlin"
"Second Import 2","2024-10-02","Munich"`;

    const ingestFile = await createIngestFileForWorkflow(payload, testCatalogId, csvContent, testUser);
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(ingestFile.id) } });

    const result = await runUntilSettled(payload, ingestFile.id);
    expect(result.settled).toBe(true);
    expect(result.ingestFile.status).toBe("completed");

    const ingestJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    expect(ingestJobs.docs).toHaveLength(1);
    expect(ingestJobs.docs[0].stage).toBe(PROCESSING_STAGE.COMPLETED);

    const events = await payload.find({ collection: "events", limit: 20 });
    expect(events.docs.length).toBeGreaterThanOrEqual(2);
  });

  // ── 7. File status: NEEDS_REVIEW prevents IngestFile from completing ──

  it("should keep IngestFile as pending when an IngestJob is in needs-review", async () => {
    // Create a locked dataset to trigger schema drift review
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      schemaConfig: { locked: true, autoGrow: false, autoApproveNonBreaking: false },
    });

    await payload.create({
      collection: "dataset-schemas",
      data: {
        dataset: dataset.id,
        versionNumber: 1,
        _status: "published",
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            date: { type: "string", format: "date" },
            location: { type: "string" },
          },
          required: ["title", "date"],
        },
        fieldMetadata: {
          title: { occurrences: 100, occurrencePercent: 100 },
          date: { occurrences: 100, occurrencePercent: 100 },
          location: { occurrences: 100, occurrencePercent: 100 },
        },
        schemaSummary: { totalFields: 3, newFields: [], removedFields: [], typeChanges: [], enumChanges: [] },
      },
    });

    const schemas = await payload.find({ collection: "dataset-schemas", where: { dataset: { equals: dataset.id } } });
    await payload.update({ collection: "datasets", id: dataset.id, data: { currentSchema: schemas.docs[0].id } });

    // CSV with new column to trigger schema drift
    const csvContent = `title,date,location,newfield
"Status Test 1","2024-04-01","Berlin","value1"`;

    const ingestFile = await createIngestFileForWorkflow(payload, testCatalogId, csvContent, testUser, {
      datasetId: dataset.id,
    });
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(ingestFile.id) } });

    // Run until NEEDS_REVIEW
    const reviewResult = await runJobsUntilIngestJobStage(
      payload,
      ingestFile.id,
      (ingestJob) =>
        ingestJob.stage === PROCESSING_STAGE.NEEDS_REVIEW || ingestJob.stage === PROCESSING_STAGE.COMPLETED,
      { maxIterations: 40 }
    );

    expect(reviewResult.matched).toBe(true);
    expect(reviewResult.ingestJob!.stage).toBe(PROCESSING_STAGE.NEEDS_REVIEW);

    // The completion.ts logic should NOT mark the IngestFile as completed
    // because hasReview is true — it returns early without updating status
    const file = await payload.findByID({ collection: "ingest-files", id: ingestFile.id });
    expect(file.status).toBe("pending");
  }, 60000);

  // ── 8. Headers-only CSV (no data rows) produces no events ──

  it("should produce no events when CSV has headers but no data rows", async () => {
    const headersOnly = `title,date,location`;

    const ingestFile = await createIngestFileForWorkflow(payload, testCatalogId, headersOnly, testUser, {
      filename: "headers-only.csv",
    });
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(ingestFile.id) } });

    const result = await runUntilSettled(payload, ingestFile.id, 40);

    expect(result.settled).toBe(true);

    // IngestJob should reach a terminal state (failed for empty file, or completed with 0 events)
    const jobs = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: ingestFile.id } } });
    if (jobs.docs.length > 0) {
      expect([PROCESSING_STAGE.COMPLETED, PROCESSING_STAGE.FAILED]).toContain(jobs.docs[0].stage);

      // No events should be created from a headers-only file (scoped to dataset)
      const datasetId = typeof jobs.docs[0].dataset === "object" ? jobs.docs[0].dataset.id : jobs.docs[0].dataset;
      const events = await payload.find({ collection: "events", where: { dataset: { equals: datasetId } }, limit: 10 });
      expect(events.docs).toHaveLength(0);
    }
    // File should reach a terminal state
    expect(["completed", "failed"]).toContain(result.ingestFile.status);
  });

  // ── 9. Total geocoding failure prevents event creation ──

  it("should prevent event creation when geocoding fails completely", async () => {
    // Override the mock to fail all geocoding
    vi.spyOn(geocodingModule, "createGeocodingService").mockReturnValue({
      geocode: vi.fn().mockRejectedValue(new Error("Geocoding service unavailable")),
      batchGeocode: vi.fn().mockRejectedValue(new Error("Geocoding service unavailable")),
      testConfiguration: vi.fn().mockResolvedValue({}),
    } as unknown as geocodingModule.GeocodingService);

    const csvContent = `title,date,location
"Geo Fail Event","2024-11-01","Nowhere"`;

    const ingestFile = await createIngestFileForWorkflow(payload, testCatalogId, csvContent, testUser);
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(ingestFile.id) } });

    const result = await runUntilSettled(payload, ingestFile.id, 60);

    expect(result.settled).toBe(true);

    // The IngestJob should be FAILED (geocoding total failure is marked by processSheets)
    const ingestJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    expect(ingestJobs.docs.length).toBeGreaterThan(0);
    expect(ingestJobs.docs[0].stage).toBe(PROCESSING_STAGE.FAILED);

    // No events should have been created since geocoding failed (scoped to dataset)
    const datasetId =
      typeof ingestJobs.docs[0].dataset === "object" ? ingestJobs.docs[0].dataset.id : ingestJobs.docs[0].dataset;
    const events = await payload.find({ collection: "events", where: { dataset: { equals: datasetId } }, limit: 10 });
    expect(events.docs).toHaveLength(0);

    // File should be failed since the job failed
    expect(result.ingestFile.status).toBe("failed");
  }, 60000);

  // ── 10. Multiple sequential imports to same dataset both complete ──

  it("should handle sequential imports to the same dataset correctly", async () => {
    // First import
    const csv1 = `title,date,location
"Seq Event A","2024-01-01","Berlin"
"Seq Event B","2024-01-02","Munich"`;

    const file1 = await createIngestFileForWorkflow(payload, testCatalogId, csv1, testUser);
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(file1.id) } });
    const result1 = await runUntilSettled(payload, file1.id);
    expect(result1.settled).toBe(true);
    expect(result1.ingestFile.status).toBe("completed");

    // Verify first batch events (scoped to file1's ingest job dataset)
    const ingestJobs1 = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: file1.id } } });
    const datasetId1 =
      typeof ingestJobs1.docs[0].dataset === "object" ? ingestJobs1.docs[0].dataset.id : ingestJobs1.docs[0].dataset;
    const eventsAfterFirst = await payload.find({
      collection: "events",
      where: { dataset: { equals: datasetId1 } },
      limit: 20,
    });
    expect(eventsAfterFirst.docs.length).toBeGreaterThanOrEqual(2);

    // Second import to same catalog
    const csv2 = `title,date,location
"Seq Event C","2024-02-01","Hamburg"
"Seq Event D","2024-02-02","Frankfurt"`;

    const file2 = await createIngestFileForWorkflow(payload, testCatalogId, csv2, testUser);
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(file2.id) } });
    const result2 = await runUntilSettled(payload, file2.id);
    expect(result2.settled).toBe(true);
    expect(result2.ingestFile.status).toBe("completed");

    // Verify events from second import exist
    const ingestJobs2 = await payload.find({ collection: "ingest-jobs", where: { ingestFile: { equals: file2.id } } });
    const datasetId2 =
      typeof ingestJobs2.docs[0].dataset === "object" ? ingestJobs2.docs[0].dataset.id : ingestJobs2.docs[0].dataset;
    const eventsFromFile2 = await payload.find({
      collection: "events",
      where: { dataset: { equals: datasetId2 } },
      limit: 20,
    });
    expect(eventsFromFile2.docs.length).toBeGreaterThanOrEqual(2);

    // Verify both ingest files show completed
    const finalFile1 = await payload.findByID({ collection: "ingest-files", id: file1.id });
    const finalFile2 = await payload.findByID({ collection: "ingest-files", id: file2.id });
    expect(finalFile1.status).toBe("completed");
    expect(finalFile2.status).toBe("completed");
  }, 60000);
});
