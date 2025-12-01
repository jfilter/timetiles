/**
 * Integration tests for schema detection edge cases.
 *
 * Tests the specific edge case where a file has exactly N * BATCH_SIZE rows,
 * causing the final batch to read 0 rows and trigger handleBatchCompletion.
 * This path must correctly run enum detection before finalizing.
 *
 * @module
 * @category Tests
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock BATCH_SIZES to use small values for testing
vi.mock("@/lib/constants/import-constants", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/constants/import-constants")>();
  return {
    ...original,
    BATCH_SIZES: {
      ...original.BATCH_SIZES,
      SCHEMA_DETECTION: 3, // Small batch size for edge case testing
      DUPLICATE_ANALYSIS: 3,
    },
  };
});

import { BATCH_SIZES } from "@/lib/constants/import-constants";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withImportFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Schema Detection - Edge Cases", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  let testCatalogId: number;
  let testDatasetId: number;

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
    await withUsers(testEnv, ["admin"]);

    const { catalog } = await withCatalog(testEnv, {
      name: "Edge Case Test Catalog",
      description: "Catalog for schema detection edge case tests",
    });
    testCatalogId = catalog.id;

    const { dataset } = await withDataset(testEnv, testCatalogId, {
      name: "edge-case-test.csv",
      language: "eng",
      schemaConfig: {
        locked: false,
        autoGrow: true,
        autoApproveNonBreaking: true,
      },
    });
    testDatasetId = dataset.id;
  });

  it("correctly detects enums when file has exactly BATCH_SIZE rows (0-row final batch)", async () => {
    // Verify our batch size override worked
    expect(BATCH_SIZES.SCHEMA_DETECTION).toBe(3);

    // Create CSV with exactly 3 rows (= BATCH_SIZE)
    // status field should be detected as enum (2 unique values in 3 occurrences)
    const csvContent = `name,date,status
Event 1,2024-01-01,active
Event 2,2024-01-02,pending
Event 3,2024-01-03,active`;

    const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
      filename: "edge-case-test.csv",
      mimeType: "text/csv",
      additionalData: { originalName: "edge-case-test.csv" },
    });

    // Run jobs until schema detection is complete
    for (let i = 0; i < 10; i++) {
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
        overrideAccess: true,
      });

      if (importJobs.docs.length > 0) {
        const stage = importJobs.docs[0].stage;
        // Stop when we've passed schema detection
        if (stage === "validate-schema" || stage === "await-approval" || stage === "geocode-batch") {
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Get the import job and check the schemaBuilderState
    const importJobs = await payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFile.id } },
      overrideAccess: true,
    });

    expect(importJobs.docs.length).toBe(1);
    const importJob = importJobs.docs[0];

    // Verify schemaBuilderState has enum detection results
    const schemaState = importJob.schemaBuilderState as Record<string, unknown> | null;
    expect(schemaState).toBeDefined();

    const fieldStats = schemaState?.fieldStats as Record<string, unknown> | undefined;
    expect(fieldStats).toBeDefined();

    // The 'status' field should be detected as an enum candidate
    // (2 unique values: 'active', 'pending' in 3 occurrences)
    const statusStats = fieldStats?.status as { isEnumCandidate?: boolean; uniqueValues?: number } | undefined;
    expect(statusStats).toBeDefined();
    expect(statusStats?.uniqueValues).toBe(2);
    expect(statusStats?.isEnumCandidate).toBe(true);
  });

  it("correctly saves state between batches and restores for final batch", async () => {
    // Verify our batch size override worked
    expect(BATCH_SIZES.SCHEMA_DETECTION).toBe(3);

    // Create CSV with exactly 6 rows (= 2 * BATCH_SIZE)
    // This ensures batch 1 (rows 0-2), batch 2 (rows 3-5), batch 3 (0 rows - edge case)
    const csvContent = `name,date,category
Event 1,2024-01-01,A
Event 2,2024-01-02,B
Event 3,2024-01-03,A
Event 4,2024-01-04,B
Event 5,2024-01-05,A
Event 6,2024-01-06,B`;

    const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
      filename: "edge-case-test.csv",
      mimeType: "text/csv",
      additionalData: { originalName: "edge-case-test.csv" },
    });

    // Run jobs until schema detection is complete
    for (let i = 0; i < 15; i++) {
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
        overrideAccess: true,
      });

      if (importJobs.docs.length > 0) {
        const stage = importJobs.docs[0].stage;
        if (stage === "validate-schema" || stage === "await-approval" || stage === "geocode-batch") {
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Get the import job
    const importJobs = await payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFile.id } },
      overrideAccess: true,
    });

    expect(importJobs.docs.length).toBe(1);
    const importJob = importJobs.docs[0];

    // Verify we processed all 6 rows
    const schemaState = importJob.schemaBuilderState as Record<string, unknown> | null;
    expect(schemaState).toBeDefined();
    expect(schemaState?.recordCount).toBe(6);

    const fieldStats = schemaState?.fieldStats as Record<string, unknown> | undefined;
    expect(fieldStats).toBeDefined();

    // The 'category' field should be detected as an enum candidate
    // (2 unique values: 'A', 'B' in 6 occurrences)
    const categoryStats = fieldStats?.category as { isEnumCandidate?: boolean; uniqueValues?: number; occurrences?: number } | undefined;
    expect(categoryStats).toBeDefined();
    expect(categoryStats?.occurrences).toBe(6);
    expect(categoryStats?.uniqueValues).toBe(2);
    expect(categoryStats?.isEnumCandidate).toBe(true);
  });
});
