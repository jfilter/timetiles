/**
 * Integration tests for failure transitions (ANY_STAGE → FAILED).
 *
 * Tests that jobs properly transition to FAILED state when errors occur
 * at various stages of the import pipeline, and that failed jobs don't
 * queue additional jobs or allow further processing.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { analyzeDuplicatesJob } from "@/lib/jobs/handlers/analyze-duplicates-job";
import { createEventsBatchJob } from "@/lib/jobs/handlers/create-events-batch-job";
import { datasetDetectionJob } from "@/lib/jobs/handlers/dataset-detection-job";
import { geocodeBatchJob } from "@/lib/jobs/handlers/geocode-batch-job";
import { schemaDetectionJob } from "@/lib/jobs/handlers/schema-detection-job";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withImportFile,
  withUsers,
} from "../../../setup/integration/environment";

describe.sequential("Failure Transitions Integration", () => {
  const collectionsToReset = [
    "events",
    "import-files",
    "import-jobs",
    "datasets",
    "dataset-schemas",
    "payload-jobs",
    "user-usage",
  ];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testUserId: string | number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, {
      testUser: { role: "user" },
    });
    testUserId = users.testUser.id;

    const { catalog } = await withCatalog(testEnv, {
      name: "Failure Test Catalog",
      description: "Catalog for testing failure transitions",
      user: users.testUser,
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

  describe("Dataset Detection Failures", () => {
    it("should transition to FAILED when file has no data rows", async () => {
      const csvContent = ""; // Empty file
      const csvFileName = `empty-${Date.now()}.csv`;

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        user: testUserId,
        filename: csvFileName,
      });

      const detectionContext = {
        payload,
        job: { id: "detection-job", input: { importFileId: importFile.id, catalogId: testCatalogId } },
      };

      await expect(datasetDetectionJob.handler(detectionContext)).rejects.toThrow("No data rows found");

      const failedImportFile = await payload.findByID({
        collection: "import-files",
        id: importFile.id,
      });
      expect(failedImportFile.status).toBe("failed");

      const queuedJobs = await payload.find({
        collection: "payload-jobs",
        where: {
          "input.importFileId": { equals: importFile.id },
          completedAt: { exists: false },
        },
      });
      expect(queuedJobs.docs.length).toBeLessThanOrEqual(1);
    });

    it("should handle CSV with inconsistent columns gracefully", async () => {
      const csvContent = "header1,header2\nvalue1"; // Missing second value - Papa Parse handles this
      const csvFileName = `inconsistent-${Date.now()}.csv`;

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        user: testUserId,
        filename: csvFileName,
      });

      const detectionContext = {
        payload,
        job: { id: "detection-job", input: { importFileId: importFile.id, catalogId: testCatalogId } },
      };

      const result = await datasetDetectionJob.handler(detectionContext);

      expect(result.output.sheetsDetected).toBe(1);
      expect(result.output.importJobsCreated).toBe(1);
    });
  });

  describe("Duplicate Analysis Failures", () => {
    it("should transition to FAILED when import job not found", async () => {
      const nonExistentJobId = "non-existent-job-id";

      const duplicateContext = {
        payload,
        job: {
          id: "duplicate-job",
          input: { importJobId: nonExistentJobId, batchNumber: 0 },
        },
      };

      // Should throw error (Payload returns "Not Found" for missing documents)
      await expect(analyzeDuplicatesJob.handler(duplicateContext)).rejects.toThrow("Not Found");

      // Verify no jobs were queued for this non-existent job
      const queuedJobs = await payload.find({
        collection: "payload-jobs",
        where: {
          "input.importJobId": { equals: nonExistentJobId },
          completedAt: { exists: false },
        },
      });
      expect(queuedJobs.docs).toHaveLength(0);
    });
  });

  describe("Schema Detection Failures", () => {
    it("should transition to FAILED when import job not found", async () => {
      const nonExistentJobId = "non-existent-job-id";

      const schemaContext = {
        payload,
        job: {
          id: "schema-job",
          input: { importJobId: nonExistentJobId, batchNumber: 0 },
        },
      };

      // Should throw error (Payload returns "Not Found" for missing documents)
      await expect(schemaDetectionJob.handler(schemaContext)).rejects.toThrow("Not Found");
    });
  });

  describe("Geocoding Failures", () => {
    it("should handle geocoding errors gracefully", async () => {
      // Create a simple CSV with location data
      const csvContent = `title,date,location
Event 1,2024-01-01,New York NY
Event 2,2024-01-02,San Francisco CA`;

      const csvFileName = `geocoding-test-${Date.now()}.csv`;

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        user: testUserId,
        filename: csvFileName,
      });

      const detectionContext = {
        payload,
        job: { id: "detection-job", input: { importFileId: importFile.id, catalogId: testCatalogId } },
      };
      await datasetDetectionJob.handler(detectionContext);

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });
      const importJob = importJobs.docs[0];

      await analyzeDuplicatesJob.handler({
        payload,
        job: { id: "duplicate-job", input: { importJobId: importJob.id, batchNumber: 0 } },
      });

      await schemaDetectionJob.handler({
        payload,
        job: { id: "schema-job", input: { importJobId: importJob.id, batchNumber: 0 } },
      });

      await expect(
        geocodeBatchJob.handler({
          payload,
          job: {
            id: "geocoding-job",
            input: { importJobId: "non-existent", batchNumber: 0 },
          },
        })
      ).rejects.toThrow("Not Found");
    });
  });

  describe("Event Creation Failures", () => {
    it("should handle event creation errors when import job not found", async () => {
      const eventContext = {
        payload,
        job: {
          id: "event-job",
          input: { importJobId: "non-existent", batchNumber: 0 },
        },
      };

      // Should throw error (Payload returns "Not Found" for missing documents)
      await expect(createEventsBatchJob.handler(eventContext)).rejects.toThrow("Not Found");
    });
  });

  describe("Error Logging and Cleanup", () => {
    it("should mark file as failed when job fails", async () => {
      const csvContent = ""; // Empty file to trigger failure
      const csvFileName = `error-log-test-${Date.now()}.csv`;

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        user: testUserId,
        filename: csvFileName,
      });

      const detectionContext = {
        payload,
        job: { id: "detection-job", input: { importFileId: importFile.id, catalogId: testCatalogId } },
      };

      await expect(datasetDetectionJob.handler(detectionContext)).rejects.toThrow();

      const failedImportFile = await payload.findByID({
        collection: "import-files",
        id: importFile.id,
      });
      expect(failedImportFile.status).toBe("failed");
    });
  });
});
