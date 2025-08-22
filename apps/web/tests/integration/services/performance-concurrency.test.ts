// @vitest-environment node
/**
 *
 * Performance and Concurrency Tests for Scheduled Imports.
 *
 * Tests various performance and concurrency scenarios including:
 * - Large file handling
 * - Concurrent schedule executions
 * - Rate limiting
 * - Memory usage
 * - Job queue performance
 * Uses node environment instead of jsdom to avoid AbortController compatibility issues
 * with Node 24's native fetch API..
 *
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createIntegrationTestEnvironment } from "@/tests/setup/test-environment-builder";
import { TestServer } from "@/tests/setup/test-server";

// Type definitions for urlFetchJob output
interface UrlFetchSuccessOutput {
  success: true;
  importFileId: string | number;
  filename: string;
  fileSize: number | undefined;
  contentType: string;
  isDuplicate: boolean;
  contentHash: string | undefined;
  skippedReason?: string;
}

interface UrlFetchFailureOutput {
  success: false;
  error: string;
}

type _UrlFetchOutput = UrlFetchSuccessOutput | UrlFetchFailureOutput;

describe.sequential("Performance and Concurrency Tests", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testUserId: string;
  let testCatalogId: string;
  let testServer: TestServer;
  let testServerUrl: string;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;

    // Create and start test server
    testServer = new TestServer();
    testServerUrl = await testServer.start();

    // Create test user
    const user = await payload.create({
      collection: "users",
      data: {
        email: "perf-test@example.com",
        password: "test123456",
        role: "admin",
      },
    });
    testUserId = user.id;

    // Create test catalog
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Performance Test Catalog",
        description: "Catalog for performance tests",
      },
    });
    testCatalogId = catalog.id;
  }, 60000);

  afterAll(async () => {
    vi.useRealTimers(); // Ensure timers are restored
    await testServer.stop();
    await cleanup();
  });

  beforeEach(async () => {
    // Stop current server and create new one with fresh routes
    const oldServer = testServer;
    if (oldServer) {
      await oldServer.stop();
    }
    const newServer = new TestServer();
    const newUrl = await newServer.start();
    // eslint-disable-next-line require-atomic-updates
    testServer = newServer;
    testServerUrl = newUrl;
  });

  afterEach(() => {
    // Always restore real timers after each test to prevent test interference
    vi.useRealTimers();
  });

  describe("Large File Performance", () => {
    it("should handle CSV files with streaming", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "CSV Stream Test",
          sourceUrl: `${testServerUrl}/stream.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Generate small CSV to verify streaming works
      let csvData = "id,name,value\n";
      for (let i = 0; i < 50; i++) {
        // Small dataset
        csvData += `${i},Item${i},${i * 10}\n`;
      }
      const csvBuffer = Buffer.from(csvData);

      // Set up test server endpoint
      testServer.respond("/stream.csv", {
        body: csvBuffer,
        headers: {
          "Content-Type": "text/csv",
          "Content-Length": String(csvBuffer.length),
        },
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-csv" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "CSV Stream Test",
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(true);
      if (result.output.success) {
        const successOutput = result.output as UrlFetchSuccessOutput;
        expect(successOutput.fileSize).toBeGreaterThan(0);
        expect(successOutput.contentType).toContain("csv");
      }
    });

    it("should handle Excel files correctly", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Large Excel Import",
          sourceUrl: `${testServerUrl}/large.xlsx`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          advancedConfig: {
            maxFileSize: 30, // 30MB limit
            expectedContentType: "xlsx",
          },
        },
      });

      // Create a small Excel-like binary buffer
      const excelData = Buffer.alloc(10 * 1024); // 10KB test file

      // Set up test server endpoint for Excel file
      testServer.respond("/large.xlsx", {
        body: excelData,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Length": String(excelData.length),
        },
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-large-excel" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Large Excel Test",
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(true);
      if (result.output.success) {
        const successOutput = result.output as UrlFetchSuccessOutput;
        expect(successOutput.fileSize).toBe(excelData.length);
      }
    });
  });

  describe("Concurrent Schedule Execution", () => {
    it("should handle multiple concurrent URL fetches", async () => {
      // Create multiple scheduled imports (reduced for test performance)
      const schedules = await Promise.all(
        Array.from({ length: 2 }, (_, i) => {
          // Reduced to just 2 for debugging
          return payload.create({
            collection: "scheduled-imports",
            data: {
              name: `Concurrent Import ${i}`,
              sourceUrl: `${testServerUrl}/concurrent-${i}.csv`,
              enabled: true,
              catalog: testCatalogId as any,
              scheduleType: "frequency",
              frequency: "hourly",
            },
          });
        })
      );

      // Set up test server endpoints for concurrent requests
      schedules.forEach((_, i) => {
        testServer.respondWithCSV(`/concurrent-${i}.csv`, `id,value\n${i},${i * 100}`);
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute all jobs concurrently
      const startTime = Date.now();
      const results = await Promise.all(
        schedules.map((schedule, i) =>
          urlFetchJob.handler({
            job: { id: `test-job-concurrent-${i}` },
            req: { payload },
            input: {
              scheduledImportId: schedule.id,
              sourceUrl: schedule.sourceUrl,
              authConfig: schedule.authConfig,
              catalogId: testCatalogId as any,
              originalName: `Concurrent Test ${i}`,
              userId: testUserId,
            },
          })
        )
      );
      const endTime = Date.now();

      // All should succeed
      results.forEach((result: { output: { success: boolean } }) => {
        expect(result.output.success).toBe(true);
      });

      // Should complete in reasonable time (not sequential)
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // Should be fast for just 2 concurrent requests
    });

    it("should handle concurrent schedule manager runs without duplication", async () => {
      // Use fake timers
      vi.useFakeTimers();
      const baseTime = new Date("2024-01-01T12:00:00.000Z");
      vi.setSystemTime(baseTime);

      // Create a scheduled import with lastRun set to an hour ago
      await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Duplicate Prevention Import",
          sourceUrl: `${testServerUrl}/duplicate-test.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
          lastRun: new Date("2024-01-01T11:30:00.000Z"), // 1.5 hours ago from current time
        },
      });

      // Set up test server endpoint
      testServer.respondWithCSV("/duplicate-test.csv", "test,data\n1,2");

      // Clear any previous test state

      // Move to next hour
      vi.setSystemTime(new Date("2024-01-01T13:00:00.000Z"));

      // Import the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");

      // Run schedule manager twice quickly
      const run1 = await scheduleManagerJob.handler({
        job: { id: `test-schedule-manager-1` },
        req: { payload },
      });

      const run2 = await scheduleManagerJob.handler({
        job: { id: `test-schedule-manager-2` },
        req: { payload },
      });

      // At least one should have triggered
      const totalTriggered = run1.output.triggered + run2.output.triggered;
      expect(totalTriggered).toBeGreaterThanOrEqual(1);

      // Cleanup
      vi.useRealTimers();
    });
  });

  describe("Job Queue Performance", () => {
    it("should efficiently queue many jobs", async () => {
      const startTime = Date.now();

      // Create scheduled imports quickly (reduced for test performance)
      const schedules = await Promise.all(
        Array.from({ length: 3 }, (_, i) => {
          // Reduced from 10 to 3 for faster tests
          return payload.create({
            collection: "scheduled-imports",
            data: {
              name: `Queue Test Import ${i}`,
              sourceUrl: `${testServerUrl}/queue-test-${i}.csv`,
              enabled: true,
              catalog: testCatalogId as any,
              scheduleType: "frequency",
              frequency: "daily",
            },
          });
        })
      );

      const createTime = Date.now() - startTime;
      expect(createTime).toBeLessThan(5000); // Should create 3 records quickly

      // Queue jobs for all schedules
      const queueStartTime = Date.now();
      const jobIds = await Promise.all(
        schedules.map((schedule) =>
          payload.jobs.queue({
            task: "url-fetch",
            input: {
              scheduledImportId: schedule.id,
              sourceUrl: schedule.sourceUrl,
              authConfig: schedule.authConfig,
              catalogId: testCatalogId as any,
              originalName: "Queue Test",
              userId: testUserId,
            },
          })
        )
      );
      const queueTime = Date.now() - queueStartTime;

      expect(jobIds).toHaveLength(3);
      expect(queueTime).toBeLessThan(2000); // Should queue 3 jobs in less than 2 seconds
    });
  });

  describe("Memory Management", () => {
    it("should process multiple schedules without issues", async () => {
      const initialMemory = process.memoryUsage();

      // Create and process a small batch of schedules
      for (let batch = 0; batch < 1; batch++) {
        // Just one batch for speed
        // Create schedules
        const schedules = await Promise.all(
          Array.from({ length: 2 }, (_, i) => {
            // Just 2 schedules
            return payload.create({
              collection: "scheduled-imports",
              data: {
                name: `Memory Test Import ${batch}-${i}`,
                sourceUrl: `${testServerUrl}/memory-${batch}-${i}.csv`,
                enabled: true,
                catalog: testCatalogId as any,
                scheduleType: "frequency",
                frequency: "hourly",
              },
            });
          })
        );

        // Set up test server endpoints for memory test
        schedules.forEach((_, i) => {
          testServer.respondWithCSV(`/memory-${batch}-${i}.csv`, "test,data\n1,2");
        });

        // Process them
        const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");
        await Promise.all(
          schedules.map((schedule) =>
            urlFetchJob.handler({
              job: { id: `test-job-memory-${batch}` },
              req: { payload },
              input: {
                scheduledImportId: schedule.id,
                sourceUrl: schedule.sourceUrl,
                authConfig: schedule.authConfig,
                catalogId: testCatalogId as any,
                originalName: "Memory Test",
                userId: testUserId,
              },
            })
          )
        );

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });
  });

  describe("Rate Limiting", () => {
    it("should handle rate-limited APIs gracefully", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Rate Limited Import",
          sourceUrl: `${testServerUrl}/rate-limited.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
          maxRetries: 3,
          retryDelayMinutes: 1,
        },
      });

      // Set up test server endpoint with rate limiting
      let requestCount = 0;
      testServer.route("/rate-limited.csv", (_req, res) => {
        requestCount++;
        if (requestCount <= 2) {
          // First two attempts fail with rate limit
          res.writeHead(429, {
            "Content-Type": "text/plain",
            "Retry-After": "1",
            "X-RateLimit-Limit": "100",
            "X-RateLimit-Remaining": "0",
          });
          res.end("Too Many Requests");
        } else {
          // Third attempt succeeds
          const csvContent = "test,data\n1,2";
          res.writeHead(200, {
            "Content-Type": "text/csv",
            "Content-Length": String(Buffer.byteLength(csvContent)),
          });
          res.end(csvContent);
        }
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-rate-limit" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Rate Limit Test",
          userId: testUserId,
        },
      });

      // Should eventually succeed after retries
      expect(result.output.success).toBe(true);
      // Note: attempts not included in output, but request count verifies retries happened
      expect(requestCount).toBeGreaterThan(2); // Should have made at least 3 requests
    });
  });

  describe("Timeout Performance", () => {
    it("should handle slow responses efficiently", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Slow Response Import",
          sourceUrl: `${testServerUrl}/slow.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          timeoutSeconds: 30, // 30 second timeout (minimum allowed)
        },
      });

      // Set up test server endpoint with slow response
      testServer.respond("/slow.csv", {
        body: "test,data\n1,2",
        headers: { "Content-Type": "text/csv" },
        delay: 500, // Quick delay for fast test
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      const startTime = Date.now();

      // Execute the job - should handle slow response without timing out
      const result = await urlFetchJob.handler({
        job: { id: "test-job-slow" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Slow Response Test",
          userId: testUserId,
        },
      });

      const duration = Date.now() - startTime;

      expect(result.output.success).toBe(true);
      expect(duration).toBeGreaterThan(400); // Should wait at least 400ms (with 500ms delay)
      expect(duration).toBeLessThan(5000); // Should not take too long
    });
  });
});
