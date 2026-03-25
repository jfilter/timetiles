/**
 * Integration tests for the manual-ingest workflow end-to-end.
 *
 * Verifies the full pipeline from file upload through dataset-detection,
 * schema processing, geocoding, and event creation — all driven by the
 * Payload CMS workflow system rather than hook-based stage transitions.
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
 * does not queue a standalone dataset-detection task. This lets us test the
 * manual-ingest workflow in isolation.
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
    name: options?.filename ?? `wf-test-${Date.now()}.csv`,
    size: fileBuffer.length,
  };

  const data: Record<string, any> = { status: "pending", catalog: catalogId, user: user.id };

  // If a dataset is specified, set metadata so dataset-detection uses it
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
 * Run jobs in a loop until the ingest file reaches a terminal state.
 * Uses manual loop instead of runJobsUntilImportSettled to handle
 * workflow-based pipelines that may need multiple runs.
 */
const runUntilSettled = async (payload: any, ingestFileId: string | number, maxIterations = 80) => {
  for (let i = 0; i < maxIterations; i++) {
    await payload.jobs.run({ allQueues: true, limit: 100 });

    const ingestFile = await payload.findByID({ collection: "ingest-files", id: ingestFileId });
    if (ingestFile.status === "completed" || ingestFile.status === "failed") {
      return { settled: true, iterations: i + 1, ingestFile };
    }

    // Check if all workflow jobs have completed or errored
    const pendingJobs = await payload.find({
      collection: "payload-jobs",
      where: { completedAt: { exists: false }, hasError: { equals: false } },
    });
    // If no pending jobs and file isn't settled, check ingest-jobs
    if (pendingJobs.docs.length === 0) {
      const ingestJobs = await payload.find({
        collection: "ingest-jobs",
        where: { ingestFile: { equals: ingestFileId } },
      });
      const allDone = ingestJobs.docs.every((j: any) => j.stage === "completed" || j.stage === "failed");
      if (allDone && ingestJobs.docs.length > 0) {
        // Pipeline done but file status not updated; force refresh
        const finalFile = await payload.findByID({ collection: "ingest-files", id: ingestFileId });
        return { settled: true, iterations: i + 1, ingestFile: finalFile };
      }
    }
  }

  const ingestFile = await payload.findByID({ collection: "ingest-files", id: ingestFileId });
  return { settled: false, iterations: maxIterations, ingestFile };
};

