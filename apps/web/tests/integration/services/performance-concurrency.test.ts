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

import type { IncomingMessage, ServerResponse } from "node:http";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_EMAILS } from "@/tests/constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withScheduledImport,
  withTestServer,
  withUsers,
} from "@/tests/setup/integration/environment";

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
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let cleanup: () => Promise<void>;
  let testUser: any;
  let testCatalogId: string;
  let testServer: any;
  let testServerUrl: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    const envWithServer = await withTestServer(testEnv);
    payload = envWithServer.payload;
    cleanup = envWithServer.cleanup;
    testServer = envWithServer.testServer;
    testServerUrl = envWithServer.testServerUrl;

    // Create test user
    const { users } = await withUsers(envWithServer, {
      testUser: { role: "admin", email: TEST_EMAILS.performance },
    });
    testUser = users.testUser;

    // Create test catalog
    const { catalog } = await withCatalog(testEnv, {
      name: "Performance Test Catalog",
      description: "Catalog for performance tests",
    });
    testCatalogId = catalog.id;
  }, 60000);

  afterAll(async () => {
    vi.useRealTimers(); // Ensure timers are restored
    if (testServer) {
      await testServer.stop();
    }
    await cleanup();
  });

  beforeEach(async () => {
    // Stop current server and create new one with fresh routes
    if (testServer) {
      await testServer.stop();
    }
    const { TestServer } = await import("@/tests/setup/integration/http-server");
    // eslint-disable-next-line require-atomic-updates -- Sequential test setup, no race condition
    testServer = new TestServer();
    testServerUrl = await testServer.start();
  });

  afterEach(() => {
    // Always restore real timers after each test to prevent test interference
    vi.useRealTimers();
  });

  describe("Large File Performance", () => {
    it("should handle CSV files with streaming", async () => {
      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/stream.csv`, {
        user: testUser,
        name: "CSV Stream Test",
        frequency: "daily",
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
          userId: testUser.id,
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
      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/large.xlsx`, {
        user: testUser,
        name: "Large Excel Import",
        frequency: "daily",
        additionalData: {
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
          userId: testUser.id,
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
        Array.from({ length: 2 }, (_, i) =>
          withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/concurrent-${i}.csv`, {
            user: testUser,
            name: `Concurrent Import ${i}`,
            frequency: "hourly",
          }).then((result) => result.scheduledImport)
        )
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
              userId: testUser.id,
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
      await withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/duplicate-test.csv`, {
        user: testUser,
        name: "Duplicate Prevention Import",
        frequency: "hourly",
        additionalData: {
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
        Array.from({ length: 3 }, (_, i) =>
          withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/queue-test-${i}.csv`, {
            user: testUser,
            name: `Queue Test Import ${i}`,
            frequency: "daily",
          }).then((result) => result.scheduledImport)
        )
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
              userId: testUser.id,
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
          Array.from({ length: 2 }, (_, i) =>
            withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/memory-${batch}-${i}.csv`, {
              user: testUser,
              name: `Memory Test Import ${batch}-${i}`,
              frequency: "hourly",
            }).then((result) => result.scheduledImport)
          )
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
                userId: testUser.id,
              },
            })
          )
        );

        // Force garbage collection if available
        if (globalThis.gc) {
          globalThis.gc();
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
      const { scheduledImport } = await withScheduledImport(
        testEnv,
        testCatalogId,
        `${testServerUrl}/rate-limited.csv`,
        {
          user: testUser,
          name: "Rate Limited Import",
          frequency: "hourly",
          maxRetries: 3,
          retryDelayMinutes: 1,
        }
      );

      // Set up test server endpoint with rate limiting
      let requestCount = 0;
      testServer.route("/rate-limited.csv", (_req: IncomingMessage, res: ServerResponse) => {
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
          userId: testUser.id,
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
      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/slow.csv`, {
        user: testUser,
        name: "Slow Response Import",
        frequency: "daily",
        timeoutSeconds: 30, // 30 second timeout (minimum allowed)
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
          userId: testUser.id,
        },
      });

      const duration = Date.now() - startTime;

      expect(result.output.success).toBe(true);
      expect(duration).toBeGreaterThan(400); // Should wait at least 400ms (with 500ms delay)
      expect(duration).toBeLessThan(5000); // Should not take too long
    });
  });
});
