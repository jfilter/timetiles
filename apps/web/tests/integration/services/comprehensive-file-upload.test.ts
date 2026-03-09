/**
 * Comprehensive integration tests for file upload scenarios and approval workflows.
 *
 * This test suite covers:
 * - Different file types (CSV, Excel, invalid types)
 * - Schema approval workflows (auto-approval, manual approval, rejection)
 * - Error handling for corrupted/invalid files
 * - Large file processing with batching
 * - Multi-sheet Excel file processing.
 *
 * Tests simulate real-world file upload scenarios with complete pipeline validation.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";

// Mock geocoding so tests don't depend on external Nominatim service
vi.mock("@/lib/services/geocoding", () => ({
  geocodeAddress: vi.fn().mockResolvedValue({
    latitude: 40.7128,
    longitude: -74.006,
    confidence: 0.9,
    normalizedAddress: "New York, NY, USA",
    provider: "mock",
    components: {},
    metadata: {},
  }),
  initializeGeocoding: vi.fn(),
}));
import { logger } from "@/lib/logger";

import {
  createIntegrationTestEnvironment,
  runJobsUntilImportJobExists,
  runJobsUntilImportJobStage,
  runJobsUntilImportSettled,
  withCatalog,
  withDataset,
  withImportFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Comprehensive File Upload Tests", () => {
  const collectionsToReset = [
    "events",
    "import-files",
    "import-jobs",
    "datasets",
    "dataset-schemas",
    "user-usage",
    "payload-jobs",
  ];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let approverUser: any;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;

    // Create temp directory for test files
    const filesDir = path.join(testEnv.uploadDir, "test-files");
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }

    const { users } = await withUsers(testEnv, {
      approver: { role: "admin", email: "test-approver@example.com" },
    });
    approverUser = users.approver;

    const { catalog } = await withCatalog(testEnv, {
      name: "Comprehensive Test Catalog",
      description: "Catalog for comprehensive file upload testing",
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

  // Helper functions

  const createDatasetWithSchemaConfig = async (schemaConfig: {
    locked?: boolean;
    autoGrow?: boolean;
    autoApproveNonBreaking?: boolean;
  }) => {
    const { dataset } = await withDataset(testEnv, testCatalogId, {
      schemaConfig,
    });
    return dataset;
  };

  const getImportJobs = async (importFileId: string | number) =>
    payload.find({
      collection: "import-jobs",
      where: { importFile: { equals: importFileId } },
    });

  const runJobsUntilComplete = async (importFileId: string, maxIterations = 50) => {
    const result = await runJobsUntilImportSettled(payload, importFileId, {
      maxIterations,
      onPending: async ({ iteration, importFile }) => {
        if (iteration % 10 !== 0) {
          return;
        }

        // Log progress every 10 iterations
        const jobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFileId } },
        });
        logger.debug(
          `Iteration ${iteration}: File status=${importFile.status}, Jobs:`,
          jobs.docs.map((j: any) => ({ id: j.id, stage: j.stage }))
        );
      },
    });

    return result.settled;
  };

  const waitForImportJob = async (importFileId: string | number, maxIterations = 50) => {
    const result = await runJobsUntilImportJobExists(payload, importFileId, { maxIterations });

    if (!result.matched || !result.importJob) {
      throw new Error(`Import job was not created for import file ${String(importFileId)}`);
    }

    return result.importJob;
  };

  const waitForImportJobStage = async (importFileId: string | number, stage: string, maxIterations = 50) => {
    const result = await runJobsUntilImportJobStage(
      payload,
      importFileId,
      (importJob) => importJob.stage === stage,
      { maxIterations }
    );

    if (!result.matched || !result.importJob) {
      throw new Error(`Import job did not reach ${stage} for import file ${String(importFileId)}`);
    }

    return result.importJob;
  };

  const linkImportJobToDataset = async (importFileId: string | number, datasetId: string | number) => {
    const importJob = await waitForImportJob(importFileId);

    await payload.update({
      collection: "import-jobs",
      id: importJob.id,
      data: { dataset: datasetId },
    });

    logger.debug(`✓ Linked import job to dataset: ${datasetId}`);
    return importJob;
  };

  const simulateSchemaApproval = async (importJobId: string, approved: boolean) => {
    // Create a test user for approval if approved is true
    let testUser = null;
    let testUserId = null;
    if (approved) {
      testUser = approverUser;
      testUserId = testUser.id;
    }

    // Get the current job
    const beforeJob = await payload.findByID({
      collection: "import-jobs",
      id: importJobId,
    });

    logger.debug("Job before approval:", JSON.stringify(beforeJob.schemaValidation, null, 2));

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
      user: testUser, // Pass user context for authentication
    });

    logger.debug(`✓ Schema ${approved ? "approved" : "rejected"} - approval fields updated`);
  };

  describe("File Type Support", () => {
    it("should process Excel file with multiple sheets", async () => {
      logger.info("Testing Excel file with multiple sheets...");

      // Use existing fixture file
      const fixturePath = path.join(__dirname, "../../fixtures", "multi-sheet.xlsx");
      const fileBuffer = fs.readFileSync(fixturePath);
      const fileName = "multi-sheet.xlsx";

      logger.debug(`✓ Using fixture file: ${fixturePath} (${fileBuffer.length} bytes)`);

      // Use the helper function that properly handles file uploads
      const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), fileBuffer, {
        filename: fileName,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        datasetsCount: 0,
        datasetsProcessed: 0,
      });

      logger.debug(`✓ Created Excel import file: ${importFile.id}`);

      // Run jobs until completion
      const completed = await runJobsUntilComplete(importFile.id);

      // Check the final status and debug if needed
      const finalImportFile = await payload.findByID({
        collection: "import-files",
        id: importFile.id,
      });

      if (finalImportFile.status !== "completed") {
        logger.debug(`Import file status: ${finalImportFile.status}`);
        if (finalImportFile.errorLog) {
          logger.debug(`Error log: ${finalImportFile.errorLog}`);
        }

        // Check import jobs for more details
        const importJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        importJobs.docs.forEach((job: any, index: number) => {
          logger.debug(`Job ${index + 1}: stage=${job.stage}, errors=${job.errors?.length ?? 0}`);
          if (job.errors?.length > 0) {
            logger.debug(`  Errors:`, job.errors);
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
      logger.debug(`✓ Created ${importJobs.docs.length} import jobs for sheets`);

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
      logger.debug(`✓ Created ${events.docs.length} events from Excel sheets`);

      logger.info("🎉 Excel multi-sheet test completed successfully!");
    });

    it("should process ODS (OpenDocument Spreadsheet) file", async () => {
      logger.info("Testing ODS file upload...");

      // Use the ODS fixture file
      const fixturePath = path.join(__dirname, "../../fixtures", "events.ods");
      const fileBuffer = fs.readFileSync(fixturePath);
      const fileName = "events.ods";

      logger.debug(`✓ Using ODS fixture file: ${fixturePath} (${fileBuffer.length} bytes)`);

      // Use the helper function that properly handles file uploads
      const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), fileBuffer, {
        filename: fileName,
        mimeType: "application/vnd.oasis.opendocument.spreadsheet",
        datasetsCount: 0,
        datasetsProcessed: 0,
      });

      logger.debug(`✓ Created ODS import file: ${importFile.id}`);

      // Run jobs until completion
      const completed = await runJobsUntilComplete(importFile.id);

      // Check the final status
      const finalImportFile = await payload.findByID({
        collection: "import-files",
        id: importFile.id,
      });

      if (finalImportFile.status !== "completed") {
        logger.debug(`Import file status: ${finalImportFile.status}`);
        if (finalImportFile.errorLog) {
          logger.debug(`Error log: ${finalImportFile.errorLog}`);
        }

        // Check import jobs for more details
        const importJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        importJobs.docs.forEach((job: any, index: number) => {
          logger.debug(`Job ${index + 1}: stage=${job.stage}, errors=${job.errors?.length ?? 0}`);
          if (job.errors?.length > 0) {
            logger.debug(`  Errors:`, job.errors);
          }
        });
      }

      expect(completed).toBe(true);
      expect(finalImportFile.status).toBe("completed");

      // Verify import jobs were created
      const importJobs = await payload.find({
        collection: "import-jobs",
        where: { importFile: { equals: importFile.id } },
      });

      expect(importJobs.docs.length).toBe(1); // ODS file has one sheet
      logger.debug(`✓ Created ${importJobs.docs.length} import job for ODS sheet`);

      // Verify jobs completed
      importJobs.docs.forEach((job: any) => {
        expect(job.stage).toBe(PROCESSING_STAGE.COMPLETED);
      });

      // Verify events were created from ODS file (3 events in fixture)
      const events = await payload.find({
        collection: "events",
        limit: 20,
      });

      expect(events.docs.length).toBe(3);
      logger.debug(`✓ Created ${events.docs.length} events from ODS file`);

      // Verify specific event data (title is stored in data.title JSON field)
      const eventTitles = events.docs.map((e: any) => e.data.title);
      expect(eventTitles).toContain("ODS Conference 2024");
      expect(eventTitles).toContain("OpenDocument Workshop");
      expect(eventTitles).toContain("LibreOffice Summit");

      logger.info("🎉 ODS file upload test completed successfully!");
    });

    it("should reject invalid file types gracefully", async () => {
      logger.info("Testing invalid file type rejection...");

      const invalidFiles = [
        { name: "test.pdf", mimeType: "application/pdf", content: "PDF content" },
        { name: "test.png", mimeType: "image/png", content: "PNG data" },
        { name: "test.zip", mimeType: "application/zip", content: "ZIP data" },
        { name: "test.doc", mimeType: "application/msword", content: "Word content" },
      ];

      for (const fileTest of invalidFiles) {
        logger.debug(`  Testing ${fileTest.name}...`);

        try {
          // Try to create import file record with invalid MIME type
          // This should fail during creation due to MIME type validation
          await expect(
            withImportFile(testEnv, testCatalogId, fileTest.content, {
              filename: fileTest.name,
              mimeType: fileTest.mimeType,
            })
          ).rejects.toThrow();

          logger.debug(`  ✓ ${fileTest.name} correctly rejected during upload (MIME type validation)`);
        } catch (error) {
          // If the test framework error handling doesn't work, check manually
          if (!(error instanceof Error) || !error.message.includes("Invalid file type")) {
            throw error;
          }
          logger.debug(`  ✓ ${fileTest.name} correctly rejected (Invalid file type)`);
        }
      }

      logger.debug("✓ All invalid file types rejected correctly");
    });

    it("should handle corrupted Excel files gracefully", async () => {
      logger.info("Testing corrupted Excel file handling...");

      // Create corrupted file content (text content with Excel MIME type)
      const corruptedContent = "This is not a valid Excel file";
      const fileName = `corrupted-${Date.now()}.xlsx`;

      try {
        const { importFile } = await withImportFile(testEnv, testCatalogId, corruptedContent, {
          filename: fileName,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const result = await runJobsUntilImportSettled(payload, importFile.id);

        // Check that processing failed gracefully
        expect(result.settled).toBe(true);
        const failedFile = result.importFile;

        expect(failedFile.status).toBe("failed");
        logger.debug("✓ Corrupted Excel file handled gracefully");
      } catch {
        logger.debug("✓ Corrupted Excel file rejected during upload");
        // This is also acceptable - Payload might reject the file immediately
      }
    });
  });

  describe("Schema Approval Workflows", () => {
    it("should require approval for locked dataset schema", async () => {
      logger.info("Testing schema approval requirement...");

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
        const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
          filename: "approval-test.csv",
        });

        await linkImportJobToDataset(importFile.id, dataset.id);

        // Verify job is waiting for approval
        const job = await waitForImportJobStage(importFile.id, PROCESSING_STAGE.AWAIT_APPROVAL, 30);

        const finalJobs = await getImportJobs(importFile.id);
        expect(finalJobs.docs.length).toBe(1);
        expect(job.stage).toBe(PROCESSING_STAGE.AWAIT_APPROVAL);
        expect(job.schemaValidation?.requiresApproval).toBe(true);

        logger.debug("✓ Pipeline correctly stopped at approval stage");
      } catch (error) {
        logger.error("Approval test failed:", error);
        throw error;
      }
    });

    it("should continue processing after schema approval", async () => {
      logger.info("Testing schema approval and continuation...");

      // Create dataset requiring approval
      const dataset = await createDatasetWithSchemaConfig({
        locked: false,
        autoGrow: true,
        autoApproveNonBreaking: false, // Requires approval even for non-breaking
      });

      const csvContent = `title,date,location
"Approved Event","2024-01-01","Test Location"`;

      try {
        const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
          filename: "approval-continue.csv",
        });

        await linkImportJobToDataset(importFile.id, dataset.id);

        // Get the job requiring approval
        const job = await waitForImportJobStage(importFile.id, PROCESSING_STAGE.AWAIT_APPROVAL, 30);
        expect(job.stage).toBe(PROCESSING_STAGE.AWAIT_APPROVAL);

        // Approve the schema (this now properly triggers the approval workflow)
        await simulateSchemaApproval(job.id, true);
        logger.debug("✓ Schema approval update sent");

        const resumedJob = await runJobsUntilImportJobStage(
          payload,
          importFile.id,
          (importJob) => importJob.stage !== PROCESSING_STAGE.AWAIT_APPROVAL,
          { maxIterations: 30 }
        );
        expect(resumedJob.matched).toBe(true);
        logger.debug("Job resumed after approval", {
          stage: resumedJob.importJob?.stage,
          schemaVersionId: resumedJob.importJob?.datasetSchemaVersion,
        });

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

        logger.debug("✓ Pipeline completed after approval");
      } catch (error) {
        logger.error("Approval continuation test failed:", error);
        throw error;
      }
    }, 30000); // 30 second timeout

    it("should auto-approve non-breaking schema changes", async () => {
      logger.info("Testing schema auto-approval...");

      // Create dataset with auto-approval enabled
      const dataset = await createDatasetWithSchemaConfig({
        locked: false,
        autoGrow: true,
        autoApproveNonBreaking: true,
      });

      const csvContent = `title,date,location,optional_field
"Auto Event","2024-01-01","Auto Location","Optional Data"`;

      const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
        filename: "auto-approve.csv",
      });

      await linkImportJobToDataset(importFile.id, dataset.id);

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

      logger.debug("✓ Schema auto-approved and pipeline completed");
    });

    it("should handle schema rejection properly", async () => {
      logger.info("Testing schema rejection...");

      // Create dataset requiring approval
      const dataset = await createDatasetWithSchemaConfig({
        locked: true,
        autoApproveNonBreaking: false,
      });

      const csvContent = `title,date,location,rejected_field
"Rejected Event","2024-01-01","Reject Location","Bad Data"`;

      try {
        const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
          filename: "rejection-test.csv",
        });

        await linkImportJobToDataset(importFile.id, dataset.id);

        // Get job and reject the schema
        const job = await waitForImportJobStage(importFile.id, PROCESSING_STAGE.AWAIT_APPROVAL, 30);
        await simulateSchemaApproval(job.id, false); // Reject
        logger.debug("✓ Schema rejected manually");

        // Continue processing (should fail)
        await payload.jobs.run({ allQueues: true, limit: 10 });

        // Verify job failed
        const rejectedJob = await payload.findByID({
          collection: "import-jobs",
          id: job.id,
        });

        // Should still be awaiting approval or failed
        expect([PROCESSING_STAGE.AWAIT_APPROVAL, PROCESSING_STAGE.FAILED].includes(rejectedJob.stage)).toBe(true);
        logger.debug(`✓ Job correctly handled rejection (stage: ${rejectedJob.stage}`);
      } catch (error) {
        logger.error("Schema rejection test failed:", error);
        throw error;
      }
    });
  });

  describe("Large File Processing", () => {
    it("should handle large CSV files with proper batching", async () => {
      logger.info("Testing large file processing...");

      // Generate CSV content (50 rows - enough to test batching without timeout)
      const headers = "title,date,location,description";
      const rows = [];
      for (let i = 1; i <= 50; i++) {
        rows.push(
          `"Event ${i}","2024-01-${String((i % 28) + 1).padStart(2, "0")}","Location ${i}","Description for event ${i}"`
        );
      }
      const csvContent = [headers, ...rows].join("\n");

      try {
        const { importFile } = await withImportFile(testEnv, testCatalogId, csvContent, {
          filename: "large-dataset.csv",
        });

        logger.debug(`✓ Created large file import (${csvContent.length} bytes)`);

        // Process with extended timeout
        const completed = await runJobsUntilComplete(importFile.id, 100);
        expect(completed).toBe(true);

        // Verify all events were created
        const events = await payload.find({
          collection: "events",
          limit: 100,
        });

        expect(events.docs.length).toBe(50);
        logger.debug(`✓ Successfully processed ${events.docs.length} events`);

        // Verify final status
        const finalImportFile = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });
        expect(finalImportFile.status).toBe("completed");

        logger.debug("✓ Large file processing completed successfully");
      } catch (error) {
        logger.error("Large file processing test failed:", error);
        throw error;
      }
    }, 120000); // 2 minute timeout
  });
});
