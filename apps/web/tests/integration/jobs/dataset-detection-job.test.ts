/**
 * Integration tests for dataset-detection job.
 *
 * Tests that dataset-detection:
 * 1. Creates import-jobs for each sheet/dataset
 * 2. Queues the first processing job (analyze-duplicates) to start the pipeline
 * 3. Reuses existing datasets by name when originalName matches
 * 4. Creates new datasets when originalName is missing
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { extractRelationId } from "@/lib/utils/relation-id";

import {
  createIntegrationTestEnvironment,
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  withCatalog,
  withDataset,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Dataset Detection Job", () => {
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
      name: "Test Catalog",
      description: "Catalog for testing dataset detection",
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

  it("should queue analyze-duplicates job after creating import-job", async () => {
    // Create a simple CSV file
    const csvContent = "name,date\nEvent 1,2024-01-01\nEvent 2,2024-01-02\n";

    // Create import file using helper
    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "test.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      datasetsCount: 0,
      datasetsProcessed: 0,
    });

    // NOTE: The ingest-files collection afterChange hook automatically queues dataset-detection
    // So we just need to run the jobs, not queue manually

    // Run the dataset-detection job (automatically queued by ingest-files hook)
    await payload.jobs.run({ allQueues: true, limit: 10 });

    // Check that import-job was created
    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
    });

    expect(importJobs.docs).toHaveLength(1);
    const ingestJob = importJobs.docs[0];
    expect(ingestJob.stage).toBe("analyze-duplicates");

    // After dataset-detection, analyze-duplicates job should be queued
    const result2 = await payload.jobs.run({ allQueues: true, limit: 10 });

    // Verify analyze-duplicates job ran
    expect(Object.keys(result2.jobStatus).length).toBeGreaterThan(0);

    // Verify import-job progressed past analyze-duplicates stage
    const updatedJob = await payload.findByID({ collection: "ingest-jobs", id: ingestJob.id });

    expect(updatedJob.stage).not.toBe("analyze-duplicates");
    expect(updatedJob.stage).toBe("detect-schema"); // Should be at next stage
  });

  it("should reuse existing dataset with matching name instead of creating new one", async () => {
    const csvContent = "name,date\nEvent 1,2024-01-01\n";
    const filename = "test-reuse.csv";

    // Pre-create a dataset with specific language
    const { dataset: preCreatedDataset } = await withDataset(testEnv, testCatalogId, {
      name: filename, // Name must match for dataset-detection to find it
      language: "deu", // German
      schemaConfig: { locked: false, autoGrow: true },
    });

    // Create import file with matching originalName
    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename,
      mimeType: "text/csv",
      user: uploadUserId,
      additionalData: {
        originalName: filename, // KEY: This must be set for dataset-detection to match
      },
    });

    // Run dataset-detection job (automatically queued by ingest-files hook)
    await payload.jobs.run({ allQueues: true, limit: 10 });

    // Find the import-job created by dataset-detection
    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
      depth: 1,
    });

    expect(importJobs.docs).toHaveLength(1);
    const ingestJob = importJobs.docs[0];

    // Dataset-detection should reuse our pre-created dataset
    const datasetId = extractRelationId(ingestJob.dataset);
    expect(datasetId).toBe(preCreatedDataset.id);

    // Fetch the dataset to verify language is preserved
    const usedDataset = await payload.findByID({ collection: "datasets", id: datasetId });
    expect(usedDataset.language).toBe("deu");
  });

  it("should use wizard fast-path and skip file re-parsing", async () => {
    const csvContent = "name,date\nEvent 1,2024-01-01\n";

    // Pre-create a dataset that the wizard has already configured
    const { dataset: wizardDataset } = await withDataset(testEnv, testCatalogId, {
      name: "Wizard Events",
      language: "eng",
    });

    // Create import file with wizard metadata including datasetMapping
    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "wizard-test.csv",
      mimeType: "text/csv",
      user: uploadUserId,
      additionalData: {
        metadata: {
          source: "import-wizard",
          datasetMapping: { mappingType: "single", singleDataset: wizardDataset.id },
          wizardConfig: { sheetMappings: [{ sheetIndex: 0, newDatasetName: "Wizard Events" }], fieldMappings: [] },
        },
      },
    });

    // Run the dataset-detection job (automatically queued by ingest-files hook)
    await payload.jobs.run({ allQueues: true, limit: 10 });

    // Check that import-job was created pointing to the wizard's pre-created dataset
    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
      depth: 1,
    });

    expect(importJobs.docs).toHaveLength(1);
    const ingestJob = importJobs.docs[0];
    expect(ingestJob.stage).toBe("analyze-duplicates");

    // Should use the dataset the wizard configured, not auto-create a new one
    const datasetId = extractRelationId(ingestJob.dataset);
    expect(datasetId).toBe(wizardDataset.id);
  });

  it("should create new dataset when originalName is missing", async () => {
    const csvContent = "name,date\nEvent 1,2024-01-01\n";

    // Pre-create a dataset
    const { dataset: preCreatedDataset } = await withDataset(testEnv, testCatalogId, {
      name: "test.csv",
      language: "deu",
    });

    // Create import file WITHOUT originalName
    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), csvContent, {
      filename: "different-name.csv", // Different from dataset name
      mimeType: "text/csv",
      user: uploadUserId,
      // NO originalName set
    });

    // Run dataset-detection job (automatically queued by ingest-files hook)
    await payload.jobs.run({ allQueues: true, limit: 10 });

    // Find the import-job
    const importJobs = await payload.find({
      collection: "ingest-jobs",
      where: { ingestFile: { equals: ingestFile.id } },
      depth: 1,
    });

    const ingestJob = importJobs.docs[0];
    const datasetId = extractRelationId(ingestJob.dataset);

    // Creates a new dataset because originalName is null
    expect(datasetId).not.toBe(preCreatedDataset.id);

    const usedDataset = await payload.findByID({ collection: "datasets", id: datasetId });
    // New dataset has default language "eng"
    expect(usedDataset.language).toBe("eng");
  });
});
