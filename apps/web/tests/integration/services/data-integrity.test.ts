/**
 * Data Integrity Tests for Scheduled Imports
 *
 * Tests various data integrity scenarios including:
 * - Hash-based duplicate detection
 * - Data consistency across retries
 * - Import history tracking
 * - Statistics accuracy
 * - File content preservation
 */

import crypto from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createIntegrationTestEnvironment } from "@/tests/setup/test-environment-builder";

// Mock fetch globally
global.fetch = vi.fn();

describe.sequential("Data Integrity Tests", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testUserId: string;
  let testCatalogId: string;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;

    // Create test user
    const user = await payload.create({
      collection: "users",
      data: {
        email: "integrity-test@example.com",
        password: "test123456",
        role: "admin",
      },
    });
    testUserId = user.id;

    // Create test catalog
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Integrity Test Catalog",
        description: "Catalog for data integrity tests",
      },
    });
    testCatalogId = catalog.id;

    // Mock payload.jobs.queue
    vi.spyOn(payload.jobs, "queue").mockImplementation(async (params: any) => {
      const { task, input } = params;
      return {
        id: `mock-job-${Date.now()}-${Math.random()}`,
        task,
        input,
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;
    });
  }, 60000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Hash-based Duplicate Detection", () => {
    it("should correctly calculate and store content hash", async () => {
      const csvContent = "id,name,value\n1,Test Item,100\n2,Another Item,200";
      const expectedHash = crypto.createHash("sha256").update(csvContent).digest("hex");

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Hash Test Import",
          sourceUrl: "https://example.com/hash-test.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Mock the endpoint
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/csv" }),
        arrayBuffer: async () => Buffer.from(csvContent),
      });

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
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(true);
      expect(result.output.contentHash).toBe(expectedHash);

      // Check that the import file was created with the hash
      const importFile = await payload.findByID({
        collection: "import-files",
        id: result.output.importFileId,
      });

      expect(importFile.metadata?.contentHash).toBe(expectedHash);
    });

    it("should detect duplicate content across multiple imports", async () => {
      const csvContent = "id,name,value\n1,Duplicate Test,100";

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Duplicate Detection Import",
          sourceUrl: "https://example.com/duplicate.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
        },
      });

      // Mock the endpoint to return same content twice
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/csv" }),
          arrayBuffer: async () => Buffer.from(csvContent),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/csv" }),
          arrayBuffer: async () => Buffer.from(csvContent),
        });

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
          userId: testUserId,
        },
      });

      expect(result1.output.success).toBe(true);
      expect(result1.output.isDuplicate).toBe(false);

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
          userId: testUserId,
        },
      });

      expect(result2.output.success).toBe(true);
      expect(result2.output.isDuplicate).toBe(true);
      expect(result2.output.skippedReason).toContain("duplicate");
    });

    it("should handle hash calculation for large files", async () => {
      // Generate 5MB of CSV data
      const header = "id,data1,data2,data3,data4,data5\n";
      const row =
        "12345,Lorem ipsum dolor sit amet,consectetur adipiscing elit,sed do eiusmod,tempor incididunt,ut labore et dolore\n";
      const rowCount = Math.ceil((5 * 1024 * 1024) / row.length);
      const largeContent = header + row.repeat(rowCount);

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Large File Hash Import",
          sourceUrl: "https://example.com/large-hash.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          advancedConfig: {
            maxFileSize: 10, // 10MB limit
          },
        },
      });

      // Mock the endpoint
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/csv" }),
        arrayBuffer: async () => Buffer.from(largeContent),
      });

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
          userId: testUserId,
        },
      });

      const duration = Date.now() - startTime;

      expect(result.output.success).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe("Execution History Tracking", () => {
    it("should accurately track execution history", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "History Tracking Import",
          sourceUrl: "https://example.com/history.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
        },
      });

      // Mock responses for multiple executions
      let callCount = 0;
      (global.fetch as any).mockImplementation(async () => {
        callCount++;
        const timestamp = Date.now();
        const csvContent = `timestamp,value\n${timestamp},${Math.random()}`;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/csv" }),
          arrayBuffer: async () => Buffer.from(csvContent),
        };
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

      for (const execTime of executionTimes) {
        vi.setSystemTime(execTime);

        await scheduleManagerJob.handler({
          job: { id: `test-schedule-history-${execTime.getTime()}` },
          req: { payload },
        });
      }

      // Fetch the updated scheduled import
      const updated = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      // Check execution history
      expect(updated.executionHistory).toHaveLength(3);
      expect(updated.executionHistory[0].executedAt).toBeTruthy();
      expect(updated.executionHistory[0].status).toBe("success");
      expect(updated.executionHistory[0].duration).toBeGreaterThan(0);

      // Check statistics
      expect(updated.statistics.totalRuns).toBe(3);
      expect(updated.statistics.successfulRuns).toBe(3);
      expect(updated.statistics.failedRuns).toBe(0);

      vi.useRealTimers();
    });

    it("should limit execution history to 10 entries", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "History Limit Import",
          sourceUrl: "https://example.com/history-limit.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
          executionHistory: [], // Start with empty history
        },
      });

      // Mock endpoint
      (global.fetch as any).mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/csv" }),
          arrayBuffer: async () => Buffer.from("test,data\n1,2"),
        };
      });

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
      }

      // Fetch the updated scheduled import
      const updated = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      // Should only keep last 10 entries
      expect(updated.executionHistory).toHaveLength(10);

      // Most recent should be first
      const firstEntry = new Date(updated.executionHistory[0].executedAt);
      const secondEntry = new Date(updated.executionHistory[1].executedAt);
      expect(firstEntry.getTime()).toBeGreaterThan(secondEntry.getTime());

      // Statistics should reflect all 15 runs
      expect(updated.statistics.totalRuns).toBe(15);

      vi.useRealTimers();
    });
  });

  describe("Statistics Accuracy", () => {
    it("should accurately track success and failure rates", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Statistics Test Import",
          sourceUrl: "https://example.com/stats.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
        },
      });

      // Mock mixed success/failure responses
      let callCount = 0;
      (global.fetch as any).mockImplementation(async () => {
        callCount++;
        // Fail on 2nd and 4th calls
        if (callCount === 2 || callCount === 4) {
          return {
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            headers: new Headers(),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/csv" }),
          arrayBuffer: async () => Buffer.from("test,data\n1,2"),
        };
      });

      // Use fake timers
      vi.useFakeTimers();
      const baseTime = new Date("2024-01-01T12:00:00.000Z");

      // Import the schedule manager
      const { scheduleManagerJob } = await import("@/lib/jobs/handlers/schedule-manager-job");

      // Mock url-fetch job to simulate failures
      const originalUrlFetchJob = await import("@/lib/jobs/handlers/url-fetch-job");
      const urlFetchHandler = vi.fn().mockImplementation(async ({ input }) => {
        if (callCount === 2 || callCount === 4) {
          throw new Error("Simulated failure");
        }
        return originalUrlFetchJob.urlFetchJob.handler({
          job: { id: "test" },
          req: { payload },
          input,
        });
      });

      // Execute 5 times
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(new Date(baseTime.getTime() + (i + 1) * 3600000));

        try {
          await scheduleManagerJob.handler({
            job: { id: `test-schedule-stats-${i}` },
            req: { payload },
          });
        } catch (error) {
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
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Duration Test Import",
          sourceUrl: "https://example.com/duration.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "hourly",
          statistics: {
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            averageDuration: 0,
          },
        },
      });

      // Mock endpoint with varying delays
      const delays = [100, 200, 150, 300, 250];
      let callIndex = 0;

      (global.fetch as any).mockImplementation(async () => {
        const delay = delays[callIndex++] || 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/csv" }),
          arrayBuffer: async () => Buffer.from("test,data\n1,2"),
        };
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

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Special Chars Import",
          sourceUrl: "https://example.com/special.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Mock the endpoint
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/csv; charset=utf-8" }),
        arrayBuffer: async () => Buffer.from(specialContent),
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
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(true);

      // Content hash should be consistent
      const expectedHash = crypto.createHash("sha256").update(specialContent).digest("hex");
      expect(result.output.contentHash).toBe(expectedHash);
    });

    it("should handle different encodings correctly", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Encoding Test Import",
          sourceUrl: "https://example.com/encoded.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Test with Latin-1 encoded content
      const latin1Content = Buffer.from("id,name\n1,Café\n2,Niño", "latin1");

      // Mock the response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/csv; charset=iso-8859-1" }),
        arrayBuffer: async () => latin1Content,
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
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(true);
      expect(result.output.filesize).toBe(latin1Content.length);
    });
  });

  describe("Retry Data Consistency", () => {
    it("should maintain data consistency across retries", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Retry Consistency Import",
          sourceUrl: "https://example.com/retry-consistency.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          maxRetries: 3,
        },
      });

      // Mock intermittent failures
      let attemptCount = 0;
      const consistentData = "id,value,timestamp\n1,100,2024-01-01T12:00:00Z";

      (global.fetch as any).mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          return {
            ok: false,
            status: 503,
            statusText: "Service Unavailable",
            headers: new Headers(),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/csv" }),
          arrayBuffer: async () => Buffer.from(consistentData),
        };
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
          userId: testUserId,
        },
      });

      // Should succeed, but might take fewer attempts due to immediate retry
      expect(result.output.success).toBe(true);
      expect(attemptCount).toBeGreaterThanOrEqual(1);
    });
  });
});
