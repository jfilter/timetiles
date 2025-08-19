/**
 * Integration tests for scheduled imports system
 * @module
 */

import { promises as fs } from "fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { scheduleManagerJob } from "@/lib/jobs/handlers/schedule-manager-job";
import { urlFetchJob } from "@/lib/jobs/handlers/url-fetch-job";
import { logger } from "@/lib/logger";
import type { Catalog, Dataset, User } from "@/payload-types";

import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

// Mock fetch globally
global.fetch = vi.fn();

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

describe.sequential("Scheduled Imports Integration", () => {
  let payload: any;
  let testUser: User;
  let testCatalog: Catalog;
  let testDataset: Dataset;
  let cleanup: () => Promise<void>;
  let uploadDir: string;

  beforeAll(async () => {
    const timestamp = Date.now();
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;

    // Create shared test data once
    testUser = await payload.create({
      collection: "users",
      data: {
        email: `test-shared-${timestamp}@example.com`,
        password: "test123456",
        role: "admin",
      },
    });

    testCatalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `Shared Test Catalog ${timestamp}`,
        slug: `shared-test-catalog-${timestamp}`,
        description: "Shared test catalog for scheduled imports",
        isPublic: false,
      },
    });

    testDataset = await payload.create({
      collection: "datasets",
      data: {
        name: `Shared Test Dataset ${timestamp}`,
        slug: `shared-test-dataset-${timestamp}`,
        catalog: testCatalog.id,
        language: "eng",
        isPublic: false,
        idStrategy: {
          type: "external",
          duplicateStrategy: "skip",
        },
      },
    });
  });

  beforeEach(async () => {
    // Set up clean upload directory for each test
    const timestamp = Date.now();
    uploadDir = `/tmp/test-uploads-${timestamp}`;
    process.env.UPLOAD_DIR_IMPORT_FILES = uploadDir;
    await fs.mkdir(uploadDir, { recursive: true });

    // Clear mocks
    vi.clearAllMocks();

    // Mock payload.jobs.queue to prevent actual job execution in tests
    if (payload?.jobs) {
      vi.spyOn(payload.jobs, "queue").mockResolvedValue({
        id: "mock-job-id",
        task: "url-fetch",
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);
    }

    // Clean up scheduled imports and import files between tests to ensure isolation
    try {
      const allScheduledImports = await payload.find({
        collection: "scheduled-imports",
        limit: 1000,
      });

      for (const scheduledImport of allScheduledImports.docs) {
        await payload.delete({
          collection: "scheduled-imports",
          id: scheduledImport.id,
        });
      }
    } catch {
      // Ignore if no records to delete
    }

    try {
      const allImportFiles = await payload.find({
        collection: "import-files",
        limit: 1000,
      });

      for (const importFile of allImportFiles.docs) {
        await payload.delete({
          collection: "import-files",
          id: importFile.id,
        });
      }
    } catch {
      // Ignore if no records to delete
    }
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      await fs.rm(uploadDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  afterAll(async () => {
    // Cleanup test environment
    if (cleanup) {
      await cleanup();
    }
  }, 30000);

  describe("Scheduled Import Creation", () => {
    it("should create a scheduled import", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Daily Data Import",
          description: "Imports data from API every day",
          enabled: true,
          sourceUrl: "https://api.example.com/data.csv",
          authConfig: {
            type: "api-key",
            apiKey: "test-key-123",
            apiKeyHeader: "X-API-Key",
          },
          catalog: testCatalog.id,
          scheduleType: "cron",
          cronExpression: "0 0 * * *", // Daily at midnight
          maxRetries: 3,
          retryDelayMinutes: 5,
          timeoutSeconds: 300,
          importNameTemplate: "{{name}} - {{date}}",
        },
      });

      expect(scheduledImport).toMatchObject({
        name: "Daily Data Import",
        enabled: true,
        sourceUrl: "https://api.example.com/data.csv",
        cronExpression: "0 0 * * *",
        statistics: {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          averageDuration: 0, // Default value is 0, not null
        },
      });
    });

    it("should validate cron expressions", async () => {
      await expect(
        payload.create({
          collection: "scheduled-imports",
          data: {
            name: "Invalid Cron Import",
            sourceUrl: "https://api.example.com/data.csv",
            scheduleType: "cron",
            cronExpression: "invalid-cron",
          },
        })
      ).rejects.toThrow(/The following field is invalid: Cron/);
    });

    it("should validate source URL", async () => {
      await expect(
        payload.create({
          collection: "scheduled-imports",
          data: {
            name: "Invalid URL Import",
            sourceUrl: "not-a-url",
            scheduleType: "cron",
            cronExpression: "0 0 * * *",
          },
        })
      ).rejects.toThrow(/The following field is invalid: Source URL/);
    });
  });

  describe("Schedule Manager Job", () => {
    it("should trigger scheduled imports when due", { timeout: 30000 }, async () => {
      // Mock current time - use ISO format with Z for UTC
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-15T00:30:00.000Z")); // 30 minutes after midnight UTC

      // Create a scheduled import that ran yesterday
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Daily Import",
          enabled: true,
          sourceUrl: "https://api.example.com/data.csv",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          datasetMapping: {
            mappingType: "single",
            singleDataset: testDataset.id,
          },
          scheduleType: "frequency",
          frequency: "daily",
          lastRun: new Date("2024-01-14T00:00:00.000Z"), // Yesterday at midnight UTC
          nextRun: new Date("2024-01-15T00:00:00.000Z"), // Today at midnight UTC - due to run
          importNameTemplate: "{{name}} - {{date}}",
        },
      });

      // Mock URL fetch response
      const mockCsvData = "id,name,value\n1,test,100";
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers({
          "content-type": "text/csv",
          "content-length": mockCsvData.length.toString(),
        }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(mockCsvData),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      });

      // Move time forward to ensure we're past the next run time (daily at midnight)
      // Since lastRun was yesterday at midnight, next run should be today at midnight
      // Current time is 01:00, which is past midnight, so it should trigger
      vi.setSystemTime(new Date("2024-01-15T01:00:00.000Z"));

      // Check the schedule before running
      const scheduleBeforeRun = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      // Run schedule manager
      const result = await scheduleManagerJob.handler({
        job: { id: "test-job" },
        req: { payload },
      });

      // Debug if not triggering
      if (result.output.triggered !== 1) {
        logger.info("Schedule not triggered. Schedule details:", {
          name: scheduleBeforeRun.name,
          lastRun: scheduleBeforeRun.lastRun,
          nextRun: scheduleBeforeRun.nextRun,
          frequency: scheduleBeforeRun.frequency,
          currentTime: new Date("2024-01-15T01:00:00.000Z").toISOString(),
        });
      }

      expect(result.output).toEqual({
        success: true,
        totalScheduled: 1,
        triggered: 1,
        errors: 0,
      });

      // With fake timers, we need to advance time manually
      await vi.advanceTimersByTimeAsync(100);

      // Note: In this test, we're just verifying the schedule manager triggered the job.
      // The actual import-files record would be created by the url-fetch job, which
      // runs asynchronously. In a real scenario, the job queue would process it.

      // Verify scheduled import was updated
      const updatedSchedule = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      // Schedule manager runs at 01:00:00 UTC, so lastRun should be that time
      expect(new Date(updatedSchedule.lastRun)).toEqual(new Date("2024-01-15T01:00:00.000Z"));
      // Next run for daily schedule should be next day at midnight UTC
      expect(new Date(updatedSchedule.nextRun)).toEqual(new Date("2024-01-16T00:00:00.000Z"));
      expect(updatedSchedule.lastStatus).toBe("running");
      expect(updatedSchedule.statistics.totalRuns).toBe(1);
      expect(updatedSchedule.statistics.successfulRuns).toBe(1);

      vi.useRealTimers();
    });

    it("should not trigger disabled schedules", async () => {
      await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Disabled Import",
          enabled: false, // Disabled
          sourceUrl: "https://api.example.com/data.csv",
          catalog: testCatalog.id,
          scheduleType: "cron",
          cronExpression: "* * * * *", // Every minute
        },
      });

      const result = await scheduleManagerJob.handler({
        job: { id: "test-job" },
        req: { payload },
      });

      expect(result.output.triggered).toBe(0);
    });

    it("should handle multiple schedules correctly", { timeout: 30000 }, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-15T10:30:00.000Z"));

      // Create multiple schedules - use ISO format with Z for UTC
      await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Hourly Import",
          enabled: true,
          sourceUrl: "https://api1.example.com/data.csv",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "cron",
          cronExpression: "0 * * * *", // Every hour
          lastRun: new Date("2024-01-15T09:00:00.000Z"), // 1.5 hours ago - should trigger
        },
      });

      await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Daily Import",
          enabled: true,
          sourceUrl: "https://api2.example.com/data.csv",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "cron",
          cronExpression: "0 0 * * *", // Daily at midnight
          lastRun: new Date("2024-01-15T00:00:00.000Z"), // Today - should not trigger
        },
      });

      await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Another Hourly",
          enabled: true,
          sourceUrl: "https://api3.example.com/data.csv",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "cron",
          cronExpression: "0 * * * *", // Every hour
          lastRun: new Date("2024-01-15T08:00:00.000Z"), // 2.5 hours ago - should trigger
        },
      });

      // Mock fetch for all URLs
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/csv" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("data"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      });

      // Before running, check what schedules exist
      const schedulesBeforeRun = await payload.find({
        collection: "scheduled-imports",
        where: { enabled: { equals: true } },
        limit: 100,
      });

      // There should be exactly 3 schedules
      expect(schedulesBeforeRun.docs.length).toBe(3);

      const result = await scheduleManagerJob.handler({
        job: { id: "test-job" },
        req: { payload },
      });

      // Debug: log what actually happened
      if (result.output.triggered !== 2) {
        logger.info(
          "Unexpected trigger count. Schedules:",
          schedulesBeforeRun.docs.map((s: any) => ({
            name: s.name,
            lastRun: s.lastRun,
            cronExpression: s.cronExpression,
            frequency: s.frequency,
            nextRun: s.nextRun,
          }))
        );
      }

      // All three schedules are found, but let's check which ones actually trigger
      // Current time is 10:30
      // 1. First hourly (lastRun 09:00): next is 10:00, past due, triggers
      // 2. Daily (lastRun today 00:00): next is tomorrow 00:00, NOT due
      // 3. Second hourly (lastRun 08:00): next is 09:00, past due, triggers
      expect(result.output.success).toBe(true);
      expect(result.output.totalScheduled).toBe(3);
      expect(result.output.triggered).toBe(2);
      expect(result.output.errors).toBe(0);

      vi.useRealTimers();
    });
  });

  describe("URL Fetch Job", () => {
    it("should fetch and process URL data", async () => {
      // First create a scheduled import to trigger the URL fetch
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Test URL Fetch",
          sourceUrl: "https://api.example.com/data.csv",
          authConfig: {
            type: "bearer",
            bearerToken: "token-123",
          },
          catalog: testCatalog.id,
          enabled: true,
          scheduleType: "cron",
          cronExpression: "0 * * * *",
        },
      });

      // Mock fetch response
      const mockCsvData = "id,name,value\n1,Product A,100\n2,Product B,200";
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers({
          "content-type": "text/csv",
          "content-length": mockCsvData.length.toString(),
        }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(mockCsvData),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      });

      // Run URL fetch job
      const result = await urlFetchJob.handler({
        input: {
          sourceUrl: "https://api.example.com/data.csv",
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalog.id,
          originalName: "test-import.csv",
          userId: testUser.id,
          scheduledImportId: scheduledImport.id,
        },
        job: { id: "url-job-123" },
        req: { payload },
      });

      expect(result.output).toMatchObject({
        success: true,
        filename: expect.stringContaining("url-"),
        fileSize: mockCsvData.length,
        contentType: "text/csv",
        importFileId: expect.any(Number),
        isDuplicate: false,
      });

      // Verify fetch was called with auth
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data.csv",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer token-123",
          }),
        })
      );

      // Note: File is now handled by Payload's upload system, not saved directly to disk by url-fetch-job

      // Verify import file was created
      expect(result.output.success).toBe(true);
      const successOutput = result.output as UrlFetchSuccessOutput;
      const importFiles = await payload.find({
        collection: "import-files",
        where: {
          id: { equals: successOutput.importFileId },
        },
      });

      expect(importFiles.docs).toHaveLength(1);
      expect(importFiles.docs[0]).toMatchObject({
        // Payload generates its own filename when handling uploads
        filename: expect.stringMatching(/^\d+-[a-f0-9]+\.csv$/),
        mimeType: "text/csv",
        filesize: mockCsvData.length,
        status: "pending",
        // originalName contains the full generated filename with timestamp and UUID
        originalName: expect.stringMatching(/^url-import-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9-]+\.csv$/),
      });
    });

    it("should handle authentication types", async () => {
      const authTypes = [
        {
          type: "api-key",
          config: { apiKey: "key-123", apiKeyHeader: "X-Custom-Key" },
          expectedHeader: { "X-Custom-Key": "key-123" },
        },
        {
          type: "basic",
          config: { username: "user", password: "pass" },
          expectedHeader: { Authorization: `Basic ${Buffer.from("user:pass").toString("base64")}` },
        },
      ];

      for (const authTest of authTypes) {
        vi.clearAllMocks();

        (global.fetch as any).mockResolvedValue({
          ok: true,
          headers: new Headers({ "content-type": "text/csv" }),
          body: {
            getReader: () => ({
              read: vi
                .fn()
                .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode("data") })
                .mockResolvedValueOnce({ done: true }),
            }),
          },
        });

        await urlFetchJob.handler({
          input: {
            sourceUrl: "https://api.example.com/data",
            authConfig: { type: authTest.type as "none" | "api-key" | "bearer" | "basic", ...authTest.config },
            catalogId: testCatalog.id,
            originalName: "test.csv",
            userId: testUser.id,
          },
          job: { id: "test-job" },
          req: { payload },
        });

        expect(global.fetch).toHaveBeenCalledWith(
          "https://api.example.com/data",
          expect.objectContaining({
            headers: expect.objectContaining(authTest.expectedHeader),
          })
        );
      }
    });

    it("should handle fetch errors", async () => {
      // Mock fetch error
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const result = await urlFetchJob.handler({
        input: {
          sourceUrl: "https://api.example.com/data.csv",
          authConfig: { type: "none" },
          catalogId: testCatalog.id,
          originalName: "test.csv",
          userId: testUser.id,
        },
        job: { id: "test-job" },
        req: { payload },
      });

      expect(result.output.success).toBe(false);
      const failureOutput = result.output as UrlFetchFailureOutput;
      expect(failureOutput.error).toBe("HTTP 404: Not Found");
    });
  });

  describe("Advanced Features", () => {
    it("should handle duplicate checking", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Duplicate Check Import",
          enabled: true,
          sourceUrl: "https://api.example.com/data.csv",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "hourly",
          advancedConfig: {
            skipDuplicateCheck: false,
          },
        },
      });

      const mockCsvData = "id,name,value\n1,test,100";
      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "text/csv" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(mockCsvData),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      // First import
      const result1 = await urlFetchJob.handler({
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalog.id,
          originalName: "First Import",
        },
        job: { id: "job-1" },
        req: { payload },
      });

      const successOutput1 = result1.output as UrlFetchSuccessOutput;
      expect(successOutput1.isDuplicate).toBe(false);

      // Update the first import to completed status so duplicate check can find it
      const successForUpdate = result1.output as UrlFetchSuccessOutput;
      await payload.update({
        collection: "import-files",
        id: successForUpdate.importFileId,
        data: {
          status: "completed",
        },
      });

      // Reset mock for second fetch
      (global.fetch as any).mockResolvedValue(mockResponse);

      // Second import with same content
      const result2 = await urlFetchJob.handler({
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalog.id,
          originalName: "Second Import",
        },
        job: { id: "job-2" },
        req: { payload },
      });

      const successOutput2 = result2.output as UrlFetchSuccessOutput;
      expect(successOutput2.isDuplicate).toBe(true);

      // Verify import files
      const importFiles = await payload.find({
        collection: "import-files",
        where: {
          "metadata.scheduledExecution.scheduledImportId": {
            equals: scheduledImport.id,
          },
        },
        sort: "createdAt", // Ensure consistent order
      });

      // When duplicate is detected, no new import file is created
      expect(importFiles.docs).toHaveLength(1);
      expect(importFiles.docs[0].status).toBe("completed"); // First was updated to completed
    });

    it("should skip duplicate checking when configured", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Skip Duplicate Check Import",
          enabled: true,
          sourceUrl: "https://api.example.com/data.csv",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "hourly",
          advancedConfig: {
            skipDuplicateCheck: true,
          },
        },
      });

      const mockCsvData = "id,name,value\n1,test,100";
      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "text/csv" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(mockCsvData),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      // First import
      const result1 = await urlFetchJob.handler({
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalog.id,
          originalName: "First Import",
        },
        job: { id: "job-1" },
        req: { payload },
      });

      const successOutput1 = result1.output as UrlFetchSuccessOutput;
      expect(successOutput1.isDuplicate).toBe(false);

      // Reset mock
      (global.fetch as any).mockResolvedValue(mockResponse);

      // Second import with same content
      const result2 = await urlFetchJob.handler({
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalog.id,
          originalName: "Second Import",
        },
        job: { id: "job-2" },
        req: { payload },
      });

      // Should NOT be marked as duplicate
      const successOutput2Result = result2.output as UrlFetchSuccessOutput;
      expect(successOutput2Result.isDuplicate).toBe(false);
    });

    it("should handle expected content type override", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Content Type Override Import",
          enabled: true,
          sourceUrl: "https://api.example.com/data",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "daily",
          advancedConfig: {
            expectedContentType: "csv",
          },
        },
      });

      // Server returns generic content type
      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "application/octet-stream" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("id,name\n1,test"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await urlFetchJob.handler({
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalog.id,
          originalName: "Content Type Test",
        },
        job: { id: "job-1" },
        req: { payload },
      });

      const successOutput = result.output as UrlFetchSuccessOutput;
      expect(successOutput.contentType).toBe("text/csv");
      expect(successOutput.filename).toMatch(/\.csv$/);
    });

    it("should enforce max file size limit", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "File Size Limit Import",
          enabled: true,
          sourceUrl: "https://api.example.com/large-file",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "daily",
          advancedOptions: {
            maxFileSizeMB: 1, // 1MB limit
          },
        },
      });

      const largeData = new Uint8Array(2 * 1024 * 1024); // 2MB
      const mockResponse = {
        ok: true,
        headers: new Headers({
          "content-type": "text/csv",
          "content-length": String(2 * 1024 * 1024), // 2MB
        }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: largeData,
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await urlFetchJob.handler({
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalog.id,
          originalName: "Large File",
        },
        job: { id: "job-1" },
        req: { payload },
      });

      expect(result.output.success).toBe(false);
      const failureOutput = result.output as UrlFetchFailureOutput;
      expect(failureOutput.error).toMatch(/file.*too large/i);
    });

    it("should handle custom headers in authConfig", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Custom Headers Import",
          enabled: true,
          sourceUrl: "https://api.example.com/data",
          authConfig: {
            type: "api-key",
            apiKey: "test-key",
            apiKeyHeader: "X-API-Key",
            customHeaders: JSON.stringify({
              "X-Custom-Header": "custom-value",
              "Accept-Language": "en-US",
            }),
          },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("{}"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      await urlFetchJob.handler({
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalog.id,
          originalName: "Headers Test",
        },
        job: { id: "job-1" },
        req: { payload },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-API-Key": "test-key",
            "X-Custom-Header": "custom-value",
            "Accept-Language": "en-US",
          }),
        })
      );
    });

    it("should pass through dataset mapping configuration", async () => {
      const multiSheetConfig = {
        enabled: true,
        sheets: [
          {
            sheetIdentifier: "Sheet1",
            dataset: testDataset.id,
            skipIfMissing: false,
          },
        ],
      };

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Dataset Mapping Import",
          enabled: true,
          sourceUrl: "https://api.example.com/data.xlsx",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          multiSheetConfig,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "application/vnd.ms-excel" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("data"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await urlFetchJob.handler({
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalog.id,
          originalName: "Mapping Test",
        },
        job: { id: "job-1" },
        req: { payload },
      });

      const successOutput = result.output as UrlFetchSuccessOutput;
      const importFile = await payload.findByID({
        collection: "import-files",
        id: successOutput.importFileId,
      });

      // The dataset field might be populated with the full object
      expect(importFile.metadata.datasetMapping).toMatchObject({
        enabled: true,
        sheets: expect.arrayContaining([
          expect.objectContaining({
            sheetIdentifier: "Sheet1",
            skipIfMissing: false,
            // Accept either the ID or the full object
            dataset: expect.anything(),
          }),
        ]),
      });
    });

    it("should update average duration statistics", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Duration Statistics Import",
          enabled: true,
          sourceUrl: "https://api.example.com/data.csv",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "hourly",
          statistics: {
            totalRuns: 2,
            successfulRuns: 2,
            failedRuns: 0,
            averageDuration: 3.5,
          },
        },
      });

      const mockResponse = {
        ok: true,
        headers: new Headers({ "content-type": "text/csv" }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("data"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      // Mock timing
      const startTime = Date.now();
      vi.spyOn(Date, "now")
        .mockReturnValueOnce(startTime) // Start time
        .mockReturnValue(startTime + 2000); // End time (2 seconds later)

      await urlFetchJob.handler({
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalog.id,
          originalName: "Duration Test",
        },
        job: { id: "job-1" },
        req: { payload },
      });

      const updated = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      // Should update with new average: (3.5 * 2 + 2) / 3 = 3
      expect(updated.statistics).toMatchObject({
        totalRuns: 3,
        successfulRuns: 3,
        failedRuns: 0,
        averageDuration: 3,
      });

      vi.spyOn(Date, "now").mockRestore();
    });

    it("should handle retry logic with exponential backoff", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Retry Logic Import",
          enabled: true,
          sourceUrl: "https://api.example.com/flaky-endpoint",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "daily",
          maxRetries: 3,
          retryDelayMinutes: 1, // Minimum allowed value
        },
      });

      // Fail twice, then succeed
      let attempt = 0;
      (global.fetch as any).mockImplementation(() => {
        attempt++;
        if (attempt < 3) {
          return Promise.reject(new Error(`Network error attempt ${attempt}`));
        }
        return Promise.resolve({
          ok: true,
          headers: new Headers({ "content-type": "text/csv" }),
          body: {
            getReader: () => ({
              read: vi
                .fn()
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode("success data"),
                })
                .mockResolvedValueOnce({ done: true }),
            }),
          },
        });
      });

      const result = await urlFetchJob.handler({
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalog.id,
          originalName: "Retry Test",
        },
        job: { id: "job-retry" },
        req: { payload },
      });

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result.output).toMatchObject({
        success: true,
        isDuplicate: false,
      });

      // Verify import file was created successfully
      const successOutput = result.output as UrlFetchSuccessOutput;
      const importFile = await payload.findByID({
        collection: "import-files",
        id: successOutput.importFileId,
      });

      expect(importFile).toMatchObject({
        status: "pending",
        // The attempts are not tracked in metadata, only in the job handler
      });
    });

    it("should handle timeout properly", { timeout: 20000 }, async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Timeout Test Import",
          enabled: true,
          sourceUrl: "https://slow-server.com/timeout-test",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "daily",
          timeoutSeconds: 30, // Minimum allowed value
        },
      });

      // Mock a slow response that will timeout
      // Instead of hanging forever, immediately reject with abort error
      (global.fetch as any).mockImplementation(() => {
        // Simulate immediate timeout
        const error = new Error("The operation was aborted due to timeout");
        error.name = "AbortError";
        throw error;
      });

      const result = await urlFetchJob.handler({
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalog.id,
          originalName: "Timeout Test",
        },
        job: { id: "job-timeout" },
        req: { payload },
      });

      expect(result.output.success).toBe(false);
      const failureOutput = result.output as UrlFetchFailureOutput;
      expect(failureOutput.error).toMatch(/timeout/i);

      // Verify scheduled import was updated with failure
      const updated = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      expect(updated).toMatchObject({
        lastStatus: "failed",
        lastError: expect.stringContaining("timeout"),
        currentRetries: 1,
        statistics: expect.objectContaining({
          totalRuns: 1,
          failedRuns: 1,
          successfulRuns: 0,
        }),
      });
    });
  });

  describe("End-to-End Scheduled Import Flow", () => {
    it("should complete full scheduled import flow", { timeout: 30000 }, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-15 10:00:00"));

      // Create scheduled import
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Test Scheduled Import",
          enabled: true,
          sourceUrl: "https://api.example.com/products.csv",
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "cron",
          cronExpression: "0 * * * *", // Hourly
          lastRun: new Date("2024-01-15 08:00:00"), // 2 hours ago
          importNameTemplate: "Products - {{date}} {{time}}",
        },
      });

      // Mock successful fetch
      const mockCsvData = "id,name,price\n1,Product A,99.99\n2,Product B,149.99";
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers({
          "content-type": "text/csv",
          "content-length": mockCsvData.length.toString(),
        }),
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(mockCsvData),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      });

      // Run schedule manager
      const scheduleResult = await scheduleManagerJob.handler({
        job: { id: "schedule-job" },
        req: { payload },
      });

      expect(scheduleResult.output.triggered).toBe(1);

      // Since we're mocking payload.jobs.queue, we need to manually run the URL fetch job
      // to simulate what would happen in production
      const fetchResult = await urlFetchJob.handler({
        input: {
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: scheduledImport.catalog,
          originalName: "Hourly Import - 2024-01-15 - api.example.com",
          userId: testUser.id,
          scheduledImportId: scheduledImport.id,
        },
        job: { id: "url-fetch-job" },
        req: { payload },
      });

      expect(fetchResult.output.success).toBe(true);

      // Verify complete state
      const finalSchedule = await payload.findByID({
        collection: "scheduled-imports",
        id: scheduledImport.id,
      });

      // The schedule should have been triggered
      expect(finalSchedule.statistics.totalRuns).toBeGreaterThanOrEqual(1);
      expect(finalSchedule.statistics.successfulRuns).toBeGreaterThanOrEqual(1);
      expect(finalSchedule.lastStatus).toBe("success");

      // Verify an import file was created
      const fetchSuccessOutput = fetchResult.output as UrlFetchSuccessOutput;
      const importFiles = await payload.find({
        collection: "import-files",
        where: {
          id: { equals: fetchSuccessOutput.importFileId },
        },
      });

      expect(importFiles.docs).toHaveLength(1);
      expect(importFiles.docs[0]).toMatchObject({
        status: "pending",
        filename: expect.stringMatching(/^\d+-[a-f0-9]+\.csv$/),
        mimeType: "text/csv",
        filesize: mockCsvData.length,
      });

      vi.useRealTimers();
    });
  });
});
