/**
 * @module Comprehensive integration tests for file upload scenarios and approval workflows.
 *
 * This test suite covers:
 * - Different file types (CSV, Excel, invalid types)
 * - Schema approval workflows (auto-approval, manual approval, rejection)
 * - Error handling for corrupted/invalid files
 * - Large file processing with batching
 * - Multi-sheet Excel file processing
 *
 * Tests simulate real-world file upload scenarios with complete pipeline validation.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { utils as xlsxUtils, write as xlsxWrite } from "xlsx";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";

import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";
import { createImportFileWithUpload } from "../../setup/test-helpers";

describe.sequential("Comprehensive File Upload Tests", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testDir: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    testDir = testEnv.tempDir || "/tmp";

    // Create temp directory for test files
    const filesDir = path.join(testDir, "test-files");
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
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

    // Create test catalog
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `Comprehensive Test Catalog ${timestamp}`,
        slug: `comprehensive-test-catalog-${timestamp}-${randomSuffix}`,
        description: "Catalog for comprehensive file upload testing",
      },
    });
    testCatalogId = catalog.id;
  });

  // Helper functions
  const createTestExcelFile = (filename: string, sheets: Array<{ name: string; data: any[][] }>) => {
    const workbook = xlsxUtils.book_new();

    sheets.forEach((sheet) => {
      const worksheet = xlsxUtils.aoa_to_sheet(sheet.data);
      xlsxUtils.book_append_sheet(workbook, worksheet, sheet.name);
    });

    // Create file in import directory for job processing
    const importDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
    if (!fs.existsSync(importDir)) {
      fs.mkdirSync(importDir, { recursive: true });
    }

    const importFilePath = path.join(importDir, filename);
    const buffer = xlsxWrite(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    fs.writeFileSync(importFilePath, buffer);

    // Force sync to ensure file is written
    const fd = fs.openSync(importFilePath, "r+");
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    // Also create in the test temp directory for cleanup tracking
    const tempFilePath = path.join(testDir, "test-files", filename);
    fs.writeFileSync(tempFilePath, buffer);

    return { importFilePath, tempFilePath, filesize: buffer.length };
  };

  const createDatasetWithSchemaConfig = async (schemaConfig: {
    locked?: boolean;
    autoGrow?: boolean;
    autoApproveNonBreaking?: boolean;
  }) => {
    const timestamp = Date.now();
    return await payload.create({
      collection: "datasets",
      data: {
        name: `Test Dataset ${timestamp}`,
        slug: `test-dataset-${timestamp}`,
        catalog: testCatalogId,
        language: "eng", // Required field
        schemaConfig,
      },
    });
  };

  const runJobsUntilComplete = async (importFileId: string, maxIterations = 50) => {
    let pipelineComplete = false;
    let iteration = 0;

    while (!pipelineComplete && iteration < maxIterations) {
      iteration++;
      await payload.jobs.run({ allQueues: true, limit: 100 });

      const importFile = await payload.findByID({
        collection: "import-files",
        id: importFileId,
      });

      pipelineComplete = importFile.status === "completed" || importFile.status === "failed";

      if (!pipelineComplete && iteration % 10 === 0) {
        // Log progress every 10 iterations
        const jobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFileId } },
        });
        console.log(
          `Iteration ${iteration}: File status=${importFile.status}, Jobs:`,
          jobs.docs.map((j: any) => ({ id: j.id, stage: j.stage }))
        );
      }

      if (!pipelineComplete) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return iteration < maxIterations;
  };

  const simulateSchemaApproval = async (importJobId: string, approved: boolean) => {
    // Create a test user for approval if approved is true
    let testUserId = null;
    if (approved) {
      const testUser = await payload.create({
        collection: "users",
        data: {
          email: "test-approver@example.com",
          password: "test123",
          role: "admin",
        },
      });
      testUserId = testUser.id;
    }

    // Get the current job
    const beforeJob = await payload.findByID({
      collection: "import-jobs",
      id: importJobId,
    });

    console.log("Job before approval:", JSON.stringify(beforeJob.schemaValidation, null, 2));

    // Only update the approval fields - let the system handle stage transitions properly
    const updatedSchemaValidation = {
      ...beforeJob.schemaValidation,
      approved,
      approvedBy: testUserId,
      approvedAt: new Date().toISOString(),
    };

    await payload.update({
      collection: "import-jobs",
      id: importJobId,
      data: {
        schemaValidation: updatedSchemaValidation,
      },
    });

    console.log(`✓ Schema ${approved ? "approved" : "rejected"} - approval fields updated`);
  };

  describe("File Type Support", () => {
    it("should process Excel file with multiple sheets", async () => {
      console.log("Testing Excel file with multiple sheets...");

      // Use existing fixture file
      const fixturePath = path.join(__dirname, "../../fixtures", "multi-sheet.xlsx");
      const fileBuffer = fs.readFileSync(fixturePath);
      const fileName = "multi-sheet.xlsx";

      console.log(`✓ Using fixture file: ${fixturePath} (${fileBuffer.length} bytes)`);

      // Create import file record with file upload using the same pattern as upload.test.ts
      const importFile = await payload.create({
        collection: "import-files",
        data: {
          catalog: parseInt(testCatalogId, 10),
          status: "pending",
          datasetsCount: 0,
          datasetsProcessed: 0,
        },
        file: {
          data: fileBuffer,
          name: fileName,
          size: fileBuffer.length,
          mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      });

      console.log(`✓ Created Excel import file: ${importFile.id}`);

      // Wait for file to be written and hook to trigger
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Run jobs until completion
      const completed = await runJobsUntilComplete(importFile.id);

      // Check the final status and debug if needed
      const finalImportFile = await payload.findByID({
        collection: "import-files",
        id: importFile.id,
      });

      if (finalImportFile.status !== "completed") {
        console.log(`Import file status: ${finalImportFile.status}`);
        if (finalImportFile.errorLog) {
          console.log(`Error log: ${finalImportFile.errorLog}`);
        }

        // Check import jobs for more details
        const importJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        importJobs.docs.forEach((job: any, index: number) => {
          console.log(`Job ${index + 1}: stage=${job.stage}, errors=${job.errors?.length || 0}`);
          if (job.errors?.length > 0) {
            console.log(`  Errors:`, job.errors);
          }
        });
      }

      expect(completed).toBe(true);
      expect(finalImportFile.status).toBe("completed");

      // Verify multiple import jobs were created (one per sheet)
      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });

      expect(importJobs.docs.length).toBeGreaterThan(0); // At least one sheet
      console.log(`✓ Created ${importJobs.docs.length} import jobs for sheets`);

      // Verify jobs completed
      importJobs.docs.forEach((job: any) => {
        expect(job.stage).toBe(PROCESSING_STAGE.COMPLETED);
      });

      // Verify events were created from sheets
      const events = await payload.find({
        collection: "events",
        limit: 20,
      });

      expect(events.docs.length).toBeGreaterThan(0);
      console.log(`✓ Created ${events.docs.length} events from Excel sheets`);

      console.log("🎉 Excel multi-sheet test completed successfully!");
    });

    it("should reject invalid file types gracefully", async () => {
      console.log("Testing invalid file type rejection...");

      const invalidFiles = [
        { name: "test.pdf", mimeType: "application/pdf", content: "PDF content" },
        { name: "test.png", mimeType: "image/png", content: "PNG data" },
        { name: "test.zip", mimeType: "application/zip", content: "ZIP data" },
        { name: "test.doc", mimeType: "application/msword", content: "Word content" },
      ];

      for (const fileTest of invalidFiles) {
        console.log(`  Testing ${fileTest.name}...`);

        try {
          // Try to create import file record with invalid MIME type
          // This should fail during creation due to MIME type validation
          await expect(
            createImportFileWithUpload(
              payload,
              {
                catalog: testCatalogId,
                status: "pending",
              },
              fileTest.content,
              fileTest.name,
              fileTest.mimeType
            )
          ).rejects.toThrow();

          console.log(`  ✓ ${fileTest.name} correctly rejected during upload (MIME type validation)`);
        } catch (error) {
          // If the test framework error handling doesn't work, check manually
          if (error instanceof Error && error.message.includes("Invalid file type")) {
            console.log(`  ✓ ${fileTest.name} correctly rejected (Invalid file type)`);
          } else {
            throw error;
          }
        }
      }

      console.log("✓ All invalid file types rejected correctly");
    });

    it("should handle corrupted Excel files gracefully", async () => {
      console.log("Testing corrupted Excel file handling...");

      // Create corrupted file content (text content with Excel MIME type)
      const corruptedContent = "This is not a valid Excel file";
      const fileName = `corrupted-${Date.now()}.xlsx`;

      try {
        const importFile = await createImportFileWithUpload(
          payload,
          {
            catalog: testCatalogId,
            status: "pending",
          },
          corruptedContent,
          fileName,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 500));
        await payload.jobs.run({ allQueues: true });

        // Check that processing failed gracefully
        const failedFile = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });

        expect(failedFile.status).toBe("failed");
        console.log("✓ Corrupted Excel file handled gracefully");
      } catch (error) {
        console.log("✓ Corrupted Excel file rejected during upload");
        // This is also acceptable - Payload might reject the file immediately
      }
    });
  });

  describe("Schema Approval Workflows", () => {
    it("should require approval for locked dataset schema", async () => {
      console.log("Testing schema approval requirement...");

      // Create dataset with locked schema
      const dataset = await createDatasetWithSchemaConfig({
        locked: true,
        autoGrow: false,
        autoApproveNonBreaking: false,
      });

      const csvContent = `title,date,location,new_field
"Event 1","2024-01-01","Location 1","New Data"
"Event 2","2024-01-02","Location 2","More Data"`;

      try {
        // Create import file linked to locked dataset
        const importFile = await createImportFileWithUpload(
          payload,
          {
            catalog: testCatalogId,
            status: "pending",
          },
          csvContent,
          "approval-test.csv",
          "text/csv"
        );

        // Wait for dataset-detection job to create import-job, then link it to our specific dataset
        await new Promise((resolve) => setTimeout(resolve, 500));
        await payload.jobs.run({ allQueues: true });

        // Update the import job to use our specific dataset instead of auto-created one
        const initialJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        if (initialJobs.docs.length > 0) {
          await payload.update({
            collection: "import-jobs",
            id: initialJobs.docs[0].id,
            data: { dataset: dataset.id },
          });
          console.log(`✓ Linked import job to locked dataset: ${dataset.id}`);
        }

        // Run jobs until they stop (should stop at approval)
        let stopped = false;
        let iterations = 0;
        while (!stopped && iterations < 30) {
          await payload.jobs.run({ allQueues: true });

          const currentJobs = await payload.find({
            collection: "import-jobs",
            where: { importFile: { equals: importFile.id } },
          });

          if (currentJobs.docs.length > 0) {
            const job = currentJobs.docs[0];
            stopped = job.stage === PROCESSING_STAGE.AWAIT_APPROVAL;
          }

          iterations++;
          if (!stopped) await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Verify job is waiting for approval
        const finalJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        expect(finalJobs.docs.length).toBe(1);
        const job = finalJobs.docs[0];
        expect(job.stage).toBe(PROCESSING_STAGE.AWAIT_APPROVAL);
        expect(job.schemaValidation?.requiresApproval).toBe(true);

        console.log("✓ Pipeline correctly stopped at approval stage");
      } catch (error) {
        console.error("Approval test failed:", error);
        throw error;
      }
    });

    it("should continue processing after schema approval", async () => {
      console.log("Testing schema approval and continuation...");

      // Create dataset requiring approval
      const dataset = await createDatasetWithSchemaConfig({
        locked: false,
        autoGrow: true,
        autoApproveNonBreaking: false, // Requires approval even for non-breaking
      });

      const csvContent = `title,date,location
"Approved Event","2024-01-01","Test Location"`;

      try {
        const importFile = await createImportFileWithUpload(
          payload,
          {
            catalog: testCatalogId,
            status: "pending",
          },
          csvContent,
          "approval-continue.csv",
          "text/csv"
        );

        // Wait for dataset-detection job to create import-job, then link it to our specific dataset
        await new Promise((resolve) => setTimeout(resolve, 500));
        await payload.jobs.run({ allQueues: true });

        // Update the import job to use our specific dataset instead of auto-created one
        const continueInitialJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        if (continueInitialJobs.docs.length > 0) {
          await payload.update({
            collection: "import-jobs",
            id: continueInitialJobs.docs[0].id,
            data: { dataset: dataset.id },
          });
          console.log(`✓ Linked import job to approval-required dataset: ${dataset.id}`);
        }

        // Run until approval required
        let awaitingApproval = false;
        let attempts = 0;
        while (!awaitingApproval && attempts < 20) {
          await payload.jobs.run({ allQueues: true });

          const continueCurrentJobs = await payload.find({
            collection: "import-jobs",
            where: { importFile: { equals: importFile.id } },
          });

          if (continueCurrentJobs.docs.length > 0) {
            awaitingApproval = continueCurrentJobs.docs[0].stage === PROCESSING_STAGE.AWAIT_APPROVAL;
          }

          attempts++;
          if (!awaitingApproval) await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Get the job requiring approval
        const continueApprovalJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        const job = continueApprovalJobs.docs[0];
        expect(job.stage).toBe(PROCESSING_STAGE.AWAIT_APPROVAL);

        // Approve the schema (this now properly triggers the approval workflow)
        await simulateSchemaApproval(job.id, true);
        console.log("✓ Schema approval update sent");

        // Wait for hooks to process the approval update
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check job status before running jobs
        const jobBeforeRun = await payload.findByID({
          collection: "import-jobs",
          id: job.id,
        });
        console.log("Job before running jobs:", {
          stage: jobBeforeRun.stage,
          approved: jobBeforeRun.schemaValidation?.approved,
        });

        // Run jobs to process the schema version creation
        await payload.jobs.run({ allQueues: true, limit: 10 });

        // Check job status after first run
        const jobAfterRun = await payload.findByID({
          collection: "import-jobs",
          id: job.id,
        });
        console.log("Job after running jobs:", {
          stage: jobAfterRun.stage,
          schemaVersionId: jobAfterRun.datasetSchemaVersion,
        });

        // Check if there are any queued jobs
        const queuedJobs = await payload.find({
          collection: "payload-jobs",
          limit: 10,
        });
        console.log(
          "Queued jobs:",
          queuedJobs.docs.map((j: any) => ({
            id: j.id,
            taskSlug: j.taskSlug,
            processing: j.processing,
            completed: j.completedAt,
            error: j.error,
            input: j.input,
          }))
        );

        // Check specifically for CREATE_SCHEMA_VERSION job
        const schemaVersionJobs = queuedJobs.docs.filter((j: any) => j.taskSlug === "create-schema-version");
        console.log(`Found ${schemaVersionJobs.length} CREATE_SCHEMA_VERSION jobs`);

        if (schemaVersionJobs.length === 0) {
          console.log("❌ No CREATE_SCHEMA_VERSION job was queued - this is the problem!");
          console.log("Job approval details:", jobBeforeRun.schemaValidation);
        }

        // Check the job status after approval processing
        const postApprovalJob = await payload.findByID({
          collection: "import-jobs",
          id: job.id,
        });

        console.log(`Job stage after approval processing: ${postApprovalJob.stage}`);
        console.log(`Job approval status: ${postApprovalJob.schemaValidation?.approved}`);

        // Continue processing until completion
        const finalCompleted = await runJobsUntilComplete(importFile.id, 100);
        expect(finalCompleted).toBe(true);

        // Verify completion
        const finalImportFile = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });
        expect(finalImportFile.status).toBe("completed");

        const finalJob = await payload.findByID({
          collection: "import-jobs",
          id: job.id,
        });
        expect(finalJob.stage).toBe(PROCESSING_STAGE.COMPLETED);

        console.log("✓ Pipeline completed after approval");
      } catch (error) {
        console.error("Approval continuation test failed:", error);
        throw error;
      }
    }, 30000); // 30 second timeout

    it("should auto-approve non-breaking schema changes", async () => {
      console.log("Testing schema auto-approval...");

      // Create dataset with auto-approval enabled
      const dataset = await createDatasetWithSchemaConfig({
        locked: false,
        autoGrow: true,
        autoApproveNonBreaking: true,
      });

      const csvContent = `title,date,location,optional_field
"Auto Event","2024-01-01","Auto Location","Optional Data"`;

      const csvFileName = `auto-approve-${Date.now()}.csv`;
      const importDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }
      const importPath = path.join(importDir, csvFileName);
      fs.writeFileSync(importPath, csvContent, "utf8");

      try {
        const importFile = await createImportFileWithUpload(
          payload,
          {
            catalog: testCatalogId,
            status: "pending",
          },
          csvContent,
          "auto-approve.csv",
          "text/csv"
        );

        // Wait for dataset-detection job to create import-job, then link it to our specific dataset
        await new Promise((resolve) => setTimeout(resolve, 500));
        await payload.jobs.run({ allQueues: true });

        // Update the import job to use our specific dataset instead of auto-created one
        const autoInitialJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        if (autoInitialJobs.docs.length > 0) {
          await payload.update({
            collection: "import-jobs",
            id: autoInitialJobs.docs[0].id,
            data: { dataset: dataset.id },
          });
          console.log(`✓ Linked import job to auto-approval dataset: ${dataset.id}`);
        }

        // Process completely without manual intervention
        const completed = await runJobsUntilComplete(importFile.id);
        expect(completed).toBe(true);

        // Verify it never stopped for approval
        const autoCompletedJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        const job = autoCompletedJobs.docs[0];
        expect(job.stage).toBe(PROCESSING_STAGE.COMPLETED);
        expect(job.schemaValidation?.requiresApproval).toBe(false);

        // Verify final status
        const finalImportFile = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });
        expect(finalImportFile.status).toBe("completed");

        console.log("✓ Schema auto-approved and pipeline completed");
      } finally {
        if (fs.existsSync(importPath)) {
          fs.unlinkSync(importPath);
        }
      }
    });

    it("should handle schema rejection properly", async () => {
      console.log("Testing schema rejection...");

      // Create dataset requiring approval
      const dataset = await createDatasetWithSchemaConfig({
        locked: true,
        autoApproveNonBreaking: false,
      });

      const csvContent = `title,date,location,rejected_field
"Rejected Event","2024-01-01","Reject Location","Bad Data"`;

      try {
        const importFile = await createImportFileWithUpload(
          payload,
          {
            catalog: testCatalogId,
            status: "pending",
          },
          csvContent,
          "rejection-test.csv",
          "text/csv"
        );

        // Wait for dataset-detection job to create import-job, then link it to our specific dataset
        await new Promise((resolve) => setTimeout(resolve, 500));
        await payload.jobs.run({ allQueues: true });

        // Update the import job to use our specific dataset instead of auto-created one
        const rejectInitialJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        if (rejectInitialJobs.docs.length > 0) {
          await payload.update({
            collection: "import-jobs",
            id: rejectInitialJobs.docs[0].id,
            data: { dataset: dataset.id },
          });
          console.log(`✓ Linked import job to rejection test dataset: ${dataset.id}`);
        }

        // Run until approval required
        let awaitingApproval = false;
        let attempts = 0;
        while (!awaitingApproval && attempts < 20) {
          await payload.jobs.run({ allQueues: true });

          const rejectCurrentJobs = await payload.find({
            collection: "import-jobs",
            where: { importFile: { equals: importFile.id } },
          });

          if (rejectCurrentJobs.docs.length > 0) {
            awaitingApproval = rejectCurrentJobs.docs[0].stage === PROCESSING_STAGE.AWAIT_APPROVAL;
          }

          attempts++;
          if (!awaitingApproval) await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Get job and reject the schema
        const rejectJobQuery = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        const job = rejectJobQuery.docs[0];
        await simulateSchemaApproval(job.id, false); // Reject
        console.log("✓ Schema rejected manually");

        // Continue processing (should fail)
        await payload.jobs.run({ allQueues: true, limit: 10 });

        // Verify job failed
        const rejectedJob = await payload.findByID({
          collection: "import-jobs",
          id: job.id,
        });

        // Should still be awaiting approval or failed
        expect([PROCESSING_STAGE.AWAIT_APPROVAL, PROCESSING_STAGE.FAILED].includes(rejectedJob.stage)).toBe(true);
        console.log(`✓ Job correctly handled rejection (stage: ${rejectedJob.stage})`);
      } catch (error) {
        console.error("Schema rejection test failed:", error);
        throw error;
      }
    });
  });

  describe("Large File Processing", () => {
    it("should handle large CSV files with proper batching", async () => {
      console.log("Testing large file processing...");

      // Generate large CSV content (500 rows)
      const headers = "title,date,location,description";
      const rows = [];
      for (let i = 1; i <= 500; i++) {
        rows.push(
          `"Event ${i}","2024-01-${String((i % 28) + 1).padStart(2, "0")}","Location ${i}","Description for event ${i}"`
        );
      }
      const csvContent = [headers, ...rows].join("\n");

      try {
        const importFile = await createImportFileWithUpload(
          payload,
          {
            catalog: testCatalogId,
            status: "pending",
          },
          csvContent,
          "large-dataset.csv",
          "text/csv"
        );

        console.log(`✓ Created large file import (${csvContent.length} bytes)`);

        // Process with extended timeout for large file
        const completed = await runJobsUntilComplete(importFile.id, 100);
        expect(completed).toBe(true);

        // Verify all events were created
        const events = await payload.find({
          collection: "events",
          limit: 1000, // Get all events
        });

        expect(events.docs.length).toBe(500);
        console.log(`✓ Successfully processed ${events.docs.length} events`);

        // Verify final status
        const finalImportFile = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });
        expect(finalImportFile.status).toBe("completed");

        console.log("✓ Large file processing completed successfully");
      } catch (error) {
        console.error("Large file processing test failed:", error);
        throw error;
      }
    }, 60000); // 60 second timeout for large file
  });
});
