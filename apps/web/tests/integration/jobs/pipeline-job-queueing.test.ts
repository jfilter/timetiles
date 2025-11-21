/**
 * Test that each job in the import pipeline queues the next job.
 *
 * Bug discovered: Jobs were transitioning stages but not queueing the next job,
 * causing the pipeline to halt. This test validates that each job correctly
 * queues the next job in the pipeline.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withImportFile,
} from "../../setup/integration/environment";

describe.sequential("Import Pipeline - Job Queueing", () => {
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
      description: "Catalog for testing pipeline job queueing",
    });
    testCatalogId = catalog.id;
  });

  it("should queue jobs through the entire pipeline: dataset-detection → analyze-duplicates → detect-schema → validate-schema → geocode-batch", async () => {
    const csvContent = "name,date,lat,lng\nEvent 1,2024-01-01,52.52,13.40\n";

    // Pre-create dataset with auto-approval settings to avoid AWAIT_APPROVAL stage
    await withDataset(testEnv, testCatalogId, {
      name: "pipeline-test.csv",
      language: "eng",
      schemaConfig: {
        locked: false,
        autoGrow: true,
        autoApproveNonBreaking: true, // Auto-approve to skip AWAIT_APPROVAL
      },
    });

    const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), csvContent, {
      filename: "pipeline-test.csv",
      mimeType: "text/csv",
      additionalData: {
        originalName: "pipeline-test.csv", // Match dataset name
      },
    });

    // Track stages the import-job goes through
    const stagesReached: string[] = [];

    // Run jobs and track pipeline progress
    for (let i = 0; i < 20; i++) {
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });

      if (importJobs.docs.length > 0) {
        const currentStage = importJobs.docs[0].stage;

        if (!stagesReached.includes(currentStage)) {
          stagesReached.push(currentStage);
          console.log(`[PIPELINE] Iteration ${i}: Reached stage: ${currentStage}`);
        }

        // Stop if we reached geocode-batch or later
        if (currentStage === "geocode-batch" || currentStage === "processing" || currentStage === "completed") {
          console.log(`[PIPELINE] Pipeline progressed to ${currentStage}, stopping`);
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("[PIPELINE] Stages reached:", stagesReached);

    // Verify the pipeline progressed through all expected stages
    expect(stagesReached).toContain("analyze-duplicates");
    expect(stagesReached).toContain("detect-schema");
    expect(stagesReached).toContain("validate-schema");
    expect(stagesReached).toContain("geocode-batch");
  });
});
