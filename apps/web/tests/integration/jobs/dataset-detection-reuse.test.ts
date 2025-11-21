/**
 * Test that dataset-detection reuses existing datasets by name.
 *
 * Bug hypothesis: When a dataset with the same name already exists,
 * dataset-detection should reuse it instead of creating a new one.
 * This is critical for multi-language support where we pre-create datasets
 * with specific language settings.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ImportJob } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withImportFile,
} from "../../setup/integration/environment";

describe.sequential("Dataset Detection - Dataset Reuse", () => {
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
      description: "Catalog for testing dataset reuse",
    });
    testCatalogId = catalog.id;
  });

  it("should reuse existing dataset with matching name instead of creating new one", async () => {
    const csvContent = "name,date\nEvent 1,2024-01-01\n";
    const filename = "test-reuse.csv";

    // Pre-create a dataset with specific language
    const { dataset: preCreatedDataset } = await withDataset(testEnv, testCatalogId, {
      name: filename, // Name must match for dataset-detection to find it
      language: "deu", // German
      schemaConfig: {
        locked: false,
        autoGrow: true,
      },
    });

    console.log("Pre-created dataset:", {
      id: preCreatedDataset.id,
      name: preCreatedDataset.name,
      language: preCreatedDataset.language,
    });

    // Create import file with matching originalName
    const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), csvContent, {
      filename,
      mimeType: "text/csv",
      additionalData: {
        originalName: filename, // KEY: This must be set for dataset-detection to match
      },
    });

    console.log("Import file:", {
      id: importFile.id,
      filename: importFile.filename,
      originalName: importFile.originalName,
    });

    // NOTE: The import-files collection afterChange hook automatically queues dataset-detection
    // So we just need to run the jobs, not queue manually

    // Run dataset-detection job (automatically queued by import-files hook)
    await payload.jobs.run({ allQueues: true, limit: 10 });

    // Check import file after dataset-detection
    const updatedImportFile = await payload.findByID({
      collection: "import-files",
      id: importFile.id,
    });

    console.log("Import file after dataset-detection:", {
      datasetsCount: updatedImportFile.datasetsCount,
      sheetMetadata: updatedImportFile.sheetMetadata,
    });

    // Find the import-job created by dataset-detection
    const importJobs = await payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFile.id } },
      depth: 1,
    });

    console.log("Import jobs found:", importJobs.docs.length);
    importJobs.docs.forEach((job: ImportJob, idx: number) => {
      console.log(`Job ${idx}:`, {
        id: job.id,
        stage: job.stage,
        datasetId: typeof job.dataset === "object" ? job.dataset.id : job.dataset,
        datasetName: typeof job.dataset === "object" ? job.dataset.name : "unknown",
      });
    });

    expect(importJobs.docs.length).toBe(1);
    const importJob = importJobs.docs[0];

    // THE BUG TEST: Dataset-detection should reuse our pre-created dataset
    const datasetId = typeof importJob.dataset === "object" ? importJob.dataset.id : importJob.dataset;

    console.log("Import job dataset ID:", datasetId);
    console.log("Pre-created dataset ID:", preCreatedDataset.id);

    // EXPECTED: Should reuse the pre-created dataset
    expect(datasetId).toBe(preCreatedDataset.id);

    // Fetch the dataset to verify language is preserved
    const usedDataset = await payload.findByID({
      collection: "datasets",
      id: datasetId,
    });

    console.log("Used dataset language:", usedDataset.language);

    // EXPECTED: Language should be "deu" from our pre-created dataset
    expect(usedDataset.language).toBe("deu");
  });

  it("should create new dataset when originalName is missing", async () => {
    const csvContent = "name,date\nEvent 1,2024-01-01\n";

    // Pre-create a dataset
    const { dataset: preCreatedDataset } = await withDataset(testEnv, testCatalogId, {
      name: "test.csv",
      language: "deu",
    });

    // Create import file WITHOUT originalName
    const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), csvContent, {
      filename: "different-name.csv", // Different from dataset name
      mimeType: "text/csv",
      // NO originalName set - this is the bug!
    });

    console.log("Import file originalName:", importFile.originalName);

    // Run dataset-detection job (automatically queued by import-files hook)
    await payload.jobs.run({ allQueues: true, limit: 10 });

    // Find the import-job
    const importJobs = await payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFile.id } },
      depth: 1,
    });

    const importJob = importJobs.docs[0];
    const datasetId = typeof importJob.dataset === "object" ? importJob.dataset.id : importJob.dataset;

    // ACTUAL BUG: Creates a new dataset because originalName is null
    expect(datasetId).not.toBe(preCreatedDataset.id); // Different dataset created

    const usedDataset = await payload.findByID({
      collection: "datasets",
      id: datasetId,
    });

    // ACTUAL BUG: New dataset has default language "eng"
    expect(usedDataset.language).toBe("eng"); // Not "deu"!
  });
});
