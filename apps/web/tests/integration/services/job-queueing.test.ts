/**
 * Integration tests for job queueing behavior.
 *
 * This test suite verifies that workflows are queued correctly through the import pipeline,
 * specifically ensuring that:
 * - Workflows are queued exactly once (no double-queueing)
 * - The ingest-files afterChange hook properly triggers the manual-ingest workflow
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
  runJobsUntilImportSettled,
  runJobsUntilIngestJobStage,
  withCatalog,
  withIngestFile,
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
    it("should queue exactly one manual-ingest workflow when file is uploaded", async () => {
      const fixturePath = path.join(__dirname, "../../fixtures/events-german.csv");
      const fileBuffer = fs.readFileSync(fixturePath);

      // Upload CSV file
      const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), fileBuffer, {
        filename: "events-german.csv",
        mimeType: "text/csv",
        datasetsCount: 0,
        datasetsProcessed: 0,
        user: approverUserId,
        triggerWorkflow: true,
      });

      // Check that exactly one manual-ingest workflow was queued (before running it)
      const queuedWorkflows = await payload.find({
        collection: "payload-jobs",
        where: { "input.ingestFileId": { equals: String(ingestFile.id) }, workflowSlug: { equals: "manual-ingest" } },
      });

      expect(queuedWorkflows.docs).toHaveLength(1);
      logger.info("Verified single manual-ingest workflow queued", {
        ingestFileId: ingestFile.id,
        queuedWorkflowsCount: queuedWorkflows.docs.length,
      });
    });

    it("should not create duplicate events when pipeline completes", async () => {
      const fixturePath = path.join(__dirname, "../../fixtures/events-german.csv");
      const fileBuffer = fs.readFileSync(fixturePath);

      // Upload CSV file
      const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), fileBuffer, {
        filename: "events-german.csv",
        mimeType: "text/csv",
        datasetsCount: 0,
        datasetsProcessed: 0,
        user: approverUserId,
        triggerWorkflow: true,
      });

      const schemaDetectionResult = await runJobsUntilIngestJobStage(
        payload,
        ingestFile.id,
        (ingestJob) =>
          ingestJob.stage === "validate-schema" ||
          ingestJob.stage === "create-events" ||
          ingestJob.stage === "completed",
        { maxIterations: 20 }
      );

      expect(schemaDetectionResult.matched).toBe(true);

      // Get import job
      const importJobs = await payload.find({
        collection: "ingest-jobs",
        where: { ingestFile: { equals: ingestFile.id } },
        depth: 2,
      });

      const ingestJob = importJobs.docs[0];

      // Approve schema
      await payload.update({
        collection: "ingest-jobs",
        id: ingestJob.id,
        data: {
          schemaValidation: {
            ...ingestJob.schemaValidation,
            approved: true,
            approvedBy: approverUserId,
            approvedAt: new Date().toISOString(),
          },
        },
      });

      // Complete the import
      const pipelineResult = await runJobsUntilImportSettled(payload, ingestFile.id);

      expect(pipelineResult.settled).toBe(true);

      // Check that exactly 3 events were created (matching the 3 rows in events-german.csv)
      const datasetId = extractRelationId(ingestJob.dataset);
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
    it("should process all stages through the workflow without duplicates", async () => {
      const fixturePath = path.join(__dirname, "../../fixtures/events-german.csv");
      const fileBuffer = fs.readFileSync(fixturePath);

      const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), fileBuffer, {
        filename: "events-german.csv",
        mimeType: "text/csv",
        datasetsCount: 0,
        datasetsProcessed: 0,
        user: approverUserId,
        triggerWorkflow: true,
      });

      // Verify exactly one workflow job is queued
      const workflowJobs = await payload.find({
        collection: "payload-jobs",
        where: { "input.ingestFileId": { equals: String(ingestFile.id) }, workflowSlug: { equals: "manual-ingest" } },
      });

      expect(workflowJobs.docs).toHaveLength(1);
      logger.info("Verified: single manual-ingest workflow queued");

      // Run the workflow to completion
      const pipelineResult = await runJobsUntilImportSettled(payload, ingestFile.id);
      expect(pipelineResult.settled).toBe(true);

      // Verify import completed and exactly one ingest job was created
      const importJobs = await payload.find({
        collection: "ingest-jobs",
        where: { ingestFile: { equals: ingestFile.id } },
      });

      expect(importJobs.docs).toHaveLength(1);
      expect(importJobs.docs[0].stage).toBe("completed");
      logger.info("Verified: single ingest job processed through all stages");

      // Verify exactly 3 events (no duplicates from double-processing)
      // Filter by both dataset and ingestJob to scope to this test's pipeline run
      const datasetId = extractRelationId(importJobs.docs[0].dataset);
      const ingestJobId = importJobs.docs[0].id;
      const events = await payload.find({
        collection: "events",
        where: { dataset: { equals: datasetId }, ingestJob: { equals: ingestJobId } },
      });
      expect(events.docs).toHaveLength(3);
      logger.info("Verified: correct event count, no stage duplication");
    });
  });
});
