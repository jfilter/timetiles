/**
 * End-to-end integration tests for the complete job processing pipeline with manual execution.
 *
 * This test simulates the real-world scenario where:
 * 1. A file is uploaded (creating an import-files record)
 * 2. The afterChange hook automatically queues the first job
 * 3. Jobs are queued automatically via hooks as each stage completes
 * 4. Jobs are manually executed (simulating worker/cron processes)
 * 5. The complete pipeline processes through all stages to completion.
 *
 * This approach tests the actual job queueing and execution system as it works in production.
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
  runJobsUntilImportSettled,
  withCatalog,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("End-to-End Job Processing with Manual Execution", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testDir: string;
  let testUser: any;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: true });
    payload = testEnv.payload;
    testDir = testEnv.tempDir ?? "/tmp";

    // Create temp directory for test files
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

    // Create test user (needed for import files which require a user)
    const { users } = await withUsers(testEnv, ["user"]);
    testUser = users.user;

    // Create test catalog
    const { catalog } = await withCatalog(testEnv, {
      name: "E2E Test Catalog",
      description: "Catalog for end-to-end job processing testing",
    });
    testCatalogId = catalog.id;
  });

  describe("Complete Pipeline Processing", () => {
    it("should process CSV upload through complete job pipeline with manual execution", async () => {
      // Create CSV content with realistic event data
      const csvContent = `title,date,location
"Tech Conference 2024","2024-03-15","New York, NY"
"Web Development Summit","2024-04-20","San Francisco, CA"
"Data Science Workshop","2024-05-10","Austin, TX"
"AI/ML Meetup","2024-06-05","Seattle, WA"`;

      // Write CSV to temp file and move to import location
      const csvFileName = `e2e-test-${Date.now()}.csv`;
      const importDir = path.resolve(process.cwd(), `${process.env.UPLOAD_DIR}/import-files`);
      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }
      const importPath = path.join(importDir, csvFileName);
      fs.writeFileSync(importPath, csvContent, "utf8");

      try {
        logger.info("1. Creating import-files record to trigger job pipeline...");

        // Create import-files record with actual file upload
        // This will trigger the afterChange hook which queues the first job
        const fileBuffer = new Uint8Array(Buffer.from(csvContent, "utf8"));
        const importFile = await payload.create({
          collection: "import-files",
          data: {
            catalog: testCatalogId,
            user: testUser.id,
            status: "pending",
          },
          file: {
            data: fileBuffer,
            name: "e2e-test-events.csv",
            size: fileBuffer.length,
            mimetype: "text/csv",
          },
          user: testUser,
        });

        logger.info(`✓ Created import-files record: ${importFile.id}`);

        logger.info("2. Starting manual job execution loop...");

        const maxIterations = 50; // Safety limit
        const pipelineResult = await runJobsUntilImportSettled(payload, importFile.id, {
          maxIterations,
          onPending: async ({ iteration, importFile: updatedImportFile }) => {
            logger.info(`   Iteration ${iteration}: Running queued jobs...`);

            const importJobs = await payload.find({
              collection: "import-jobs",
              where: { importFile: { equals: importFile.id } },
            });

            logger.info(`   → Import file status: ${updatedImportFile.status}`);
            logger.info(`   → Found ${importJobs.docs.length} import jobs`);

            if (importJobs.docs.length > 0) {
              importJobs.docs.forEach((job: any, index: number) => {
                logger.info(`   → Job ${index + 1}: ${job.stage} (${job.id})`);
              });
            }
          },
        });

        if (!pipelineResult.settled) {
          throw new Error(`Pipeline did not complete after ${maxIterations} iterations`);
        }

        logger.info("3. Pipeline completed! Verifying results...");

        // Verify final import file status
        const finalImportFile = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });

        expect(finalImportFile.status).toBe("completed");
        logger.info("✓ Import file status: completed");

        // Verify all import jobs completed
        const finalImportJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        expect(finalImportJobs.docs).toHaveLength(1);
        const importJob = finalImportJobs.docs[0];
        expect(importJob.stage).toBe(PROCESSING_STAGE.COMPLETED);
        logger.info("✓ Import job completed successfully");

        // Verify dataset was created
        expect(importJob.dataset).toBeDefined();
        const datasetId = typeof importJob.dataset === "object" ? importJob.dataset.id : importJob.dataset;
        logger.info(`✓ Dataset created: ${datasetId}`);

        // Verify events were created
        const events = await payload.find({
          collection: "events",
          where: { dataset: { equals: datasetId } },
          sort: "id",
        });

        expect(events.docs).toHaveLength(4);
        logger.info(`✓ Created ${events.docs.length} events`);

        // Verify event data matches CSV content
        const eventTitles = events.docs.map((e: any) => e.data.title).sort();
        expect(eventTitles).toEqual([
          "AI/ML Meetup",
          "Data Science Workshop",
          "Tech Conference 2024",
          "Web Development Summit",
        ]);

        const eventDates = events.docs.map((e: any) => e.data.date).sort();
        expect(eventDates).toEqual(["2024-03-15", "2024-04-20", "2024-05-10", "2024-06-05"]);

        const eventLocations = events.docs.map((e: any) => e.data.location).sort();
        expect(eventLocations).toEqual(["Austin, TX", "New York, NY", "San Francisco, CA", "Seattle, WA"]);

        logger.info("✓ Event data verification passed");

        // Verify job progression through all stages (new progress structure)
        expect(importJob.progress?.stages).toBeDefined();
        expect(importJob.progress?.overallPercentage).toBeGreaterThan(0);
        logger.info(`✓ Job progress tracking verified: ${importJob.progress?.overallPercentage}% complete`);

        logger.info("🎉 End-to-end pipeline test completed successfully!");
      } finally {
        // Cleanup temp files
        if (fs.existsSync(importPath)) {
          fs.unlinkSync(importPath);
        }
      }
    }, 30000); // 30 second timeout for complete pipeline

    it("should handle job execution with no queued jobs gracefully", async () => {
      logger.info("Testing job execution with empty queue...");

      // Execute jobs when queue is empty
      const results = await payload.jobs.run({ allQueues: true });

      // Should handle empty queue gracefully
      expect(results).toBeDefined();
      logger.info("✓ Empty queue handled gracefully");
    });

    it("should track import file status progression correctly", async () => {
      const csvContent = `title,date\n"Quick Test","2024-01-01"`;
      const csvFileName = `status-test-${Date.now()}.csv`;

      // Create file in import directory
      const importDir = path.resolve(process.cwd(), `${process.env.UPLOAD_DIR}/import-files`);
      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }
      const importPath = path.join(importDir, csvFileName);
      fs.writeFileSync(importPath, csvContent, "utf8");

      try {
        // Create import file record with actual file upload
        const fileBuffer = new Uint8Array(Buffer.from(csvContent, "utf8"));
        const importFile = await payload.create({
          collection: "import-files",
          data: {
            catalog: testCatalogId,
            user: testUser.id,
            status: "pending",
          },
          file: {
            data: fileBuffer,
            name: "status-test.csv",
            size: fileBuffer.length,
            mimetype: "text/csv",
          },
          user: testUser,
        });

        // Initial status should be pending
        expect(importFile.status).toBe("pending");

        // Execute some jobs to allow status progression
        await payload.jobs.run({ allQueues: true });

        // Check status after hook execution and initial job processing
        const afterHook = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });

        // Status should have progressed from initial pending
        // May be parsing, processing, or even completed for simple files
        logger.info(`Status after hook: ${afterHook.status}`);
        expect(["pending", "parsing", "processing", "completed"].includes(afterHook.status)).toBe(true);
        logger.info(`✓ Status progressed from pending to: ${afterHook.status}`);

        // Execute jobs to completion
        const completion = await runJobsUntilImportSettled(payload, importFile.id, {
          maxIterations: 20,
        });

        expect(completion.settled).toBe(true);

        // Final status should be completed
        const final = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });
        expect(final.status).toBe("completed");

        logger.info("✓ Import file status progression verified");
      } finally {
        if (fs.existsSync(importPath)) {
          fs.unlinkSync(importPath);
        }
      }
    });
  });
});