describe.sequential("Manual Ingest Workflow (Integration)", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testUser: any;
  let testCatalogId: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, {
      owner: { role: "admin", email: "wf-test-owner@test.local", password: TEST_CREDENTIALS.auth.admin },
    });
    testUser = users.owner;

    const { catalog } = await withCatalog(testEnv, {
      name: "Workflow Test Catalog",
      description: "Catalog for manual-ingest workflow tests",
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
    // Mock geocoding so tests don't require external services
    const mockGeocodingResult = {
      latitude: 52.52,
      longitude: 13.405,
      confidence: 0.9,
      normalizedAddress: "Berlin, Germany",
      provider: "mock",
      components: {},
      metadata: {},
    };

    vi.spyOn(geocodingModule, "createGeocodingService").mockReturnValue({
      geocode: vi.fn().mockResolvedValue(mockGeocodingResult),
      batchGeocode: vi.fn().mockImplementation((addresses: string[]) => {
        const results = new Map();
        for (const addr of addresses) {
          results.set(addr, mockGeocodingResult);
        }
        return Promise.resolve({
          results,
          summary: { total: addresses.length, successful: addresses.length, failed: 0, cached: 0 },
        });
      }),
      testConfiguration: vi.fn().mockResolvedValue({}),
    } as unknown as geocodingModule.GeocodingService);

    await testEnv.seedManager.truncate(IMPORT_PIPELINE_COLLECTIONS_TO_RESET);
  });

  // ── 1. Happy path: CSV upload -> manual-ingest workflow -> events created ──

  it("should process CSV through full manual-ingest workflow pipeline", async () => {
    const csvContent = `title,date,location
"Berlin Conference","2024-06-15","Berlin"
"Munich Meetup","2024-07-20","Munich"
"Hamburg Workshop","2024-08-10","Hamburg"`;

    const ingestFile = await createIngestFileForWorkflow(payload, testCatalogId, csvContent, testUser);

    // Queue manual-ingest workflow (not the standalone task)
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(ingestFile.id) } });

    // Run jobs until the ingest file reaches a terminal state
    const result = await runUntilSettled(payload, ingestFile.id);

    expect(result.settled).toBe(true);
    expect(result.ingestFile.status).toBe("completed");

    // Verify ingest jobs were created and completed
    const ingestJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });

    expect(ingestJobs.docs).toHaveLength(1);
    expect(ingestJobs.docs[0].stage).toBe(PROCESSING_STAGE.COMPLETED);

    // Verify events were created (scoped to this ingest job's dataset)
    const ingestJobDoc = ingestJobs.docs[0];
    const datasetId = typeof ingestJobDoc.dataset === "object" ? ingestJobDoc.dataset.id : ingestJobDoc.dataset;
    const events = await payload.find({ collection: "events", where: { dataset: { equals: datasetId } }, limit: 10 });

    expect(events.docs).toHaveLength(3);

    // Verify event data is correct
    const eventTitles = events.docs.map((e: any) => e.transformedData?.title);
    expect(eventTitles).toContain("Berlin Conference");
    expect(eventTitles).toContain("Munich Meetup");
    expect(eventTitles).toContain("Hamburg Workshop");
  });

  // ── 2. Schema drift -> NEEDS_REVIEW -> ingest-process -> completed ──

  it("should pause at NEEDS_REVIEW for schema drift and resume after approval", async () => {
    // Create a dataset with an existing published schema version and locked config
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      schemaConfig: { locked: true, autoGrow: false, autoApproveNonBreaking: false },
    });

    // Create a published schema version for the dataset
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

    // Update dataset to point to the published schema
    const schemas = await payload.find({ collection: "dataset-schemas", where: { dataset: { equals: dataset.id } } });
    await payload.update({ collection: "datasets", id: dataset.id, data: { currentSchema: schemas.docs[0].id } });

    // CSV with a new column (schema drift)
    const csvContent = `title,date,location,category
"Drift Event 1","2024-01-01","Berlin","tech"
"Drift Event 2","2024-01-02","Munich","science"`;

    // Pass datasetId so dataset-detection links to the locked dataset
    const ingestFile = await createIngestFileForWorkflow(payload, testCatalogId, csvContent, testUser, {
      datasetId: dataset.id,
    });

    // Queue manual-ingest workflow
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(ingestFile.id) } });

    // Run jobs until the ingest job reaches NEEDS_REVIEW
    // The workflow will pause when validate-schema returns success: false (requiresApproval)
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

    // Approve the schema — the afterChange hook will queue ingest-process workflow
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

    // Run remaining jobs (ingest-process workflow: create-schema-version -> geocode -> create-events)
    const finalResult = await runUntilSettled(payload, ingestFile.id, 80);

    expect(finalResult.settled).toBe(true);
    expect(finalResult.ingestFile.status).toBe("completed");

    // Verify the ingest job completed
    const completedJob = await payload.findByID({ collection: "ingest-jobs", id: ingestJobId });
    expect(completedJob.stage).toBe(PROCESSING_STAGE.COMPLETED);

    // Verify events were created (scoped to this test's dataset)
    const events = await payload.find({ collection: "events", where: { dataset: { equals: dataset.id } }, limit: 10 });
    expect(events.docs.length).toBeGreaterThanOrEqual(2);
  }, 60000);

  // ── 3. Empty file -> detection fails cleanly ──

  it("should fail cleanly when processing an empty CSV file", async () => {
    // An empty CSV with just headers and no data rows
    const emptyCsvContent = "";

    const ingestFile = await createIngestFileForWorkflow(payload, testCatalogId, emptyCsvContent, testUser, {
      filename: "empty-file.csv",
    });

    // Queue manual-ingest workflow
    await payload.jobs.queue({ workflow: "manual-ingest", input: { ingestFileId: String(ingestFile.id) } });

    // Run jobs — should settle quickly as detection fails
    const result = await runUntilSettled(payload, ingestFile.id, 30);

    expect(result.settled).toBe(true);
    expect(result.ingestFile.status).toBe("failed");

    // No ingest jobs should have been created (detection failed before creating them)
    const ingestJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });
    expect(ingestJobs.docs).toHaveLength(0);
  });
});
