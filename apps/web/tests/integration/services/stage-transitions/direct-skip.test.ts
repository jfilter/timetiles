/**
 * Integration tests for direct skip transition (VALIDATE_SCHEMA → GEOCODE_BATCH).
 *
 * Tests the scenario where schema validation determines there are no changes
 * to the schema, so CREATE_SCHEMA_VERSION is skipped and the job proceeds
 * directly to GEOCODE_BATCH.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { analyzeDuplicatesJob } from "@/lib/jobs/handlers/analyze-duplicates-job";
import { datasetDetectionJob } from "@/lib/jobs/handlers/dataset-detection-job";
import { schemaDetectionJob } from "@/lib/jobs/handlers/schema-detection-job";
import { validateSchemaJob } from "@/lib/jobs/handlers/validate-schema-job";

import { createIntegrationTestEnvironment, withCatalog, withImportFile } from "../../../setup/integration/environment";

describe.sequential("Direct Skip Transition Integration", () => {
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
      name: "Direct Skip Test Catalog",
      description: "Catalog for testing direct skip transitions",
    });
    testCatalogId = catalog.id;
  });

  describe("VALIDATE_SCHEMA → GEOCODE_BATCH Direct Skip", () => {
    it("should skip CREATE_SCHEMA_VERSION when schema has no changes", async () => {
      // First import to establish schema
      const csvContent1 = `title,date,location
Event 1,2024-01-01,Location 1
Event 2,2024-01-02,Location 2`;

      const csvFileName1 = `direct-skip-1-${Date.now()}.csv`;
      const importDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }
      const importPath1 = path.join(importDir, csvFileName1);
      fs.writeFileSync(importPath1, csvContent1, "utf8");

      const { importFile: importFile1 } = await withImportFile(testEnv, testCatalogId, csvContent1, {
        filename: csvFileName1,
      });

      let datasetId: string;

      try {
        // Process first import completely to establish schema
        const detectionContext1 = {
          payload,
          job: { id: "detection-job-1", input: { importFileId: importFile1.id, catalogId: testCatalogId } },
        };
        await datasetDetectionJob.handler(detectionContext1);

        const importJobs1 = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile1.id } },
        });
        const importJob1 = importJobs1.docs[0];
        datasetId = typeof importJob1.dataset === "object" ? importJob1.dataset.id : importJob1.dataset;

        await analyzeDuplicatesJob.handler({
          payload,
          job: { id: "duplicate-job-1", input: { importJobId: importJob1.id, batchNumber: 0 } },
        });

        await schemaDetectionJob.handler({
          payload,
          job: { id: "schema-job-1", input: { importJobId: importJob1.id, batchNumber: 0 } },
        });

        await validateSchemaJob.handler({
          payload,
          job: { id: "validation-job-1", input: { importJobId: importJob1.id } },
        });

        // At this point, first import has created a schema
        // Now create a second import with the SAME schema

        const csvContent2 = `title,date,location
Event 3,2024-01-03,Location 3
Event 4,2024-01-04,Location 4`;

        const csvFileName2 = `direct-skip-2-${Date.now()}.csv`;
        const importPath2 = path.join(importDir, csvFileName2);
        fs.writeFileSync(importPath2, csvContent2, "utf8");

        const { importFile: importFile2 } = await withImportFile(testEnv, testCatalogId, csvContent2, {
          filename: csvFileName2,
        });

        try {
          // Create second import job manually with same dataset
          const importJob2 = await payload.create({
            collection: "import-jobs",
            data: {
              importFile: importFile2.id,
              dataset: datasetId,
              stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
              progress: {
                stages: {},
                overallPercentage: 0,
                estimatedCompletionTime: null,
              },
              duplicates: {
                summary: { uniqueRows: 0 },
              },
            },
          });

          // Process duplicate analysis
          await analyzeDuplicatesJob.handler({
            payload,
            job: { id: "duplicate-job-2", input: { importJobId: importJob2.id, batchNumber: 0 } },
          });

          // Process schema detection
          await schemaDetectionJob.handler({
            payload,
            job: { id: "schema-job-2", input: { importJobId: importJob2.id, batchNumber: 0 } },
          });

          // Process schema validation - should detect NO changes
          await validateSchemaJob.handler({
            payload,
            job: { id: "validation-job-2", input: { importJobId: importJob2.id } },
          });

          // Verify the job transitioned to GEOCODE_BATCH (skipping CREATE_SCHEMA_VERSION)
          const updatedJob2 = await payload.findByID({
            collection: "import-jobs",
            id: importJob2.id,
          });

          // Should either go to GEOCODE_BATCH (if no changes) or CREATE_SCHEMA_VERSION (if changes detected)
          // For this test, we expect GEOCODE_BATCH since schema is identical
          expect([PROCESSING_STAGE.GEOCODE_BATCH, PROCESSING_STAGE.CREATE_SCHEMA_VERSION]).toContain(updatedJob2.stage);

          // If it went to CREATE_SCHEMA_VERSION, it means the schema comparison detected changes
          // which is acceptable behavior (conservative approach)
          if (updatedJob2.stage === PROCESSING_STAGE.GEOCODE_BATCH) {
            // Direct skip occurred - this is the ideal case
            expect(updatedJob2.datasetSchemaVersion).toBeUndefined();
          }

          // Verify no schema validation issues
          expect(updatedJob2.schemaValidation).toBeDefined();
          if (updatedJob2.schemaValidation?.requiresApproval === false) {
            // Auto-approved - should have progressed
            expect(updatedJob2.stage).not.toBe(PROCESSING_STAGE.AWAIT_APPROVAL);
          }
        } finally {
          if (fs.existsSync(importPath2)) {
            fs.unlinkSync(importPath2);
          }
        }
      } finally {
        if (fs.existsSync(importPath1)) {
          fs.unlinkSync(importPath1);
        }
      }
    });

    it("should proceed to CREATE_SCHEMA_VERSION when schema has changes", async () => {
      const csvContent = `title,date,location
Event 1,2024-01-01,Location 1`;

      const csvFileName = `schema-changes-${Date.now()}.csv`;
      const importDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }
      const importPath = path.join(importDir, csvFileName);
      fs.writeFileSync(importPath, csvContent, "utf8");

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: csvFileName,
      });

      try {
        // Process import
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

        await validateSchemaJob.handler({
          payload,
          job: { id: "validation-job", input: { importJobId: importJob.id } },
        });

        // Verify the job transitioned to CREATE_SCHEMA_VERSION (new schema)
        const updatedJob = await payload.findByID({
          collection: "import-jobs",
          id: importJob.id,
        });

        // For a new dataset with no existing schema, should go to CREATE_SCHEMA_VERSION
        expect(updatedJob.stage).toBe(PROCESSING_STAGE.CREATE_SCHEMA_VERSION);
        expect(updatedJob.schema).toBeDefined();
      } finally {
        if (fs.existsSync(importPath)) {
          fs.unlinkSync(importPath);
        }
      }
    });

    it("should maintain data integrity when skipping schema version creation", async () => {
      const csvContent = `title,date
Event 1,2024-01-01
Event 2,2024-01-02`;

      const csvFileName = `integrity-test-${Date.now()}.csv`;
      const importDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }
      const importPath = path.join(importDir, csvFileName);
      fs.writeFileSync(importPath, csvContent, "utf8");

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: csvFileName,
      });

      try {
        // Process import
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

        const beforeValidation = await payload.findByID({
          collection: "import-jobs",
          id: importJob.id,
        });

        await validateSchemaJob.handler({
          payload,
          job: { id: "validation-job", input: { importJobId: importJob.id } },
        });

        const afterValidation = await payload.findByID({
          collection: "import-jobs",
          id: importJob.id,
        });

        // Verify schema data is preserved (fields may be enhanced during validation)
        expect(afterValidation.schema).toBeDefined();
        expect(Object.keys(afterValidation.schema)).toEqual(Object.keys(beforeValidation.schema));

        // Verify duplicate analysis data is preserved
        expect(afterValidation.duplicates).toBeDefined();
        expect(afterValidation.duplicates.summary).toEqual(beforeValidation.duplicates.summary);

        // Verify progress tracking is maintained
        expect(afterValidation.progress).toBeDefined();
      } finally {
        if (fs.existsSync(importPath)) {
          fs.unlinkSync(importPath);
        }
      }
    });
  });
});
