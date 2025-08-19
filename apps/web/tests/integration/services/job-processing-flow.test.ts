/**
 * @module Integration tests for the job processing flow system.
 */
import fs from "fs";
import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { analyzeDuplicatesJob } from "@/lib/jobs/handlers/analyze-duplicates-job";
import { createEventsBatchJob } from "@/lib/jobs/handlers/create-events-batch-job";
import { datasetDetectionJob } from "@/lib/jobs/handlers/dataset-detection-job";
import { geocodeBatchJob } from "@/lib/jobs/handlers/geocode-batch-job";
import { schemaDetectionJob } from "@/lib/jobs/handlers/schema-detection-job";
import { validateSchemaJob } from "@/lib/jobs/handlers/validate-schema-job";

import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";
import { createImportFileWithUpload } from "../../setup/test-helpers";

describe.sequential("Job Processing Flow Integration", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testDir: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    testDir = testEnv.tempDir ?? "/tmp";

    // Create temp directory for CSV files
    const csvDir = path.join(testDir, "csv-files");
    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Clear collections before each test
    await testEnv.seedManager.truncate();

    // Create test catalog with auto-approval settings
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `Job Test Catalog ${timestamp}`,
        slug: `job-test-catalog-${timestamp}-${randomSuffix}`,
        description: "Catalog for job processing testing",
      },
    });
    testCatalogId = catalog.id;

    // Mock jobs queue to capture job calls for verification
    const queuedJobs: any[] = [];
    Object.assign(payload, {
      jobs: {
        queue: vi.fn().mockImplementation((job) => {
          queuedJobs.push(job);
          return Promise.resolve({ id: `job-${Date.now()}` });
        }),
        _queuedJobs: queuedJobs, // For test verification
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Full CSV Import Flow", () => {
    it("should process simple CSV through complete job pipeline without approval", async () => {
      // Create CSV content with basic event data
      const csvContent = `title,date,location
Tech Conference,2024-03-15,New York NY
Web Summit,2024-04-20,San Francisco CA
Data Workshop,2024-05-10,Austin TX`;

      // Write CSV to temp file
      const csvFileName = `test-events-${Date.now()}.csv`;
      const csvPath = path.join(testDir, "csv-files", csvFileName);
      fs.writeFileSync(csvPath, csvContent, "utf8");

      // Create import-files record with proper file upload
      const importFile = await createImportFileWithUpload(
        payload,
        {
          catalog: testCatalogId,
          status: "pending",
        },
        csvContent,
        csvFileName,
        "text/csv"
      );

      // Move file to expected location
      const importDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }
      const importPath = path.join(importDir, csvFileName);
      fs.writeFileSync(importPath, csvContent, "utf8");

      try {
        // 1. Start with dataset detection job
        const detectionContext = {
          payload,
          job: { id: "detection-job", input: { importFileId: importFile.id, catalogId: testCatalogId } },
        };

        const detectionResult = await datasetDetectionJob.handler(detectionContext);

        // Verify dataset detection results
        expect(detectionResult.output.sheetsDetected).toBe(1);
        expect(detectionResult.output.importJobsCreated).toBe(1);

        // Check that import-jobs was created
        const importJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        expect(importJobs.docs).toHaveLength(1);
        const importJob = importJobs.docs[0];
        expect(importJob.stage).toBe(PROCESSING_STAGE.ANALYZE_DUPLICATES);

        // The dataset detection job creates its own dataset based on filename
        expect(importJob.dataset).toBeDefined();
        const createdDatasetId = typeof importJob.dataset === "object" ? importJob.dataset.id : importJob.dataset;

        // 2. Run duplicate analysis
        const duplicateContext = {
          payload,
          job: {
            id: "duplicate-job",
            input: { importJobId: importJob.id, batchNumber: 0 },
          },
        };

        const duplicateResult = await analyzeDuplicatesJob.handler(duplicateContext);

        // Verify duplicate analysis (should find no duplicates in our simple data)
        expect(duplicateResult.output.totalRows).toBe(3); // 3 data rows
        expect(duplicateResult.output.uniqueRows).toBe(3); // All unique
        expect(duplicateResult.output.internalDuplicates).toBe(0);
        expect(duplicateResult.output.externalDuplicates).toBe(0);

        // Check job progressed to schema detection
        const updatedJob1 = await payload.findByID({
          collection: "import-jobs",
          id: importJob.id,
        });
        expect(updatedJob1.stage).toBe(PROCESSING_STAGE.DETECT_SCHEMA);

        // 3. Run schema detection
        const schemaContext = {
          payload,
          job: {
            id: "schema-job",
            input: { importJobId: importJob.id, batchNumber: 0 },
          },
        };

        const schemaResult = await schemaDetectionJob.handler(schemaContext);

        // Verify schema detection
        expect(schemaResult.output.batchNumber).toBe(0);
        expect(schemaResult.output.rowsProcessed).toBe(3);

        // Check job progressed to schema validation
        const updatedJob2 = await payload.findByID({
          collection: "import-jobs",
          id: importJob.id,
        });
        expect(updatedJob2.stage).toBe(PROCESSING_STAGE.VALIDATE_SCHEMA);
        expect(updatedJob2.schema).toBeDefined();

        // 4. Run schema validation (should auto-approve)
        const validationContext = {
          payload,
          job: {
            id: "validation-job",
            input: { importJobId: importJob.id },
          },
        };

        const validationResult = await validateSchemaJob.handler(validationContext);

        // Verify schema validation and auto-approval
        expect(validationResult.output.requiresApproval).toBe(false);
        expect(validationResult.output.hasBreakingChanges).toBe(false);
        expect(validationResult.output.newFields).toBeGreaterThanOrEqual(0);

        // Check job progressed to geocoding batch
        const updatedJob3 = await payload.findByID({
          collection: "import-jobs",
          id: importJob.id,
        });
        expect(updatedJob3.stage).toBe(PROCESSING_STAGE.GEOCODE_BATCH);

        // 5. Run geocoding batch (should skip since no geocoding candidates)
        const geocodingContext = {
          payload,
          job: {
            id: "geocoding-job",
            input: { importJobId: importJob.id, batchNumber: 0 },
          },
        };

        const geocodingResult = await geocodeBatchJob.handler(geocodingContext);

        // The geocoding job should either skip or process rows
        expect(geocodingResult.output).toBeDefined();

        // Check job advanced to event creation
        const updatedJob4 = await payload.findByID({
          collection: "import-jobs",
          id: importJob.id,
        });
        expect(updatedJob4.stage).toBe(PROCESSING_STAGE.CREATE_EVENTS);

        // 6. Run event creation
        const eventContext = {
          payload,
          job: {
            id: "event-job",
            input: { importJobId: importJob.id, batchNumber: 0 },
          },
        };

        const eventResult = await createEventsBatchJob.handler(eventContext);

        // Verify event creation
        expect(eventResult.output.batchNumber).toBe(0);
        expect(eventResult.output.eventsCreated).toBe(3);

        // Check final job status
        const finalJob = await payload.findByID({
          collection: "import-jobs",
          id: importJob.id,
        });
        expect(finalJob.stage).toBe(PROCESSING_STAGE.COMPLETED);

        // Verify events were actually created
        const events = await payload.find({
          collection: "events",
          where: { dataset: { equals: createdDatasetId } },
          sort: "id",
        });

        expect(events.docs).toHaveLength(3);

        // Verify event data matches CSV content
        const eventTitles = events.docs.map((e: any) => e.data.title).sort();
        expect(eventTitles).toEqual(["Data Workshop", "Tech Conference", "Web Summit"]);

        const eventDates = events.docs.map((e: any) => e.data.date).sort();
        expect(eventDates).toEqual(["2024-03-15", "2024-04-20", "2024-05-10"]);

        // Verify import file status is now completed
        const finalImportFile = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });
        expect(finalImportFile.status).toBe("completed");
      } finally {
        // Cleanup temp files
        if (fs.existsSync(importPath)) {
          fs.unlinkSync(importPath);
        }
      }
    });

    it("should handle empty CSV gracefully", async () => {
      const csvContent = ""; // Completely empty file
      const csvFileName = `empty-test-${Date.now()}.csv`;
      const csvPath = path.join(testDir, "csv-files", csvFileName);
      fs.writeFileSync(csvPath, csvContent, "utf8");

      const importFile = await createImportFileWithUpload(
        payload,
        {
          catalog: testCatalogId,
          status: "pending",
        },
        csvContent,
        csvFileName,
        "text/csv"
      );

      // Move file to expected location
      const importDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }
      const importPath = path.join(importDir, csvFileName);
      fs.writeFileSync(importPath, csvContent, "utf8");

      try {
        const detectionContext = {
          payload,
          job: { id: "detection-job", input: { importFileId: importFile.id, catalogId: testCatalogId } },
        };

        // Should handle empty file gracefully
        await expect(datasetDetectionJob.handler(detectionContext)).rejects.toThrow("No data rows found");

        // Verify import file status updated to failed
        const failedImportFile = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });
        expect(failedImportFile.status).toBe("failed");
      } finally {
        // Cleanup
        if (fs.existsSync(importPath)) {
          fs.unlinkSync(importPath);
        }
      }
    });

    it("should track progress correctly throughout job pipeline", async () => {
      const csvContent = `title,date,location
Event 1,2024-01-01,Location 1
Event 2,2024-01-02,Location 2`;

      const csvFileName = `progress-test-${Date.now()}.csv`;
      const importDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }
      const importPath = path.join(importDir, csvFileName);
      fs.writeFileSync(importPath, csvContent, "utf8");

      const importFile = await createImportFileWithUpload(
        payload,
        {
          catalog: testCatalogId,
          status: "pending",
        },
        csvContent,
        csvFileName,
        "text/csv"
      );

      try {
        // Run dataset detection
        const detectionContext = {
          payload,
          job: { id: "detection-job", input: { importFileId: importFile.id, catalogId: testCatalogId } },
        };
        await datasetDetectionJob.handler(detectionContext);

        const importJob = (
          await payload.find({
            collection: "import-jobs",
            where: { importFile: { equals: importFile.id } },
          })
        ).docs[0];

        // Verify initial progress structure
        expect(importJob.progress).toBeDefined();
        expect(importJob.progress.total).toBeGreaterThan(0);
        expect(importJob.progress.current).toBeGreaterThanOrEqual(0);
        expect(importJob.progress.batchNumber).toBeDefined();

        // Run duplicate analysis and check progress updates
        const duplicateContext = {
          payload,
          job: { id: "duplicate-job", input: { importJobId: importJob.id, batchNumber: 0 } },
        };
        await analyzeDuplicatesJob.handler(duplicateContext);

        const afterDuplicates = await payload.findByID({
          collection: "import-jobs",
          id: importJob.id,
        });

        // Progress should be properly structured and maintained
        expect(afterDuplicates.progress).toBeDefined();
        expect(afterDuplicates.progress.total).toBeGreaterThan(0);
        expect(afterDuplicates.progress.batchNumber).toBeGreaterThanOrEqual(0);

        // Verify that stage progressed after duplicate analysis
        expect(afterDuplicates.stage).toBe(PROCESSING_STAGE.DETECT_SCHEMA);
      } finally {
        if (fs.existsSync(importPath)) {
          fs.unlinkSync(importPath);
        }
      }
    });
  });
});
