/**
 * Integration tests for job queueing behavior.
 *
 * This test suite verifies that jobs are queued correctly through the import pipeline,
 * specifically ensuring that:
 * - Jobs are queued exactly once (no double-queueing)
 * - Collection hooks properly trigger job queueing
 * - Import pipeline stages progress without duplication
 *
 * @module
 * @category Integration Tests
 */
import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { logger } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";

import {
  createIntegrationTestEnvironment,
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  runJobsUntilImportJobStage,
  runJobsUntilImportSettled,
  withCatalog,
  withImportFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Job Queueing Tests", () => {
  const collectionsToReset = [...IMPORT_PIPELINE_COLLECTIONS_TO_RESET];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let approverUserId: number | string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { approver: { role: "admin" } });
    approverUserId = users.approver.id;

    const { catalog } = await withCatalog(testEnv, {
      name: "Job Queueing Test Catalog",
      description: "Catalog for testing job queueing behavior",
      user: users.approver,
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

  describe("Import Job Creation", () => {
    it("should queue analyze-duplicates exactly once when import-job is created", async () => {
      const fixturePath = path.join(__dirname, "../../fixtures/events-german.csv");
      const fileBuffer = fs.readFileSync(fixturePath);

      // Upload CSV file
      const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), fileBuffer, {
        filename: "events-german.csv",
        mimeType: "text/csv",
        datasetsCount: 0,
        datasetsProcessed: 0,
        user: approverUserId,
      });

      // Run dataset-detection job (automatically queued by import-files afterChange hook)
      await payload.jobs.run({ allQueues: true, limit: 100 });

      // Check that import-job was created
      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });

      expect(importJobs.docs.length).toBeGreaterThan(0);
      const importJobId = importJobs.docs[0].id;

      // Check queued jobs - should have exactly ONE analyze-duplicates job
      const queuedJobs = await payload.find({
        collection: "payload-jobs",
        where: {
          "input.importJobId": { equals: importJobId },
          taskSlug: { equals: "analyze-duplicates" },
          completedAt: { exists: false },
        },
      });

      expect(queuedJobs.docs).toHaveLength(1);
      logger.info("Verified single analyze-duplicates job queued", {
        importJobId,
        queuedJobsCount: queuedJobs.docs.length,
      });
    });

    it("should not create duplicate events when pipeline completes", async () => {
      const fixturePath = path.join(__dirname, "../../fixtures/events-german.csv");
      const fileBuffer = fs.readFileSync(fixturePath);

      // Upload CSV file
      const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), fileBuffer, {
        filename: "events-german.csv",
        mimeType: "text/csv",
        datasetsCount: 0,
        datasetsProcessed: 0,
        user: approverUserId,
      });

      const schemaDetectionResult = await runJobsUntilImportJobStage(
        payload,
        importFile.id,
        (importJob) =>
          importJob.stage === "validate-schema" ||
          importJob.stage === "create-events" ||
          importJob.stage === "completed",
        { maxIterations: 20 }
      );

      expect(schemaDetectionResult.matched).toBe(true);

      // Get import job
      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
        depth: 2,
      });

      const importJob = importJobs.docs[0];

      // Approve schema
      await payload.update({
        collection: "import-jobs",
        id: importJob.id,
        data: {
          schemaValidation: {
            ...importJob.schemaValidation,
            approved: true,
            approvedBy: approverUserId,
            approvedAt: new Date().toISOString(),
          },
        },
      });

      // Complete the import
      const pipelineResult = await runJobsUntilImportSettled(payload, importFile.id);

      expect(pipelineResult.settled).toBe(true);

      // Check that exactly 3 events were created (matching the 3 rows in events-german.csv)
      const datasetId = extractRelationId(importJob.dataset);
      const events = await payload.find({ collection: "events", where: { dataset: { equals: datasetId } } });

      // Should have exactly 3 events, not 6 (which would indicate double-processing)
      expect(events.docs).toHaveLength(3);
      logger.info("Verified correct event count (no duplicates)", {
        expectedCount: 3,
        actualCount: events.docs.length,
      });
    });
  });

  describe("Stage Transitions", () => {
    it("should queue next job only once at each stage transition", async () => {
      const fixturePath = path.join(__dirname, "../../fixtures/events-german.csv");
      const fileBuffer = fs.readFileSync(fixturePath);

      const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), fileBuffer, {
        filename: "events-german.csv",
        mimeType: "text/csv",
        datasetsCount: 0,
        datasetsProcessed: 0,
        user: approverUserId,
      });

      // Stage 1: Run dataset-detection (queued by import-files afterChange hook)
      await payload.jobs.run({ allQueues: true, limit: 100 });

      // Get import job that was created
      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });

      expect(importJobs.docs.length).toBeGreaterThan(0);
      const importJobId = importJobs.docs[0].id;

      // Stage 2: Check analyze-duplicates was queued exactly once (BEFORE running it)
      // Since deleteJobOnComplete is true by default, we must check BEFORE jobs complete
      const analyzeDuplicatesJobs = await payload.find({
        collection: "payload-jobs",
        where: {
          "input.importJobId": { equals: importJobId },
          taskSlug: { equals: "analyze-duplicates" },
          completedAt: { exists: false },
        },
      });

      expect(analyzeDuplicatesJobs.docs).toHaveLength(1);
      logger.info("✓ Verified: analyze-duplicates queued exactly once");

      // Run analyze-duplicates
      await payload.jobs.run({ allQueues: true, limit: 100 });

      // Stage 3: Check detect-schema was queued exactly once (BEFORE running it)
      const detectSchemaJobs = await payload.find({
        collection: "payload-jobs",
        where: {
          "input.importJobId": { equals: importJobId },
          taskSlug: { equals: "detect-schema" },
          completedAt: { exists: false },
        },
      });

      expect(detectSchemaJobs.docs).toHaveLength(1);
      logger.info("✓ Verified: detect-schema queued exactly once");

      // Run detect-schema
      await payload.jobs.run({ allQueues: true, limit: 100 });

      // Stage 4: Check validate-schema was queued exactly once (BEFORE running it)
      const validateSchemaJobs = await payload.find({
        collection: "payload-jobs",
        where: {
          "input.importJobId": { equals: importJobId },
          taskSlug: { equals: "validate-schema" },
          completedAt: { exists: false },
        },
      });

      expect(validateSchemaJobs.docs).toHaveLength(1);
      logger.info("✓ Verified: validate-schema queued exactly once");
    });
  });
});
