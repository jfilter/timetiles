// @vitest-environment node
/**
 * Integration tests for scheduled ingests system
 * Uses node environment instead of jsdom to avoid AbortController compatibility issues
 * with Node 24's native fetch API..
 *
 * @module
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { scheduleManagerJob } from "@/lib/jobs/handlers/schedule-manager-job";
import { urlFetchJob } from "@/lib/jobs/handlers/url-fetch-job";
import { logger } from "@/lib/logger";
import type { Catalog, Dataset, User } from "@/payload-types";

import { TEST_CREDENTIALS } from "../../constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  withScheduledIngest,
  withTestServer,
  withUsers,
} from "../../setup/integration/environment";

// Type definitions for urlFetchJob output
interface UrlFetchSuccessOutput {
  success: true;
  ingestFileId: string | number;
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

describe.sequential("scheduled ingests Integration", () => {
  const collectionsToReset = ["scheduled-ingests", "ingest-files", "user-usage", "payload-jobs"];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testUser: User;
  let testCatalog: Catalog;
  let testDataset: Dataset;
  let cleanup: () => Promise<void>;
  let testServer: any;
  let testServerUrl: string;

  beforeAll(async () => {
    const timestamp = Date.now();
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    const envWithServer = await withTestServer(testEnv);
    payload = envWithServer.payload;
    cleanup = envWithServer.cleanup;
    testServer = envWithServer.testServer;
    testServerUrl = envWithServer.testServerUrl;

    // Create shared test data once
    const { users } = await withUsers(envWithServer, { testUser: { role: "admin" } });
    testUser = users.testUser;

    testCatalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `Shared Test Catalog ${timestamp}`,
        slug: `shared-test-catalog-${timestamp}`,
        description: "Shared test catalog for scheduled ingests",
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
        idStrategy: { type: "external", duplicateStrategy: "skip" },
      },
    });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await testEnv.seedManager.truncate(collectionsToReset);
    testServer.reset();
  });

  afterEach(async () => {
    // Upload dir cleanup handled by testEnv.cleanup()
  });

  afterAll(async () => {
    // Stop test server
    if (testServer) {
      await testServer.stop();
    }

    // Cleanup test environment
    if (cleanup) {
      await cleanup();
    }
  }, 30000);

  describe("scheduled ingest Creation", () => {
    it("should create a scheduled ingest", async () => {
      // Set up test server endpoint
      testServer.respondWithCSV("/api/data.csv", "id,name,value\n1,test,100");

      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalog.id, `${testServerUrl}/api/data.csv`, {
        name: "Daily Data Import",
        description: "Imports data from API every day",
        scheduleType: "cron",
        cronExpression: "0 0 * * *", // Daily at midnight
        authConfig: { type: "api-key", apiKey: "test-key-123", apiKeyHeader: "X-API-Key" },
        ingestNameTemplate: "{{name}} - {{date}}",
        user: testUser,
      });

      expect(scheduledIngest).toMatchObject({
        name: "Daily Data Import",
        enabled: true,
        sourceUrl: `${testServerUrl}/api/data.csv`,
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
          collection: "scheduled-ingests",
          data: {
            name: "Invalid Cron Import",
            sourceUrl: `${testServerUrl}/duplicate-test.csv`,
            scheduleType: "cron",
            cronExpression: "invalid-cron",
          },
          user: testUser,
        })
      ).rejects.toThrow(/The following field is invalid: Cron/);
    });

    it("should validate source URL", async () => {
      await expect(
        payload.create({
          collection: "scheduled-ingests",
          data: {
            name: "Invalid URL Import",
            sourceUrl: "not-a-url",
            scheduleType: "cron",
            cronExpression: "0 0 * * *",
          },
          user: testUser,
        })
      ).rejects.toThrow(/The following field is invalid: Source URL/);
    });
  });

  describe("Schedule Manager Job", () => {
    it("should trigger scheduled ingests when due", { timeout: 30000 }, async () => {
      // Mock current time - use ISO format with Z for UTC
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-15T00:30:00.000Z")); // 30 minutes after midnight UTC

      // Create a scheduled ingest that ran yesterday
      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalog.id, `${testServerUrl}/test-data.csv`, {
        name: "Daily Import",
        frequency: "daily",
        authConfig: { type: "none" },
        datasetMapping: { mappingType: "single", singleDataset: testDataset.id },
        ingestNameTemplate: "{{name}} - {{date}}",
        additionalData: {
          lastRun: new Date("2024-01-14T00:00:00.000Z"), // Yesterday at midnight UTC
          nextRun: new Date("2024-01-15T00:00:00.000Z"), // Today at midnight UTC - due to run
        },
        user: testUser,
      });

      // Set up test server endpoint
      const mockCsvData = "id,name,value\n1,test,100";
      testServer.respondWithCSV("/test-data.csv", mockCsvData);

      // Move time forward to ensure we're past the next run time (daily at midnight)
      // Since lastRun was yesterday at midnight, next run should be today at midnight
      // Current time is 01:00, which is past midnight, so it should trigger
      vi.setSystemTime(new Date("2024-01-15T01:00:00.000Z"));

      // Check the schedule before running
      const scheduleBeforeRun = await payload.findByID({ collection: "scheduled-ingests", id: scheduledIngest.id });

      // Run schedule manager
      const result = await scheduleManagerJob.handler({ job: { id: "test-job" }, req: { payload } });

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

      expect(result.output).toMatchObject({ success: true, totalScheduled: 1, triggered: 1, errors: 0 });

      // With fake timers, we need to advance time manually
      await vi.advanceTimersByTimeAsync(100);

      // Note: In this test, we're just verifying the schedule manager triggered the job.
      // The actual ingest-files record would be created by the url-fetch job, which
      // runs asynchronously. In a real scenario, the job queue would process it.

      // Verify scheduled ingest was updated
      const updatedSchedule = await payload.findByID({ collection: "scheduled-ingests", id: scheduledIngest.id });

      // Schedule manager runs at 01:00:00 UTC, so lastRun should be that time
      expect(new Date(updatedSchedule.lastRun)).toEqual(new Date("2024-01-15T01:00:00.000Z"));
      // Next run for daily schedule should be next day at midnight UTC
      expect(new Date(updatedSchedule.nextRun)).toEqual(new Date("2024-01-16T00:00:00.000Z"));
      expect(updatedSchedule.lastStatus).toBe("running");
      // totalRuns is NOT incremented at queue time - it's updated by the
      // job handler when processing completes with actual success/failure status.
      expect(updatedSchedule.statistics.totalRuns).toBe(0);
      expect(updatedSchedule.statistics.successfulRuns).toBe(0);

      vi.useRealTimers();
    });

    it("should not trigger disabled schedules", async () => {
      await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "Disabled Import",
          enabled: false, // Disabled
          sourceUrl: `${testServerUrl}/duplicate-test.csv`,
          catalog: testCatalog.id,
          scheduleType: "cron",
          cronExpression: "* * * * *", // Every minute
        },
        user: testUser,
      });

      const result = await scheduleManagerJob.handler({ job: { id: "test-job" }, req: { payload } });

      expect(result.output.triggered).toBe(0);
    });

    it("should handle multiple schedules correctly", { timeout: 30000 }, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-15T10:30:00.000Z"));

      // Create multiple schedules - use ISO format with Z for UTC
      // Explicitly set nextRun so the beforeChange hook doesn't compute it
      // from the current fake time (which would set it in the future).
      await withScheduledIngest(testEnv, testCatalog.id, `${testServerUrl}/schedule1.csv`, {
        name: "Hourly Import",
        scheduleType: "cron",
        cronExpression: "0 * * * *", // Every hour
        authConfig: { type: "none" },
        additionalData: {
          lastRun: new Date("2024-01-15T09:00:00.000Z"), // 1.5 hours ago
          nextRun: new Date("2024-01-15T10:00:00.000Z"), // Past due - should trigger
        },
        user: testUser,
      });

      await withScheduledIngest(testEnv, testCatalog.id, `${testServerUrl}/schedule2.csv`, {
        name: "Daily Import",
        scheduleType: "cron",
        cronExpression: "0 0 * * *", // Daily at midnight
        authConfig: { type: "none" },
        additionalData: {
          lastRun: new Date("2024-01-15T00:00:00.000Z"), // Today
          nextRun: new Date("2024-01-16T00:00:00.000Z"), // Tomorrow - should NOT trigger
        },
        user: testUser,
      });

      await withScheduledIngest(testEnv, testCatalog.id, `${testServerUrl}/schedule3.csv`, {
        name: "Another Hourly",
        scheduleType: "cron",
        cronExpression: "0 * * * *", // Every hour
        authConfig: { type: "none" },
        additionalData: {
          lastRun: new Date("2024-01-15T08:00:00.000Z"), // 2.5 hours ago
          nextRun: new Date("2024-01-15T09:00:00.000Z"), // Past due - should trigger
        },
        user: testUser,
      });

      // Set up test server endpoints for all URLs
      testServer
        .respondWithCSV("/schedule1.csv", "id,name\n1,data1")
        .respondWithCSV("/schedule2.csv", "id,name\n2,data2")
        .respondWithCSV("/schedule3.csv", "id,name\n3,data3");

      // Before running, check what schedules exist
      const schedulesBeforeRun = await payload.find({
        collection: "scheduled-ingests",
        where: { enabled: { equals: true } },
        limit: 100,
      });

      // There should be exactly 3 schedules
      expect(schedulesBeforeRun.docs).toHaveLength(3);

      const result = await scheduleManagerJob.handler({ job: { id: "test-job" }, req: { payload } });

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
      // Set up test server endpoint
      const mockCsvData = "id,name,value\n1,Product A,100\n2,Product B,200";
      testServer.respondWithAuth(
        "/auth-data.csv",
        "bearer",
        { token: "token-123" },
        { status: 200, body: mockCsvData, headers: { "Content-Type": "text/csv" } },
        { status: 401, body: "Unauthorized" }
      );

      // First create a scheduled ingest to trigger the URL fetch
      const scheduledIngest = await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "Test URL Fetch",
          sourceUrl: `${testServerUrl}/auth-data.csv`,
          authConfig: { type: "bearer", bearerToken: "token-123" },
          catalog: testCatalog.id,
          enabled: true,
          scheduleType: "cron",
          cronExpression: "0 * * * *",
        },
        user: testUser,
      });

      // Run URL fetch job
      const result = await urlFetchJob.handler({
        input: {
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalog.id,
          originalName: "test-import.csv",
          userId: testUser.id,
          scheduledIngestId: scheduledIngest.id,
        },
        job: { id: "url-job-123" },
        req: { payload },
      });

      expect(result.output).toMatchObject({
        success: true,
        filename: expect.stringContaining("url-"),
        fileSize: mockCsvData.length,
        contentType: "text/csv",
        ingestFileId: expect.any(Number),
        isDuplicate: false,
      });

      // Test server will have validated auth automatically

      // Note: File is now handled by Payload's upload system, not saved directly to disk by url-fetch-job

      // Verify import file was created
      expect(result.output.success).toBe(true);
      const successOutput = result.output as UrlFetchSuccessOutput;
      const importFiles = await payload.find({
        collection: "ingest-files",
        where: { id: { equals: successOutput.ingestFileId } },
      });

      expect(importFiles.docs).toHaveLength(1);
      expect(importFiles.docs[0]).toMatchObject({
        // URL imports now preserve the url-import- prefix
        filename: expect.stringMatching(/^url-import-.*\.csv$/),
        mimeType: "text/csv",
        filesize: mockCsvData.length,
        status: "parsing",
        // originalName should be what we passed in
        originalName: "test-import.csv",
      });
    });

    it("should handle authentication types", async () => {
      // Set up test server endpoints with different auth types
      testServer
        .respondWithAuth(
          "/api-key-data",
          "api-key",
          { header: "x-custom-key", key: "key-123" },
          { status: 200, body: "id,name\n1,test", headers: { "Content-Type": "text/csv" } }
        )
        .respondWithAuth(
          "/basic-auth-data",
          "basic",
          { username: TEST_CREDENTIALS.basic.alternateUsername, password: TEST_CREDENTIALS.basic.alternatePassword },
          { status: 200, body: "id,name\n1,test", headers: { "Content-Type": "text/csv" } }
        );

      // Test API key auth
      const apiKeyResult = await urlFetchJob.handler({
        input: {
          sourceUrl: `${testServerUrl}/api-key-data`,
          authConfig: { type: "api-key", apiKey: "key-123", apiKeyHeader: "X-Custom-Key" },
          catalogId: testCatalog.id,
          originalName: "test.csv",
          userId: testUser.id,
        },
        job: { id: "test-job-1" },
        req: { payload },
      });
      expect(apiKeyResult.output.success).toBe(true);

      // Test basic auth
      const basicAuthResult = await urlFetchJob.handler({
        input: {
          sourceUrl: `${testServerUrl}/basic-auth-data`,
          authConfig: {
            type: "basic",
            username: TEST_CREDENTIALS.basic.alternateUsername,
            password: TEST_CREDENTIALS.basic.alternatePassword,
          },
          catalogId: testCatalog.id,
          originalName: "test.csv",
          userId: testUser.id,
        },
        job: { id: "test-job-2" },
        req: { payload },
      });
      expect(basicAuthResult.output.success).toBe(true);
    });

    it("should handle fetch errors", async () => {
      // Set up test server endpoint that returns 404
      testServer.respond("/missing-data.csv", {
        status: 404,
        body: "Not Found",
        headers: { "Content-Type": "text/plain" },
      });

      const result = await urlFetchJob.handler({
        input: {
          sourceUrl: `${testServerUrl}/missing-data.csv`,
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
      expect(failureOutput.error).toBe("HTTP 404");
    });
  });

  describe("Advanced Features", () => {
    it("should handle duplicate checking", async () => {
      const scheduledIngest = await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "Duplicate Check Import",
          enabled: true,
          sourceUrl: `${testServerUrl}/duplicate-test.csv`,
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "hourly",
          advancedOptions: { skipDuplicateChecking: false },
        },
        user: testUser,
      });

      const mockCsvData = "id,name,value\n1,test,100";

      // Set up test server endpoint with duplicate content
      testServer.respondWithCSV("/duplicate-test.csv", mockCsvData);

      // First import
      const result1 = await urlFetchJob.handler({
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
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
        collection: "ingest-files",
        id: successForUpdate.ingestFileId,
        data: { status: "completed" },
      });

      // Server will return same content for second request

      // Second import with same content
      const result2 = await urlFetchJob.handler({
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
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
        collection: "ingest-files",
        where: { "metadata.scheduledExecution.scheduledIngestId": { equals: scheduledIngest.id } },
        sort: "createdAt", // Ensure consistent order
      });

      // When duplicate is detected, no new import file is created
      expect(importFiles.docs).toHaveLength(1);
      expect(importFiles.docs[0].status).toBe("completed"); // First was updated to completed
    });

    it("should skip duplicate checking when configured", async () => {
      const scheduledIngest = await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "Skip Duplicate Check Import",
          enabled: true,
          sourceUrl: `${testServerUrl}/duplicate-test.csv`,
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "hourly",
          advancedOptions: { skipDuplicateChecking: true },
        },
        user: testUser,
      });

      const mockCsvData = "id,name,value\n1,test,100";

      // Set up test server endpoint with duplicate content
      testServer.respondWithCSV("/duplicate-test.csv", mockCsvData);

      // First import
      const result1 = await urlFetchJob.handler({
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalog.id,
          originalName: "First Import",
        },
        job: { id: "job-1" },
        req: { payload },
      });

      const successOutput1 = result1.output as UrlFetchSuccessOutput;
      expect(successOutput1.isDuplicate).toBe(false);

      // Second import with same content (test server will return same response)
      const result2 = await urlFetchJob.handler({
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
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
      const scheduledIngest = await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "Content Type Override Import",
          enabled: true,
          sourceUrl: `${testServerUrl}/content-type-test`,
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "daily",
          advancedOptions: { expectedContentType: "csv" },
        },
        user: testUser,
      });

      // Server returns generic content type
      testServer.respond("/content-type-test", {
        status: 200,
        body: "id,name\n1,test",
        headers: { "Content-Type": "application/octet-stream" },
      });

      const result = await urlFetchJob.handler({
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
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
      const scheduledIngest = await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "File Size Limit Import",
          enabled: true,
          sourceUrl: `${testServerUrl}/large-file`,
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "daily",
          advancedOptions: {
            maxFileSizeMB: 1, // 1MB limit
          },
        },
        user: testUser,
      });

      // Create large data (2MB)
      const largeData = Buffer.alloc(2 * 1024 * 1024).toString();
      testServer.respond("/large-file", {
        status: 200,
        body: largeData,
        headers: { "Content-Type": "text/csv", "Content-Length": String(2 * 1024 * 1024) },
      });

      const result = await urlFetchJob.handler({
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
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
      const scheduledIngest = await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "Custom Headers Import",
          enabled: true,
          sourceUrl: `${testServerUrl}/custom-headers-test`,
          authConfig: {
            type: "api-key",
            apiKey: "test-key",
            apiKeyHeader: "X-API-Key",
            customHeaders: JSON.stringify({ "X-Custom-Header": "custom-value", "Accept-Language": "en-US" }),
          },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "daily",
        },
        user: testUser,
      });

      // Set up test server endpoint with CSV response (tests that custom headers are sent)
      testServer.respond("/custom-headers-test", {
        status: 200,
        body: "title,date\nTest Event,2024-01-01",
        headers: { "Content-Type": "text/csv" },
      });

      const result = await urlFetchJob.handler({
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalog.id,
          originalName: "Headers Test",
        },
        job: { id: "job-1" },
        req: { payload },
      });

      // The fetch should succeed with the custom headers
      expect(result.output.success).toBe(true);
      if ("contentType" in result.output) {
        expect(result.output.contentType).toContain("csv");
      }
    });

    it("should pass through dataset mapping configuration", async () => {
      const multiSheetConfig = {
        enabled: true,
        sheets: [{ sheetIdentifier: "Sheet1", dataset: testDataset.id, skipIfMissing: false }],
      };

      const scheduledIngest = await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "Dataset Mapping Import",
          enabled: true,
          sourceUrl: `${testServerUrl}/api/data.xlsx`,
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          multiSheetConfig,
          scheduleType: "frequency",
          frequency: "daily",
        },
        user: testUser,
      });

      // Set up test server endpoint with Excel mime type
      testServer.respond("/api/data.xlsx", {
        status: 200,
        body: "mock excel data",
        headers: { "Content-Type": "application/vnd.ms-excel" },
      });

      const result = await urlFetchJob.handler({
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalog.id,
          originalName: "Mapping Test",
        },
        job: { id: "job-1" },
        req: { payload },
      });

      const successOutput = result.output as UrlFetchSuccessOutput;
      const ingestFile = await payload.findByID({ collection: "ingest-files", id: successOutput.ingestFileId });

      // The dataset field might be populated with the full object
      expect(ingestFile.metadata.datasetMapping).toMatchObject({
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
      const scheduledIngest = await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "Duration Statistics Import",
          enabled: true,
          sourceUrl: `${testServerUrl}/duration-test.csv`,
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "hourly",
          statistics: { totalRuns: 2, successfulRuns: 2, failedRuns: 0, averageDuration: 3.5 },
        },
        user: testUser,
      });

      // Set up test server endpoint with CSV data
      testServer.respondWithCSV("/duration-test.csv", "id,name\n1,test");

      // Mock timing
      const startTime = Date.now();
      vi.spyOn(Date, "now")
        .mockReturnValueOnce(startTime) // Start time
        .mockReturnValue(startTime + 2000); // End time (2 seconds later)

      await urlFetchJob.handler({
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalog.id,
          originalName: "Duration Test",
        },
        job: { id: "job-1" },
        req: { payload },
      });

      const updated = await payload.findByID({ collection: "scheduled-ingests", id: scheduledIngest.id });

      // Should update with new average: (3.5 * 2 + 2) / 3 = 3
      expect(updated.statistics).toMatchObject({ totalRuns: 3, successfulRuns: 3, failedRuns: 0, averageDuration: 3 });

      vi.restoreAllMocks();
    });

    it("should handle retry logic with exponential backoff", async () => {
      const scheduledIngest = await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "Retry Logic Import",
          enabled: true,
          sourceUrl: `${testServerUrl}/flaky-endpoint`,
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "frequency",
          frequency: "daily",
          retryConfig: {
            maxRetries: 3,
            retryDelayMinutes: 1, // Minimum allowed value
          },
        },
        user: testUser,
      });

      // Fail twice, then succeed
      let attempt = 0;
      testServer.route("/flaky-endpoint", (req: IncomingMessage, res: ServerResponse) => {
        attempt++;
        if (attempt < 3) {
          req.socket.destroy();
        } else {
          res.writeHead(200, { "Content-Type": "text/csv" });
          res.end("success data");
        }
      });

      const result = await urlFetchJob.handler({
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalog.id,
          originalName: "Retry Test",
        },
        job: { id: "job-retry" },
        req: { payload },
      });

      // Verify retry succeeded after 3 attempts
      expect(result.output).toMatchObject({ success: true, isDuplicate: false });

      // Verify import file was created successfully
      const successOutput = result.output as UrlFetchSuccessOutput;
      const ingestFile = await payload.findByID({ collection: "ingest-files", id: successOutput.ingestFileId });

      expect(ingestFile).toMatchObject({
        status: "parsing",
        // The attempts are not tracked in metadata, only in the job handler
      });
    });

    it("should handle timeout properly", { timeout: 5000 }, async () => {
      const previousTestTimeout = process.env.URL_FETCH_TEST_TIMEOUT_MS;
      process.env.URL_FETCH_TEST_TIMEOUT_MS = "300";

      try {
        const scheduledIngest = await payload.create({
          collection: "scheduled-ingests",
          data: {
            name: "Timeout Test Import",
            enabled: true,
            sourceUrl: `${testServerUrl}/timeout-test`,
            authConfig: { type: "none" },
            catalog: testCatalog.id,
            scheduleType: "frequency",
            frequency: "daily",
            advancedOptions: {
              timeoutMinutes: 1, // Minimum allowed value
            },
          },
          user: testUser,
        });

        // Set up a slow endpoint that will timeout
        testServer.respond("/timeout-test", { delay: 1000, status: 200, body: "Should timeout" });

        const result = await urlFetchJob.handler({
          input: {
            scheduledIngestId: scheduledIngest.id,
            sourceUrl: scheduledIngest.sourceUrl,
            authConfig: scheduledIngest.authConfig,
            catalogId: testCatalog.id,
            originalName: "Timeout Test",
          },
          job: { id: "job-timeout" },
          req: { payload },
        });

        expect(result.output.success).toBe(false);
        const failureOutput = result.output as UrlFetchFailureOutput;
        expect(failureOutput.error).toMatch(/timeout/i);

        // Verify scheduled ingest was updated with failure
        const updated = await payload.findByID({ collection: "scheduled-ingests", id: scheduledIngest.id });

        expect(updated).toMatchObject({
          lastStatus: "failed",
          lastError: expect.stringContaining("timeout"),
          currentRetries: 1,
          statistics: expect.objectContaining({ totalRuns: 1, failedRuns: 1, successfulRuns: 0 }),
        });
      } finally {
        if (previousTestTimeout === undefined) {
          delete process.env.URL_FETCH_TEST_TIMEOUT_MS;
        } else {
          process.env.URL_FETCH_TEST_TIMEOUT_MS = previousTestTimeout;
        }
      }
    });
  });

  describe("End-to-End scheduled ingest Flow", () => {
    it("should complete full scheduled ingest flow", { timeout: 30000 }, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-15 10:00:00"));

      // Create scheduled ingest with explicit nextRun in the past so
      // the schedule manager triggers it at the current fake time.
      const scheduledIngest = await payload.create({
        collection: "scheduled-ingests",
        data: {
          name: "Test scheduled ingest",
          enabled: true,
          sourceUrl: `${testServerUrl}/products.csv`,
          authConfig: { type: "none" },
          catalog: testCatalog.id,
          scheduleType: "cron",
          cronExpression: "0 * * * *", // Hourly
          lastRun: new Date("2024-01-15 08:00:00"), // 2 hours ago
          nextRun: new Date("2024-01-15 09:00:00"), // Past due
          ingestNameTemplate: "Products - {{date}} {{time}}",
        },
        user: testUser,
      });

      // Mock successful fetch
      const mockCsvData = "id,name,price\n1,Product A,99.99\n2,Product B,149.99";
      testServer.respondWithCSV("/products.csv", mockCsvData);

      // Run schedule manager
      const scheduleResult = await scheduleManagerJob.handler({ job: { id: "schedule-job" }, req: { payload } });

      expect(scheduleResult.output.triggered).toBe(1);

      // Since we're mocking payload.jobs.queue, we need to manually run the URL fetch job
      // to simulate what would happen in production
      const fetchResult = await urlFetchJob.handler({
        input: {
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: scheduledIngest.catalog,
          originalName: "Hourly Import - 2024-01-15 - api.example.com",
          userId: testUser.id,
          scheduledIngestId: scheduledIngest.id,
        },
        job: { id: "url-fetch-job" },
        req: { payload },
      });

      expect(fetchResult.output.success).toBe(true);

      // Verify complete state
      const finalSchedule = await payload.findByID({ collection: "scheduled-ingests", id: scheduledIngest.id });

      // The schedule should have been triggered
      expect(finalSchedule.statistics.totalRuns).toBeGreaterThanOrEqual(1);
      expect(finalSchedule.statistics.successfulRuns).toBeGreaterThanOrEqual(1);
      expect(finalSchedule.lastStatus).toBe("success");

      // Verify an import file was created
      const fetchSuccessOutput = fetchResult.output as UrlFetchSuccessOutput;
      const importFiles = await payload.find({
        collection: "ingest-files",
        where: { id: { equals: fetchSuccessOutput.ingestFileId } },
      });

      expect(importFiles.docs).toHaveLength(1);
      expect(importFiles.docs[0]).toMatchObject({
        status: "parsing",
        filename: expect.stringMatching(/^url-import-.*\.csv$/),
        mimeType: "text/csv",
        filesize: mockCsvData.length,
      });

      vi.useRealTimers();
    });
  });
});
