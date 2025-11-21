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

import { createIntegrationTestEnvironment, withCatalog, withImportFile } from "../../setup/integration/environment";

describe.sequential("Job Queueing Tests", () => {
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
    // Clear collections before each test
    await testEnv.seedManager.truncate();

    // Create test catalog
    const { catalog } = await withCatalog(testEnv, {
      name: "Job Queueing Test Catalog",
      description: "Catalog for testing job queueing behavior",
    });
    testCatalogId = catalog.id;
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

      expect(queuedJobs.docs.length).toBe(1);
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
      });

      // Run jobs until schema detection completes
      let schemaDetectionComplete = false;
      let iteration = 0;
      const maxIterations = 20;

      while (!schemaDetectionComplete && iteration < maxIterations) {
        iteration++;
        await payload.jobs.run({ allQueues: true, limit: 100 });

        const importJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        if (importJobs.docs.length > 0) {
          const currentJob = importJobs.docs[0];
          schemaDetectionComplete =
            currentJob.stage === "validate-schema" ||
            currentJob.stage === "processing" ||
            currentJob.stage === "completed";
        }

        if (!schemaDetectionComplete) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      expect(schemaDetectionComplete).toBe(true);

      // Get import job
      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
        depth: 2,
      });

      const importJob = importJobs.docs[0];

      // Approve schema
      const testUser = await payload.create({
        collection: "users",
        data: {
          email: `approver-${Date.now()}@example.com`,
          password: "test123",
          role: "admin",
        },
      });

      await payload.update({
        collection: "import-jobs",
        id: importJob.id,
        data: {
          schemaValidation: {
            ...importJob.schemaValidation,
            approved: true,
            approvedBy: testUser.id,
            approvedAt: new Date().toISOString(),
          },
        },
      });

      // Complete the import
      let pipelineComplete = false;
      iteration = 0;

      while (!pipelineComplete && iteration < 50) {
        iteration++;
        await payload.jobs.run({ allQueues: true, limit: 100 });

        const updatedImportFile = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });

        pipelineComplete = updatedImportFile.status === "completed" || updatedImportFile.status === "failed";

        if (!pipelineComplete) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      expect(pipelineComplete).toBe(true);

      // Check that exactly 3 events were created (matching the 3 rows in events-german.csv)
      const datasetId = typeof importJob.dataset === "object" ? importJob.dataset.id : importJob.dataset;
      const events = await payload.find({
        collection: "events",
        where: {
          dataset: { equals: datasetId },
        },
      });

      // Should have exactly 3 events, not 6 (which would indicate double-processing)
      expect(events.docs.length).toBe(3);
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

      expect(analyzeDuplicatesJobs.docs.length).toBe(1);
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

      expect(detectSchemaJobs.docs.length).toBe(1);
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

      expect(validateSchemaJobs.docs.length).toBe(1);
      logger.info("✓ Verified: validate-schema queued exactly once");
    });
  });
});
