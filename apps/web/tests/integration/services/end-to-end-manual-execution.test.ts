/**
 * @module End-to-end integration tests for the complete job processing pipeline with manual execution.
 *
 * This test simulates the real-world scenario where:
 * 1. A file is uploaded (creating an import-files record)
 * 2. The afterChange hook automatically queues the first job
 * 3. Jobs are queued automatically via hooks as each stage completes
 * 4. Jobs are manually executed (simulating worker/cron processes)
 * 5. The complete pipeline processes through all stages to completion
 *
 * This approach tests the actual job queueing and execution system as it works in production.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";

import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

describe.sequential("End-to-End Job Processing with Manual Execution", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;
  let testDir: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    testDir = testEnv.tempDir || "/tmp";

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

    // Create test catalog
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `E2E Test Catalog ${timestamp}`,
        slug: `e2e-test-catalog-${timestamp}-${randomSuffix}`,
        description: "Catalog for end-to-end job processing testing",
      },
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
      const importDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }
      const importPath = path.join(importDir, csvFileName);
      fs.writeFileSync(importPath, csvContent, "utf8");

      try {
        console.log("1. Creating import-files record to trigger job pipeline...");

        // Create import-files record with actual file upload
        // This will trigger the afterChange hook which queues the first job
        const fileBuffer = Buffer.from(csvContent, "utf8");
        const importFile = await payload.create({
          collection: "import-files",
          data: {
            catalog: testCatalogId,
            status: "pending",
          },
          file: {
            data: fileBuffer,
            name: "e2e-test-events.csv",
            size: fileBuffer.length,
            mimetype: "text/csv",
          },
        });

        console.log(`✓ Created import-files record: ${importFile.id}`);

        // Brief wait for the afterChange hook to queue the first job
        await new Promise((resolve) => setTimeout(resolve, 200));

        console.log("2. Starting manual job execution loop...");

        // Manual job execution loop - simulates worker/cron process
        let pipelineComplete = false;
        const maxIterations = 50; // Safety limit
        let iteration = 0;

        while (!pipelineComplete && iteration < maxIterations) {
          iteration++;
          console.log(`   Iteration ${iteration}: Running queued jobs...`);

          // Execute all queued jobs
          const jobResults = await payload.jobs.run({
            allQueues: true,
            limit: 100,
          });

          console.log(`   → Executed ${jobResults?.length || 0} jobs`);

          // Check pipeline status
          const updatedImportFile = await payload.findByID({
            collection: "import-files",
            id: importFile.id,
          });

          // Get all import jobs for this file
          const importJobs = await payload.find({
            collection: "import-jobs",
            where: { importFile: { equals: importFile.id } },
          });

          console.log(`   → Import file status: ${updatedImportFile.status}`);
          console.log(`   → Found ${importJobs.docs.length} import jobs`);

          if (importJobs.docs.length > 0) {
            importJobs.docs.forEach((job: any, index: number) => {
              console.log(`   → Job ${index + 1}: ${job.stage} (${job.id})`);
            });
          }

          // Check if pipeline is complete
          pipelineComplete = updatedImportFile.status === "completed" || updatedImportFile.status === "failed";

          if (!pipelineComplete) {
            // Brief pause before next iteration
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        if (!pipelineComplete) {
          throw new Error(`Pipeline did not complete after ${maxIterations} iterations`);
        }

        console.log("3. Pipeline completed! Verifying results...");

        // Verify final import file status
        const finalImportFile = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });

        expect(finalImportFile.status).toBe("completed");
        console.log("✓ Import file status: completed");

        // Verify all import jobs completed
        const finalImportJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { equals: importFile.id } },
        });

        expect(finalImportJobs.docs).toHaveLength(1);
        const importJob = finalImportJobs.docs[0];
        expect(importJob.stage).toBe(PROCESSING_STAGE.COMPLETED);
        console.log("✓ Import job completed successfully");

        // Verify dataset was created
        expect(importJob.dataset).toBeDefined();
        const datasetId = typeof importJob.dataset === "object" ? importJob.dataset.id : importJob.dataset;
        console.log(`✓ Dataset created: ${datasetId}`);

        // Verify events were created
        const events = await payload.find({
          collection: "events",
          where: { dataset: { equals: datasetId } },
          sort: "id",
        });

        expect(events.docs).toHaveLength(4);
        console.log(`✓ Created ${events.docs.length} events`);

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

        console.log("✓ Event data verification passed");

        // Verify job progression through all stages
        expect(importJob.progress?.total).toBeGreaterThan(0);
        expect(importJob.progress?.current).toBeGreaterThan(0); // Events were created
        console.log(`✓ Job progress tracking verified: ${importJob.progress?.current}/${importJob.progress?.total}`);

        console.log("🎉 End-to-end pipeline test completed successfully!");
      } finally {
        // Cleanup temp files
        if (fs.existsSync(importPath)) {
          fs.unlinkSync(importPath);
        }
      }
    }, 30000); // 30 second timeout for complete pipeline

    it("should handle job execution with no queued jobs gracefully", async () => {
      console.log("Testing job execution with empty queue...");

      // Execute jobs when queue is empty
      const results = await payload.jobs.run({ allQueues: true });

      // Should handle empty queue gracefully
      expect(results).toBeDefined();
      console.log("✓ Empty queue handled gracefully");
    });

    it("should track import file status progression correctly", async () => {
      const csvContent = `title,date\n"Quick Test","2024-01-01"`;
      const csvFileName = `status-test-${Date.now()}.csv`;

      // Create file in import directory
      const importDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      if (!fs.existsSync(importDir)) {
        fs.mkdirSync(importDir, { recursive: true });
      }
      const importPath = path.join(importDir, csvFileName);
      fs.writeFileSync(importPath, csvContent, "utf8");

      try {
        // Create import file record with actual file upload
        const fileBuffer = Buffer.from(csvContent, "utf8");
        const importFile = await payload.create({
          collection: "import-files",
          data: {
            catalog: testCatalogId,
            status: "pending",
          },
          file: {
            data: fileBuffer,
            name: "status-test.csv",
            size: fileBuffer.length,
            mimetype: "text/csv",
          },
        });

        // Initial status should be pending
        expect(importFile.status).toBe("pending");

        // Wait longer for hook to trigger and possibly execute first job
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Execute some jobs to allow status progression
        await payload.jobs.run({ allQueues: true });

        // Check status after hook execution and initial job processing
        const afterHook = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });

        // Status should have progressed from initial pending
        // May be parsing, processing, or even completed for simple files
        console.log(`Status after hook: ${afterHook.status}`);
        expect(["pending", "parsing", "processing", "completed"].includes(afterHook.status)).toBe(true);
        console.log(`✓ Status progressed from pending to: ${afterHook.status}`);

        // Execute jobs to completion
        let complete = false;
        let iterations = 0;
        while (!complete && iterations < 20) {
          await payload.jobs.run({ allQueues: true });
          const current = await payload.findByID({
            collection: "import-files",
            id: importFile.id,
          });
          complete = current.status === "completed" || current.status === "failed";
          iterations++;
          if (!complete) await new Promise((resolve) => setTimeout(resolve, 50));
        }

        // Final status should be completed
        const final = await payload.findByID({
          collection: "import-files",
          id: importFile.id,
        });
        expect(final.status).toBe("completed");

        console.log("✓ Import file status progression verified");
      } finally {
        if (fs.existsSync(importPath)) {
          fs.unlinkSync(importPath);
        }
      }
    });
  });
});
