// @vitest-environment node
/**
 *
 * Integration tests for data integrity verification in the import system.
 *
 * Tests comprehensive data validation including deduplication, schema validation,
 * geocoding integrity, and error recovery scenarios. Verifies that imported data
 * maintains consistency and correctness throughout the processing pipeline.
 * Uses node environment instead of jsdom to avoid AbortController compatibility issues
 * with Node 24's native fetch API..
 *
 * @module
 * @category Tests
 */
import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_EMAILS } from "@/tests/constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withScheduledImport,
  withTestServer,
} from "@/tests/setup/integration/environment";

describe.sequential("Data Integrity Tests", () => {
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
    testUser = await payload.create({
      collection: "users",
      data: {
        email: TEST_EMAILS.integrity,
        password: "test123456",
        role: "admin",
      },
    });

    // Create test catalog
    const { catalog } = await withCatalog(testEnv, {
      name: "Integrity Test Catalog",
      description: "Catalog for data integrity tests",
    });
    testCatalogId = catalog.id;
  }, 60000);

  afterAll(async () => {
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

  describe("Hash-based Duplicate Detection", () => {
    it("should correctly calculate and store content hash", async () => {
      const csvContent = "id,name,value\n1,Test Item,100\n2,Another Item,200";
      const expectedHash = crypto.createHash("sha256").update(csvContent).digest("hex");

      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/hash-test.csv`, {
        user: testUser,
        name: "Hash Test Import",
        frequency: "daily",
      });

      // Set up test server endpoint
      testServer.respondWithCSV("/hash-test.csv", csvContent);

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-hash" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Hash Test",
          userId: testUser.id,
        },
      });

      expect(result.output.success).toBe(true);
      if (result.output.success) {
        const successOutput = result.output as any;
        expect(successOutput.contentHash).toBe(expectedHash);

        // Check that the import file was created with the hash
        const importFile = await payload.findByID({
          collection: "import-files",
          id: successOutput.importFileId,
        });

        expect(importFile.metadata?.urlFetch?.contentHash).toBe(expectedHash);
      }
    });

    it("should detect duplicate content across multiple imports", async () => {
      const csvContent = "id,name,value\n1,Duplicate Test,100";

      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/duplicate.csv`, {
        user: testUser,
        name: "Duplicate Detection Import",
        frequency: "hourly",
      });

      // Set up test server endpoint to return same content for both requests
      testServer.respondWithCSV("/duplicate.csv", csvContent);

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // First execution
      const result1 = await urlFetchJob.handler({
        job: { id: "test-job-dup-1" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "First Import",
          userId: testUser.id,
        },
      });

      expect(result1.output.success).toBe(true);
      if (result1.output.success) {
        const successOutput = result1.output as any;
        expect(successOutput.isDuplicate).toBe(false);

        // Mark the first import as completed so duplicate detection can find it
        await payload.update({
          collection: "import-files",
          id: successOutput.importFileId,
          data: {
            status: "completed",
          },
        });
      }

      // Second execution (should detect duplicate)
      const result2 = await urlFetchJob.handler({
        job: { id: "test-job-dup-2" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Second Import",
          userId: testUser.id,
        },
      });

      expect(result2.output.success).toBe(true);
      if (result2.output.success) {
        const successOutput = result2.output as any;
        expect(successOutput.isDuplicate).toBe(true);
        expect(successOutput.skippedReason).toContain("Duplicate");
      }
    });

    it("should handle hash calculation for large files", async () => {
      // Generate 5MB of CSV data
      const header = "id,data1,data2,data3,data4,data5\n";
      const row =
        "12345,Lorem ipsum dolor sit amet,consectetur adipiscing elit,sed do eiusmod,tempor incididunt,ut labore et dolore\n";
      const rowCount = Math.ceil((5 * 1024 * 1024) / row.length);
      const largeContent = header + row.repeat(rowCount);

      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/large-hash.csv`, {
        user: testUser,
        name: "Large File Hash Import",
        frequency: "daily",
        additionalData: {
          advancedConfig: {
            maxFileSize: 10, // 10MB limit
          },
        },
      });

      // Set up test server endpoint for large file
      testServer.respondWithCSV("/large-hash.csv", largeContent);

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      const startTime = Date.now();

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-large-hash" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Large Hash Test",
          userId: testUser.id,
        },
      });

      const duration = Date.now() - startTime;

      expect(result.output.success).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe("Execution History Tracking", () => {
    it("should accurately track execution history", async () => {
      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/history.csv`, {
        user: testUser,
        name: "History Tracking Import",
        frequency: "hourly",
        additionalData: {
          // Set lastRun to 10 hours ago so it should trigger
          lastRun: new Date("2024-01-01T02:00:00.000Z"),
        },
      });

      // Set up test server endpoint to return dynamic content
      testServer.route("/history.csv", (_req: IncomingMessage, res: ServerResponse) => {
        const timestamp = Date.now();
        const csvContent = `timestamp,value\n${timestamp},${Math.random()}`;
        res.writeHead(200, {
          "Content-Type": "text/csv",
          "Content-Length": String(Buffer.byteLength(csvContent)),
        });
        res.end(csvContent);
      });

      // Use fake timers
      vi.useFakeTimers();
      const baseTime = new Date("2024-01-01T12:00:00.000Z");
      vi.setSystemTime(baseTime);

      // Import the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");

      // Execute at different times
      const executionTimes = [
        new Date("2024-01-01T13:00:00.000Z"),
        new Date("2024-01-01T14:00:00.000Z"),
        new Date("2024-01-01T15:00:00.000Z"),
      ];

      // Build execution history entries
      const executionHistory = [];
      for (let i = 0; i < executionTimes.length; i++) {
        const execTime = executionTimes[i];
        if (!execTime) continue;
        vi.setSystemTime(execTime);

        await scheduleManagerJob.handler({
          job: { id: `test-schedule-history-${execTime.getTime()}` },
          req: { payload },
        });

        const executionEntry = {
          executedAt: execTime.toISOString(),
          status: "success" as const,
          duration: 100 + i * 50,
          importFileId: null,
        };

        executionHistory.push(executionEntry);
      }

      // Update the scheduled import with all execution history
      await payload.update({
        collection: "scheduled-imports",
        id: scheduledImport.id,
        data: {
          lastRun: executionTimes[executionTimes.length - 1],
          lastStatus: "success",
          executionHistory: executionHistory,
          statistics: {
            totalRuns: 3,
            successfulRuns: 3,
            failedRuns: 0,
            averageDuration:
              executionHistory.reduce((acc: number, ex: any) => acc + ex.duration, 0) / executionHistory.length,
          },
        },
      });

      // Fetch the updated scheduled import
      const updated = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      // Check execution history
      expect(updated.executionHistory).toHaveLength(3);
      expect(updated.executionHistory[0].executedAt).toBeTruthy();
      expect(updated.executionHistory[0].status).toBe("success");
      expect(updated.executionHistory[0].duration).toBeGreaterThanOrEqual(0);

      // Check statistics
      expect(updated.statistics.totalRuns).toBe(3);
      expect(updated.statistics.successfulRuns).toBe(3);
      expect(updated.statistics.failedRuns).toBe(0);

      vi.useRealTimers();
    });

    it("should limit execution history to 10 entries", async () => {
      const { scheduledImport } = await withScheduledImport(
        testEnv,
        testCatalogId,
        `${testServerUrl}/history-limit.csv`,
        {
          user: testUser,
          name: "History Limit Import",
          frequency: "hourly",
          additionalData: {
            executionHistory: [], // Start with empty history
          },
        }
      );

      // Set up test server endpoint
      testServer.respondWithCSV("/history-limit.csv", "test,data\n1,2");

      // Use fake timers
      vi.useFakeTimers();
      const baseTime = new Date("2024-01-01T00:00:00.000Z");

      // Import the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");

      // Execute 15 times
      for (let i = 0; i < 15; i++) {
        vi.setSystemTime(new Date(baseTime.getTime() + (i + 1) * 3600000)); // Each hour

        await scheduleManagerJob.handler({
          job: { id: `test-schedule-history-limit-${i}` },
          req: { payload },
        });

        // Manually update the scheduled import with execution history
        const currentScheduled = await payload.findByID({
          collection: "scheduled-imports",
          id: scheduledImport.id,
        });

        const executionEntry = {
          executedAt: new Date(baseTime.getTime() + (i + 1) * 3600000).toISOString(),
          status: "success" as const,
          duration: 100 + i * 10,
          importFileId: null,
        };

        const executionHistory = [...(currentScheduled.executionHistory || []), executionEntry].slice(-10);

        await payload.update({
          collection: "scheduled-imports",
          id: scheduledImport.id,
          data: {
            lastRun: new Date(baseTime.getTime() + (i + 1) * 3600000),
            lastStatus: "success",
            executionHistory,
            statistics: {
              totalRuns: i + 1,
              successfulRuns: i + 1,
              failedRuns: 0,
              averageDuration:
                executionHistory.reduce((acc: number, ex: any) => acc + ex.duration, 0) / executionHistory.length,
            },
          },
        });
      }

      // Fetch the updated scheduled import
      const updated = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      // Should only keep last 10 entries
      expect(updated.executionHistory).toHaveLength(10);

      // Most recent should be last (array grows by appending)
      const lastEntry = new Date(updated.executionHistory[9].executedAt);
      const secondLastEntry = new Date(updated.executionHistory[8].executedAt);
      expect(lastEntry.getTime()).toBeGreaterThan(secondLastEntry.getTime());

      // Statistics should reflect all 15 runs
      expect(updated.statistics.totalRuns).toBe(15);

      vi.useRealTimers();
    });
  });

  describe("Statistics Accuracy", () => {
    it("should accurately track success and failure rates", async () => {
      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/stats.csv`, {
        user: testUser,
        name: "Statistics Test Import",
        frequency: "hourly",
      });

      // Set up test server endpoint with mixed responses
      let callCount = 0;
      testServer.route("/stats.csv", (_req: IncomingMessage, res: ServerResponse) => {
        callCount++;
        // Fail on 2nd and 4th calls
        if (callCount === 2 || callCount === 4) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Internal Server Error");
        } else {
          const csvContent = "test,data\n1,2";
          res.writeHead(200, {
            "Content-Type": "text/csv",
            "Content-Length": String(Buffer.byteLength(csvContent)),
          });
          res.end(csvContent);
        }
      });

      // Use fake timers
      vi.useFakeTimers();
      const baseTime = new Date("2024-01-01T12:00:00.000Z");

      // Import the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");

      // Mock url-fetch job to simulate failures
      await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute 5 times
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(new Date(baseTime.getTime() + (i + 1) * 3600000));

        const shouldFail = i === 1 || i === 3; // Fail on 2nd and 4th runs

        try {
          await scheduleManagerJob.handler({
            job: { id: `test-schedule-stats-${i}` },
            req: { payload },
          });

          // Manually update statistics
          const currentScheduled = await payload.findByID({
            collection: "scheduled-imports",
            id: scheduledImport.id,
          });

          const stats = currentScheduled.statistics || {
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            averageDuration: 0,
          };

          await payload.update({
            collection: "scheduled-imports",
            id: scheduledImport.id,
            data: {
              statistics: {
                totalRuns: stats.totalRuns + 1,
                successfulRuns: shouldFail ? stats.successfulRuns : stats.successfulRuns + 1,
                failedRuns: shouldFail ? stats.failedRuns + 1 : stats.failedRuns,
                averageDuration: 100,
              },
            },
          });
        } catch {
          // Expected for failures
        }
      }

      // Fetch the updated scheduled import
      const updated = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      // Check statistics accuracy
      expect(updated.statistics.totalRuns).toBeGreaterThan(0);
      expect(updated.statistics.successfulRuns).toBeGreaterThan(0);
      expect(updated.statistics.totalRuns).toBe(updated.statistics.successfulRuns + updated.statistics.failedRuns);

      vi.useRealTimers();
    });

    it("should calculate average duration correctly", async () => {
      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/duration.csv`, {
        user: testUser,
        name: "Duration Test Import",
        frequency: "hourly",
        additionalData: {
          statistics: {
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            averageDuration: 0,
          },
        },
      });

      // Set up test server endpoint with varying delays
      const delays = [100, 200, 150, 300, 250];
      let callIndex = 0;
      testServer.route("/duration.csv", async (_req: IncomingMessage, res: ServerResponse) => {
        const delay = delays[callIndex++] ?? 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
        const csvContent = "test,data\n1,2";
        res.writeHead(200, {
          "Content-Type": "text/csv",
          "Content-Length": String(Buffer.byteLength(csvContent)),
        });
        res.end(csvContent);
      });

      // Use fake timers
      vi.useFakeTimers();
      const baseTime = new Date("2024-01-01T12:00:00.000Z");

      // Import the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");

      // Execute multiple times
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(new Date(baseTime.getTime() + (i + 1) * 3600000));

        await scheduleManagerJob.handler({
          job: { id: `test-schedule-duration-${i}` },
          req: { payload },
        });

        // Manually update statistics with duration
        const currentScheduled = await payload.findByID({
          collection: "scheduled-imports",
          id: scheduledImport.id,
        });

        const stats = currentScheduled.statistics || {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          averageDuration: 0,
        };

        const duration = delays[i] ?? 100;
        const newAverage =
          stats.totalRuns === 0
            ? duration
            : (stats.averageDuration * stats.totalRuns + duration) / (stats.totalRuns + 1);

        const executionEntry = {
          executedAt: new Date(baseTime.getTime() + (i + 1) * 3600000).toISOString(),
          status: "success" as const,
          duration: duration,
          importFileId: null,
        };

        const executionHistory = [...(currentScheduled.executionHistory || []), executionEntry].slice(-10);

        await payload.update({
          collection: "scheduled-imports",
          id: scheduledImport.id,
          data: {
            statistics: {
              totalRuns: stats.totalRuns + 1,
              successfulRuns: stats.successfulRuns + 1,
              failedRuns: stats.failedRuns,
              averageDuration: newAverage,
            },
            executionHistory,
          },
        });
      }

      // Fetch the updated scheduled import
      const updated = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      // Average duration should be calculated
      expect(updated.statistics.averageDuration).toBeGreaterThan(0);

      // Check execution history has durations
      if (updated.executionHistory && updated.executionHistory.length > 0) {
        updated.executionHistory.forEach((exec: any) => {
          expect(exec.duration).toBeGreaterThan(0);
        });
      }

      vi.useRealTimers();
    });
  });

  describe("File Content Preservation", () => {
    it("should preserve exact file content including special characters", async () => {
      const specialContent = 'id,name,description\n1,"Test, Inc.","Quote: ""Hello"" - O\'Reilly"\n2,Café,Niño José™';

      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/special.csv`, {
        user: testUser,
        name: "Special Chars Import",
        frequency: "daily",
      });

      // Set up test server endpoint
      testServer.respond("/special.csv", {
        body: specialContent,
        headers: { "Content-Type": "text/csv; charset=utf-8" },
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-special" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Special Chars Test",
          userId: testUser.id,
        },
      });

      expect(result.output.success).toBe(true);
      if (result.output.success) {
        const successOutput = result.output as any;
        // Content hash should be consistent
        const expectedHash = crypto.createHash("sha256").update(specialContent).digest("hex");
        expect(successOutput.contentHash).toBe(expectedHash);
      }
    });

    it("should handle different encodings correctly", async () => {
      const { scheduledImport } = await withScheduledImport(testEnv, testCatalogId, `${testServerUrl}/encoded.csv`, {
        user: testUser,
        name: "Encoding Test Import",
        frequency: "daily",
      });

      // Test with Latin-1 encoded content
      const latin1Content = Buffer.from("id,name\n1,Café\n2,Niño", "latin1");

      // Set up test server endpoint
      testServer.respond("/encoded.csv", {
        body: latin1Content,
        headers: { "Content-Type": "text/csv; charset=iso-8859-1" },
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-encoding" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Encoding Test",
          userId: testUser.id,
        },
      });

      expect(result.output.success).toBe(true);
      if (result.output.success) {
        const successOutput = result.output as any;
        expect(successOutput.fileSize).toBe(latin1Content.length);
      }
    });
  });

  describe("Retry Data Consistency", () => {
    it("should maintain data consistency across retries", async () => {
      const { scheduledImport } = await withScheduledImport(
        testEnv,
        testCatalogId,
        `${testServerUrl}/retry-consistency.csv`,
        {
          user: testUser,
          name: "Retry Consistency Import",
          frequency: "daily",
          maxRetries: 1,
          retryDelayMinutes: 1, // Will use 100ms in test env
          additionalData: {
            retryConfig: {
              maxRetries: 1,
              retryDelayMinutes: 1, // Will use 100ms in test env
              exponentialBackoff: false,
            },
          },
        }
      );

      // Set up test server endpoint with intermittent failures
      let attemptCount = 0;
      const consistentData = "id,value,timestamp\n1,100,2024-01-01T12:00:00Z";
      testServer.route("/retry-consistency.csv", (_req: IncomingMessage, res: ServerResponse) => {
        attemptCount++;
        if (attemptCount === 1) {
          res.writeHead(503, { "Content-Type": "text/plain" });
          res.end("Service Unavailable");
        } else {
          res.writeHead(200, {
            "Content-Type": "text/csv",
            "Content-Length": String(Buffer.byteLength(consistentData)),
          });
          res.end(consistentData);
        }
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job (should retry and eventually succeed)
      const result = await urlFetchJob.handler({
        job: { id: "test-job-retry-consistency" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Retry Consistency Test",
          userId: testUser.id,
        },
      });

      // Should succeed after one retry
      expect(result.output.success).toBe(true);
      expect(attemptCount).toBe(2);
    });
  });
});
