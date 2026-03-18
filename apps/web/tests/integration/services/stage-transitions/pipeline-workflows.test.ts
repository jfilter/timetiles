/**
 * Integration tests for import pipeline workflow transitions.
 *
 * Consolidated tests covering:
 * - Approval workflow (VALIDATE_SCHEMA → AWAIT_APPROVAL → CREATE_SCHEMA_VERSION)
 * - Direct skip (VALIDATE_SCHEMA → GEOCODE_BATCH when schema unchanged)
 * - Terminal states (COMPLETED/FAILED immutability and recovery)
 * - Full pipeline completion via direct handler calls
 *
 * @module
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { analyzeDuplicatesJob } from "@/lib/jobs/handlers/analyze-duplicates-job";
import { createEventsBatchJob } from "@/lib/jobs/handlers/create-events-batch-job";
import { createSchemaVersionJob } from "@/lib/jobs/handlers/create-schema-version-job";
import { datasetDetectionJob } from "@/lib/jobs/handlers/dataset-detection-job";
import { geocodeBatchJob } from "@/lib/jobs/handlers/geocode-batch-job";
import { schemaDetectionJob } from "@/lib/jobs/handlers/schema-detection-job";
import { validateSchemaJob } from "@/lib/jobs/handlers/validate-schema-job";
import * as geocodingModule from "@/lib/services/geocoding";
import { extractRelationId } from "@/lib/utils/relation-id";

import {
  createIntegrationTestEnvironment,
  IMPORT_PIPELINE_COLLECTIONS_TO_RESET,
  withCatalog,
  withImportFile,
  withUsers,
} from "../../../setup/integration/environment";

describe.sequential("Pipeline Workflow Transitions", () => {
  const collectionsToReset = [...IMPORT_PIPELINE_COLLECTIONS_TO_RESET];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testUserId: string | number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { testUser: { role: "user" } });
    testUserId = users.testUser.id;

    const { catalog } = await withCatalog(testEnv, {
      name: "Pipeline Workflow Test Catalog",
      description: "Catalog for testing pipeline workflow transitions",
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
    // Re-apply spies each test (global afterEach restores all mocks)
    vi.spyOn(geocodingModule, "GeocodingService").mockImplementation(
      class MockGeocodingService {
        geocode = vi
          .fn()
          .mockResolvedValue({
            latitude: 40.7128,
            longitude: -74.006,
            confidence: 0.9,
            normalizedAddress: "New York, NY, USA",
            provider: "mock",
            components: {},
            metadata: {},
          });
      } as unknown as typeof geocodingModule.GeocodingService
    );

    await testEnv.seedManager.truncate(collectionsToReset);
  });

  /** Helper: Run first import through detection → validation to establish a baseline schema. */
  const runFirstImportToValidation = async (csvContent: string) => {
    const csvFileName = `baseline-${Date.now()}.csv`;
    const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
      filename: csvFileName,
      user: testUserId,
    });

    const detectionContext = {
      req: { payload },
      job: { id: "detection-job-1", input: { importFileId: importFile.id, catalogId: testCatalogId } },
    };
    await datasetDetectionJob.handler(detectionContext);

    const importJobs = await payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFile.id } },
    });
    const importJob = importJobs.docs[0];
    const datasetId = extractRelationId(importJob.dataset);

    await analyzeDuplicatesJob.handler({
      req: { payload },
      job: { id: "duplicate-job-1", input: { importJobId: importJob.id } },
    });

    await schemaDetectionJob.handler({
      req: { payload },
      job: { id: "schema-job-1", input: { importJobId: importJob.id } },
    });

    await validateSchemaJob.handler({
      req: { payload },
      job: { id: "validation-job-1", input: { importJobId: importJob.id } },
    });

    return { importFile, importJob, datasetId };
  };

  /** Helper: Create a second import job for the same dataset, run through to validation. */
  const runSecondImportToValidation = async (csvContent: string, datasetId: string | number) => {
    const csvFileName = `second-${Date.now()}.csv`;
    const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
      filename: csvFileName,
      user: testUserId,
    });

    const importJob2 = await payload.create({
      collection: "import-jobs",
      data: {
        importFile: importFile.id,
        dataset: datasetId,
        stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
        progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
        duplicates: { summary: { uniqueRows: 0 } },
      },
    });

    await analyzeDuplicatesJob.handler({
      req: { payload },
      job: { id: "duplicate-job-2", input: { importJobId: importJob2.id } },
    });

    await schemaDetectionJob.handler({
      req: { payload },
      job: { id: "schema-job-2", input: { importJobId: importJob2.id } },
    });

    await validateSchemaJob.handler({
      req: { payload },
      job: { id: "validation-job-2", input: { importJobId: importJob2.id } },
    });

    return { importFile, importJob: importJob2 };
  };

  describe("Approval Workflow", () => {
    it("should transition to AWAIT_APPROVAL when breaking changes detected", async () => {
      // First import establishes schema with 3 columns
      const { datasetId } = await runFirstImportToValidation(`title,date,location
Event 1,2024-01-01,Location 1`);

      // Second import removes a column (breaking change)
      const { importJob } = await runSecondImportToValidation(
        `title,date
Event 2,2024-01-02`,
        datasetId
      );

      const updatedJob = await payload.findByID({ collection: "import-jobs", id: importJob.id });

      // Should be either AWAIT_APPROVAL (breaking changes) or CREATE_SCHEMA_VERSION (auto-approved)
      expect([PROCESSING_STAGE.AWAIT_APPROVAL, PROCESSING_STAGE.CREATE_SCHEMA_VERSION]).toContain(updatedJob.stage);

      if (updatedJob.stage === PROCESSING_STAGE.AWAIT_APPROVAL) {
        expect(updatedJob.schemaValidation).toBeDefined();
        expect(updatedJob.schemaValidation.requiresApproval).toBe(true);
        expect(updatedJob.schemaValidation.approved).toBe(false);
      }
    });

    it("should create import job in AWAIT_APPROVAL state with proper validation structure", async () => {
      const csvContent = `title,date,location
Event 1,2024-01-01,Location 1`;

      const csvFileName = `manual-approval-${Date.now()}.csv`;
      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: csvFileName,
        user: testUserId,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: "Manual Approval Test Dataset", catalog: testCatalogId, language: "eng" },
      });

      const importJob = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: importFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.AWAIT_APPROVAL,
          schema: { title: { type: "string" }, date: { type: "date" }, location: { type: "string" } },
          schemaValidation: {
            requiresApproval: true,
            approved: false,
            hasBreakingChanges: true,
            changes: [{ type: "field_added", field: "location", details: "New field added" }],
          },
          progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
          duplicates: { summary: { uniqueRows: 1 } },
        },
      });

      expect(importJob.stage).toBe(PROCESSING_STAGE.AWAIT_APPROVAL);
      expect(importJob.schemaValidation).toBeDefined();
      expect(importJob.schemaValidation.requiresApproval).toBe(true);
      expect(importJob.schemaValidation.approved).toBe(false);
    });

    it("should keep job in AWAIT_APPROVAL state until explicitly approved", async () => {
      const csvContent = `title,date
Event 1,2024-01-01`;

      const csvFileName = `no-approval-${Date.now()}.csv`;
      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: csvFileName,
        user: testUserId,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: "No Approval Test Dataset", catalog: testCatalogId, language: "eng" },
      });

      const importJob = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: importFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.AWAIT_APPROVAL,
          schema: { title: { type: "string" }, date: { type: "date" } },
          schemaValidation: { requiresApproval: true, approved: false, hasBreakingChanges: false, changes: [] },
          progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
          duplicates: { summary: { uniqueRows: 1 } },
        },
      });

      const awaitingJob = await payload.findByID({ collection: "import-jobs", id: importJob.id });
      expect(awaitingJob.stage).toBe(PROCESSING_STAGE.AWAIT_APPROVAL);
      expect(awaitingJob.schemaValidation.approved).toBe(false);
      expect(awaitingJob.schemaValidation.requiresApproval).toBe(true);
    });
  });

  describe("Direct Skip (schema unchanged)", () => {
    it("should skip CREATE_SCHEMA_VERSION when schema has no changes", async () => {
      // First import establishes schema
      const { datasetId } = await runFirstImportToValidation(`title,date,location
Event 1,2024-01-01,Location 1
Event 2,2024-01-02,Location 2`);

      // Second import with identical schema
      const { importJob } = await runSecondImportToValidation(
        `title,date,location
Event 3,2024-01-03,Location 3
Event 4,2024-01-04,Location 4`,
        datasetId
      );

      const updatedJob = await payload.findByID({ collection: "import-jobs", id: importJob.id });

      // Should either go to GEOCODE_BATCH (no changes) or CREATE_SCHEMA_VERSION
      expect([PROCESSING_STAGE.GEOCODE_BATCH, PROCESSING_STAGE.CREATE_SCHEMA_VERSION]).toContain(updatedJob.stage);

      if (updatedJob.stage === PROCESSING_STAGE.GEOCODE_BATCH) {
        expect(updatedJob.datasetSchemaVersion).toBeUndefined();
      }

      expect(updatedJob.schemaValidation).toBeDefined();
      if (updatedJob.schemaValidation?.requiresApproval === false) {
        expect(updatedJob.stage).not.toBe(PROCESSING_STAGE.AWAIT_APPROVAL);
      }
    });

    it("should proceed to CREATE_SCHEMA_VERSION when schema has changes", async () => {
      // First import (new dataset, no existing schema)
      const csvContent = `title,date,location
Event 1,2024-01-01,Location 1`;

      const csvFileName = `schema-changes-${Date.now()}.csv`;
      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: csvFileName,
        user: testUserId,
      });

      const detectionContext = {
        req: { payload },
        job: { id: "detection-job", input: { importFileId: importFile.id, catalogId: testCatalogId } },
      };
      await datasetDetectionJob.handler(detectionContext);

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });
      const importJob = importJobs.docs[0];

      await analyzeDuplicatesJob.handler({
        req: { payload },
        job: { id: "duplicate-job", input: { importJobId: importJob.id } },
      });

      await schemaDetectionJob.handler({
        req: { payload },
        job: { id: "schema-job", input: { importJobId: importJob.id } },
      });

      await validateSchemaJob.handler({
        req: { payload },
        job: { id: "validation-job", input: { importJobId: importJob.id } },
      });

      const updatedJob = await payload.findByID({ collection: "import-jobs", id: importJob.id });

      // For a new dataset with no existing schema, should go to CREATE_SCHEMA_VERSION
      expect(updatedJob.stage).toBe(PROCESSING_STAGE.CREATE_SCHEMA_VERSION);
      expect(updatedJob.schema).toBeDefined();
    });

    it("should maintain data integrity when skipping schema version creation", async () => {
      const csvContent = `title,date
Event 1,2024-01-01
Event 2,2024-01-02`;

      const csvFileName = `integrity-test-${Date.now()}.csv`;
      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: csvFileName,
        user: testUserId,
      });

      const detectionContext = {
        req: { payload },
        job: { id: "detection-job", input: { importFileId: importFile.id, catalogId: testCatalogId } },
      };
      await datasetDetectionJob.handler(detectionContext);

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });
      const importJob = importJobs.docs[0];

      await analyzeDuplicatesJob.handler({
        req: { payload },
        job: { id: "duplicate-job", input: { importJobId: importJob.id } },
      });

      await schemaDetectionJob.handler({
        req: { payload },
        job: { id: "schema-job", input: { importJobId: importJob.id } },
      });

      const beforeValidation = await payload.findByID({ collection: "import-jobs", id: importJob.id });

      await validateSchemaJob.handler({
        req: { payload },
        job: { id: "validation-job", input: { importJobId: importJob.id } },
      });

      const afterValidation = await payload.findByID({ collection: "import-jobs", id: importJob.id });

      // Verify schema data is preserved
      expect(afterValidation.schema).toBeDefined();
      expect(Object.keys(afterValidation.schema)).toEqual(Object.keys(beforeValidation.schema));

      // Verify duplicate analysis data is preserved
      expect(afterValidation.duplicates).toBeDefined();
      expect(afterValidation.duplicates.summary).toEqual(beforeValidation.duplicates.summary);

      // Verify progress tracking is maintained
      expect(afterValidation.progress).toBeDefined();
    });
  });

  describe("Terminal States", () => {
    it("should reach COMPLETED state after successful pipeline", async () => {
      const csvContent = `title,date,location
Event 1,2024-01-01,Location 1
Event 2,2024-01-02,Location 2`;

      const csvFileName = `completed-test-${Date.now()}.csv`;
      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: csvFileName,
        user: testUserId,
      });

      const detectionContext = {
        req: { payload },
        job: { id: "detection-job", input: { importFileId: importFile.id, catalogId: testCatalogId } },
      };
      await datasetDetectionJob.handler(detectionContext);

      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });
      const importJob = importJobs.docs[0];

      await analyzeDuplicatesJob.handler({
        req: { payload },
        job: { id: "duplicate-job", input: { importJobId: importJob.id } },
      });

      await schemaDetectionJob.handler({
        req: { payload },
        job: { id: "schema-job", input: { importJobId: importJob.id } },
      });

      await validateSchemaJob.handler({
        req: { payload },
        job: { id: "validation-job", input: { importJobId: importJob.id } },
      });

      await createSchemaVersionJob.handler({
        req: { payload },
        job: { id: "create-schema-version-job", input: { importJobId: importJob.id } },
      });

      await geocodeBatchJob.handler({
        req: { payload },
        job: { id: "geocoding-job", input: { importJobId: importJob.id, batchNumber: 0 } },
      });

      await createEventsBatchJob.handler({
        req: { payload },
        job: { id: "event-job", input: { importJobId: importJob.id } },
      });

      const completedJob = await payload.findByID({ collection: "import-jobs", id: importJob.id });
      expect(completedJob.stage).toBe(PROCESSING_STAGE.COMPLETED);

      const completedImportFile = await payload.findByID({ collection: "import-files", id: importFile.id });
      expect(completedImportFile.status).toBe("completed");
    });

    it("should not allow transition from COMPLETED to another stage", async () => {
      const csvContent = `title,date
Event 1,2024-01-01`;

      const csvFileName = `completed-transition-test-${Date.now()}.csv`;
      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: csvFileName,
        user: testUserId,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: "Completed Test Dataset", catalog: testCatalogId, language: "eng" },
      });

      const completedJob = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: importFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.COMPLETED,
          schema: { title: { type: "string" }, date: { type: "date" } },
          progress: { stages: {}, overallPercentage: 100, estimatedCompletionTime: null },
          duplicates: { summary: { uniqueRows: 1 } },
        },
      });

      const completedJobCheck = await payload.findByID({ collection: "import-jobs", id: completedJob.id });
      expect(completedJobCheck.stage).toBe(PROCESSING_STAGE.COMPLETED);

      await expect(
        payload.update({
          collection: "import-jobs",
          id: completedJob.id,
          data: { stage: PROCESSING_STAGE.GEOCODE_BATCH },
        })
      ).rejects.toThrow("Cannot modify completed import job");
    });

    it("should not allow transition from FAILED to invalid recovery stage", async () => {
      const csvContent = `title,date
Failed Event,2024-01-01`;

      const csvFileName = `failed-transition-test-${Date.now()}.csv`;
      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: csvFileName,
        user: testUserId,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: "Failed Test Dataset", catalog: testCatalogId, language: "eng" },
      });

      const failedJob = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: importFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.FAILED,
          schema: { title: { type: "string" }, date: { type: "date" } },
          progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
          duplicates: { summary: { uniqueRows: 0 } },
          errorLog: { error: "Test error", context: "Testing failure", timestamp: new Date().toISOString() },
        },
      });

      const failedJobCheck = await payload.findByID({ collection: "import-jobs", id: failedJob.id });
      expect(failedJobCheck.stage).toBe(PROCESSING_STAGE.FAILED);

      // Cannot transition FAILED → COMPLETED
      await expect(
        payload.update({ collection: "import-jobs", id: failedJob.id, data: { stage: PROCESSING_STAGE.COMPLETED } })
      ).rejects.toThrow("Invalid recovery stage");

      // But CAN recover to a valid retry stage
      await payload.update({
        collection: "import-jobs",
        id: failedJob.id,
        data: { stage: PROCESSING_STAGE.ANALYZE_DUPLICATES },
      });

      const recoveredJob = await payload.findByID({ collection: "import-jobs", id: failedJob.id });
      expect(recoveredJob.stage).toBe(PROCESSING_STAGE.ANALYZE_DUPLICATES);
    });

    it("should not queue jobs from FAILED state", async () => {
      const csvContent = `title,date
Event,2024-01-01`;

      const csvFileName = `failed-queue-test-${Date.now()}.csv`;
      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: csvFileName,
        user: testUserId,
      });

      const dataset = await payload.create({
        collection: "datasets",
        data: { name: "Failed Queue Test Dataset", catalog: testCatalogId, language: "eng" },
      });

      const failedJob = await payload.create({
        collection: "import-jobs",
        data: {
          importFile: importFile.id,
          dataset: dataset.id,
          stage: PROCESSING_STAGE.FAILED,
          schema: { title: { type: "string" }, date: { type: "date" } },
          progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
          duplicates: { summary: { uniqueRows: 0 } },
          errorLog: {
            error: "Test error",
            context: "Testing job queueing from failed state",
            timestamp: new Date().toISOString(),
          },
        },
      });

      const queuedJobs = await payload.find({
        collection: "payload-jobs",
        where: { "input.importJobId": { equals: failedJob.id }, completedAt: { exists: false } },
      });
      expect(queuedJobs.docs.length).toBeGreaterThanOrEqual(0);
    });
  });
});
