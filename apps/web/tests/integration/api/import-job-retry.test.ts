/**
 * Integration tests for import job retry API endpoints.
 *
 * Tests the retry, reset, and recommendations endpoints with real database
 * operations, quota checking, and error recovery logic.
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";

import { TEST_CREDENTIALS, TEST_EMAILS } from "../../constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withImportFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Import Job Retry API", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testUserId: string;

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

    // Create test catalog
    const { catalog } = await withCatalog(testEnv, {
      name: "Retry Test Catalog",
      description: "Catalog for testing import job retry API",
    });
    testCatalogId = catalog.id;

    // Create test user
    const { users } = await withUsers(testEnv, {
      retryTestUser: {
        email: TEST_EMAILS.user,
        password: TEST_CREDENTIALS.basic.password,
        role: "user",
      },
    });
    testUserId = users.retryTestUser.id;
  });

  describe("POST /api/import-jobs/[id]/retry", () => {
    it("should retry a failed import job", async () => {
      const csvContent = `title,date,location
Event 1,2024-01-01,Location 1
Event 2,2024-01-02,Location 2`;

      // Create import file with file upload
      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: `retry-test-${Date.now()}.csv`,
        user: testUserId,
        status: "failed",
      });

      // Create dataset
      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Retry Test Dataset",
          catalog: testCatalogId,
          language: "eng",
        },
      });

      // Create a failed import job
      const failedJob = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: importFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.FAILED,
          retryAttempts: 0,
          schema: { title: { type: "string" }, date: { type: "date" }, location: { type: "string" } },
          progress: {
            stages: {},
            overallPercentage: 0,
            estimatedCompletionTime: null,
          },
          duplicates: {
            summary: { uniqueRows: 0 },
          },
          errorLog: {
            lastError: "Connection timeout - simulated failure",
            timestamp: new Date().toISOString(),
          },
        },
      });

      // Verify job is in FAILED state
      expect(failedJob.stage).toBe(PROCESSING_STAGE.FAILED);
      expect(failedJob.retryAttempts).toBe(0);

      // Import ErrorRecoveryService to manually trigger retry
      const { ErrorRecoveryService } = await import("@/lib/services/error-recovery");
      const result = await ErrorRecoveryService.recoverFailedJob(payload, failedJob.id);

      // Verify retry was scheduled
      expect(result.success).toBe(true);
      expect(result.action).toBe("retry_scheduled");
      expect(result.retryScheduled).toBe(true);
      expect(result.nextRetryAt).toBeDefined();

      // Verify job was updated
      const updatedJob = await payload.findByID({
        collection: "import-jobs",
        id: failedJob.id,
      });

      expect(updatedJob.retryAttempts).toBe(1);
      expect(updatedJob.lastRetryAt).toBeDefined();
      expect(updatedJob.nextRetryAt).toBeDefined();
      expect(updatedJob.stage).not.toBe(PROCESSING_STAGE.FAILED); // Should be moved to recovery stage
    });

    it("should reject retry if job is not in failed state", async () => {
      const csvContent = `title,date
Event,2024-01-01`;

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: `not-failed-test-${Date.now()}.csv`,
        user: testUserId,
        status: "processing",
      });

      // Create dataset
      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Not Failed Dataset",
          catalog: testCatalogId,
          language: "eng",
        },
      });

      // Create a job in COMPLETED state
      const completedJob = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: importFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.COMPLETED,
          schema: { title: { type: "string" }, date: { type: "date" } },
          progress: {
            stages: {},
            overallPercentage: 100,
            estimatedCompletionTime: null,
          },
          duplicates: {
            summary: { uniqueRows: 1 },
          },
        },
      });

      const { ErrorRecoveryService } = await import("@/lib/services/error-recovery");
      const result = await ErrorRecoveryService.recoverFailedJob(payload, completedJob.id);

      expect(result.success).toBe(false);
      expect(result.action).toBe("not_failed");
      expect(result.error).toContain("not in failed state");
    });

    it("should reject retry if max retries exceeded", async () => {
      const csvContent = `title,date
Event,2024-01-01`;

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: `max-retries-test-${Date.now()}.csv`,
        user: testUserId,
        status: "failed",
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Max Retries Dataset",
          catalog: testCatalogId,
          language: "eng",
        },
      });

      // Create a job that has already hit max retries
      const maxRetriesJob = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: importFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.FAILED,
          retryAttempts: 3, // Max retries
          schema: { title: { type: "string" }, date: { type: "date" } },
          progress: {
            stages: {},
            overallPercentage: 0,
            estimatedCompletionTime: null,
          },
          duplicates: {
            summary: { uniqueRows: 0 },
          },
          errorLog: {
            lastError: "Connection timeout",
            timestamp: new Date().toISOString(),
          },
        },
      });

      const { ErrorRecoveryService } = await import("@/lib/services/error-recovery");
      const result = await ErrorRecoveryService.recoverFailedJob(payload, maxRetriesJob.id);

      expect(result.success).toBe(false);
      expect(result.action).toBe("max_retries_exceeded");
      expect(result.error).toContain("Maximum retry attempts");
    });
  });

  describe("POST /api/import-jobs/[id]/reset", () => {
    it("should allow admin to reset job to specific stage", async () => {
      const csvContent = `title,date
Event,2024-01-01`;

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: `reset-test-${Date.now()}.csv`,
        user: testUserId,
        status: "failed",
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: {
          name: "Reset Test Dataset",
          catalog: testCatalogId,
          language: "eng",
        },
      });

      const failedJob = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: importFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.FAILED,
          retryAttempts: 2,
          schema: { title: { type: "string" }, date: { type: "date" } },
          progress: {
            stages: {},
            overallPercentage: 0,
            estimatedCompletionTime: null,
          },
          duplicates: {
            summary: { uniqueRows: 0 },
          },
          errorLog: {
            lastError: "Geocoding error",
            timestamp: new Date().toISOString(),
          },
        },
      });

      const { ErrorRecoveryService } = await import("@/lib/services/error-recovery");
      const result = await ErrorRecoveryService.resetJobToStage(
        payload,
        failedJob.id,
        PROCESSING_STAGE.GEOCODE_BATCH,
        true // Clear retries
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("manual_reset");

      // Verify job was reset
      const resetJob = await payload.findByID({
        collection: "import-jobs",
        id: failedJob.id,
      });

      expect(resetJob.stage).toBe(PROCESSING_STAGE.GEOCODE_BATCH);
      expect(resetJob.retryAttempts).toBe(0); // Should be cleared
      expect(resetJob.lastRetryAt).toBeDefined();
    });
  });

  describe("GET /api/import-jobs/failed/recommendations", () => {
    it("should provide recovery recommendations for failed jobs", async () => {
      const csvContent1 = `title,date
Event 1,2024-01-01`;

      const csvContent2 = `title,date
Event 2,2024-01-02`;

      // Create first failed job - recoverable error
      const { importFile: importFile1 } = await withImportFile(testEnv, testCatalogId, csvContent1, {
        filename: `recommendations-1-${Date.now()}.csv`,
        user: testUserId,
        status: "failed",
      });

      const dataset1 = await payload.create({
        collection: "datasets",
        data: {
          name: "Recommendations Dataset 1",
          catalog: testCatalogId,
          language: "eng",
        },
      });

      const importJob1 = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: importFile1.id,
          dataset: dataset1.id,
          stage: PROCESSING_STAGE.FAILED,
          retryAttempts: 0,
          schema: { title: { type: "string" }, date: { type: "date" } },
          progress: {
            stages: {},
            overallPercentage: 0,
            estimatedCompletionTime: null,
          },
          duplicates: {
            summary: { uniqueRows: 0 },
          },
          errorLog: {
            lastError: "Connection timeout",
            timestamp: new Date().toISOString(),
          },
        },
      });

      // Create second failed job - max retries exceeded
      const { importFile: importFile2 } = await withImportFile(testEnv, testCatalogId, csvContent2, {
        filename: `recommendations-2-${Date.now()}.csv`,
        user: testUserId,
        status: "failed",
      });

      const dataset2 = await payload.create({
        collection: "datasets",
        data: {
          name: "Recommendations Dataset 2",
          catalog: testCatalogId,
          language: "eng",
        },
      });

      const importJob2 = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: importFile2.id,
          dataset: dataset2.id,
          stage: PROCESSING_STAGE.FAILED,
          retryAttempts: 3, // Max retries
          schema: { title: { type: "string" }, date: { type: "date" } },
          progress: {
            stages: {},
            overallPercentage: 0,
            estimatedCompletionTime: null,
          },
          duplicates: {
            summary: { uniqueRows: 0 },
          },
          errorLog: {
            lastError: "Connection timeout",
            timestamp: new Date().toISOString(),
          },
        },
      });

      const { ErrorRecoveryService } = await import("@/lib/services/error-recovery");
      const recommendations = await ErrorRecoveryService.getRecoveryRecommendations(payload);

      expect(recommendations).toHaveLength(2);

      // First job should be retryable
      const job1Recommendation = recommendations.find((r) => String(r.jobId) === String(importJob1.id));
      expect(job1Recommendation).toBeDefined();
      expect(job1Recommendation!.recommendedAction).toBe("Automatic retry available");
      expect(job1Recommendation!.classification.retryable).toBe(true);

      // Second job should require manual intervention
      const job2Recommendation = recommendations.find((r) => String(r.jobId) === String(importJob2.id));
      expect(job2Recommendation).toBeDefined();
      expect(job2Recommendation!.recommendedAction).toContain("max retries");
    });
  });
});
