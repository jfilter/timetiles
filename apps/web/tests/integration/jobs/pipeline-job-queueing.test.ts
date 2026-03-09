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
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  runJobsUntilImportJobStage,
  withCatalog,
  withDataset,
  withImportFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Import Pipeline - Job Queueing", () => {
  const collectionsToReset = [...IMPORT_PIPELINE_COLLECTIONS_TO_RESET];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let uploadUserId: string | number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;

    const { catalog } = await withCatalog(testEnv, {
      name: "Test Catalog",
      description: "Catalog for testing pipeline job queueing",
    });
    testCatalogId = catalog.id;

    const { users } = await withUsers(testEnv, {
      uploader: { role: "user" },
    });
    uploadUserId = users.uploader.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(collectionsToReset);
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
      user: uploadUserId,
      additionalData: {
        originalName: "pipeline-test.csv", // Match dataset name
      },
    });

    // Track stages the import-job goes through
    const stagesReached: string[] = [];

    const recordStage = (stage: string) => {
      if (!stagesReached.includes(stage)) {
        stagesReached.push(stage);
      }
    };

    const stageResult = await runJobsUntilImportJobStage(
      payload,
      importFile.id,
      (importJob) =>
        importJob.stage === "geocode-batch" || importJob.stage === "processing" || importJob.stage === "completed",
      {
        maxIterations: 20,
        onPending: ({ importJob }) => {
          if (importJob != null) {
            recordStage(importJob.stage);
          }
        },
      }
    );

    if (stageResult.importJob != null) {
      recordStage(stageResult.importJob.stage);
    }

    // Verify the pipeline progressed through all expected stages
    expect(stagesReached).toContain("analyze-duplicates");
    expect(stagesReached).toContain("detect-schema");
    expect(stagesReached).toContain("validate-schema");
    expect(stagesReached).toContain("geocode-batch");
  });
});
