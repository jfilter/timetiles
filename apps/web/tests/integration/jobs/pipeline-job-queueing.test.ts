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
  runJobsUntilImportJobStage,
  withCatalog,
  withDataset,
  withImportFile,
} from "../../setup/integration/environment";

describe.sequential("Import Pipeline - Job Queueing", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false });
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

    const recordStage = (stage: string, iteration: number) => {
      if (!stagesReached.includes(stage)) {
        stagesReached.push(stage);
        console.log(`[PIPELINE] Iteration ${iteration}: Reached stage: ${stage}`);
      }
    };

    const stageResult = await runJobsUntilImportJobStage(
      payload,
      importFile.id,
      (importJob) =>
        importJob.stage === "geocode-batch" || importJob.stage === "processing" || importJob.stage === "completed",
      {
        maxIterations: 20,
        onPending: ({ iteration, importJob }) => {
          if (importJob != null) {
            recordStage(importJob.stage, iteration);
          }
        },
      }
    );

    if (stageResult.importJob != null) {
      recordStage(stageResult.importJob.stage, stageResult.iterations);
      console.log(`[PIPELINE] Pipeline progressed to ${stageResult.importJob.stage}, stopping`);
    }

    console.log("[PIPELINE] Stages reached:", stagesReached);

    // Verify the pipeline progressed through all expected stages
    expect(stagesReached).toContain("analyze-duplicates");
    expect(stagesReached).toContain("detect-schema");
    expect(stagesReached).toContain("validate-schema");
    expect(stagesReached).toContain("geocode-batch");
  });
});
