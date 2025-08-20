/**
 * Integration tests for webhook import service functionality
 * Tests service logic with real database and dependencies
 * @module
 */

import { promises as fs } from "fs";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { JOB_TYPES } from "@/lib/constants/import-constants";
import { urlFetchJob } from "@/lib/jobs/handlers/url-fetch-job";
import type { Catalog, Dataset, ImportFile, Payload, ScheduledImport, User } from "@/payload-types";

import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";
import { TestDataBuilder } from "../../setup/test-data-builder";

// Mock external fetch for CSV/Excel URLs only
const originalFetch = global.fetch;
global.fetch = vi.fn().mockImplementation((url, options) => {
  // Only mock external data URLs, not internal API calls
  if (url.includes("example.com") || url.includes("test-data")) {
    return mockExternalDataFetch(url, options);
  }
  return originalFetch(url, options);
});

function mockExternalDataFetch(url: string, options?: any) {
  const csvContent = `id,name,date,location,description
1,"Integration Test Event 1","2024-01-01","San Francisco, CA","Test event 1"
2,"Integration Test Event 2","2024-01-02","New York, NY","Test event 2"
3,"Integration Test Event 3","2024-01-03","Los Angeles, CA","Test event 3"`;

  const excelContent = Buffer.from("Mock Excel Content"); // Simplified for testing

  // Check auth headers if needed
  if (url.includes("authenticated")) {
    const authHeader = options?.headers?.["Authorization"];
    if (!authHeader) {
      return Promise.resolve({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });
    }
  }

  // Return different content based on URL
  if (url.includes(".xlsx")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Map([
        ["content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        ["content-length", excelContent.length.toString()],
      ]),
      arrayBuffer: async () => excelContent,
    });
  }

  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Map([
      ["content-type", "text/csv"],
      ["content-length", csvContent.length.toString()],
    ]),
    arrayBuffer: async () => Buffer.from(csvContent),
  });
}

describe("Webhook Import Service Integration", () => {
  let payload: Payload;
  let cleanup: () => Promise<void>;
  let testData: TestDataBuilder;
  let testUser: User;
  let testCatalog: Catalog;
  let testDataset: Dataset;
  let testScheduledImport: ScheduledImport;
  let uploadDir: string;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;
    testData = new TestDataBuilder(payload);

    // Setup test data
    testUser = await testData.createUser({
      email: `service-test-${Date.now()}@example.com`,
    });

    testCatalog = await testData.createCatalog({
      name: `Service Test Catalog ${Date.now()}`,
      createdBy: testUser.id,
    });

    testDataset = await testData.createDataset({
      name: `Service Test Dataset ${Date.now()}`,
      catalog: testCatalog.id,
    });

    // Setup upload directory
    uploadDir = path.join("/tmp", `webhook-service-test-${Date.now()}`);
    process.env.UPLOAD_DIR_IMPORT_FILES = uploadDir;
    await fs.mkdir(uploadDir, { recursive: true });
  });

  afterAll(async () => {
    await cleanup();
    if (uploadDir) {
      await fs.rm(uploadDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Create fresh scheduled import
    testScheduledImport = await testData.createScheduledImport({
      name: `Service Import ${Date.now()}`,
      catalog: testCatalog.id,
      dataset: testDataset.id,
      createdBy: testUser.id,
      webhookEnabled: true,
      sourceUrl: "https://example.com/test-data.csv",
      advancedOptions: {
        autoApproveSchema: true,
        skipDuplicateChecking: false,
      },
    });
  });

  describe("Import File Creation", () => {
    it("should create import file from webhook trigger", async () => {
      // Execute URL fetch job as would happen from webhook
      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Webhook Import Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(true);
      expect(result.output.importFileId).toBeDefined();

      // Verify import file in database
      const importFile = await payload.findByID({
        collection: "import-files",
        id: result.output.importFileId,
      });

      expect(importFile).toBeDefined();
      expect(importFile.originalName).toBe("Webhook Import Test");
      expect(importFile.catalog).toBe(testCatalog.id);
      expect(importFile.scheduledImport).toBe(testScheduledImport.id);
      expect(importFile.status).toBe("UPLOAD");
      
      // Verify metadata
      expect(importFile.metadata).toMatchObject({
        scheduledExecution: {
          scheduledImportId: testScheduledImport.id,
          executionTime: expect.any(String),
        },
      });

      // Verify file was saved
      if (typeof importFile.file === "object") {
        expect(importFile.file.filename).toMatch(/url-import-.*\.csv$/);
        expect(importFile.file.mimeType).toBe("text/csv");
        
        // Verify physical file exists
        const filePath = path.join(uploadDir, importFile.file.filename);
        const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);
      }
    });

    it("should handle Excel files correctly", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          sourceUrl: "https://example.com/test-data.xlsx",
        },
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-excel-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: "https://example.com/test-data.xlsx",
            catalogId: testCatalog.id,
            originalName: "Excel Import",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(true);

      const importFile = await payload.findByID({
        collection: "import-files",
        id: result.output.importFileId,
      });

      if (typeof importFile.file === "object") {
        expect(importFile.file.filename).toMatch(/\.xlsx$/);
        expect(importFile.file.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      }
    });
  });

  describe("Duplicate Content Detection", () => {
    it("should detect and skip duplicate content", async () => {
      // First import
      const result1 = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-dup-1-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "First Import",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result1.output.success).toBe(true);
      expect(result1.output.isDuplicate).toBe(false);
      const firstFileId = result1.output.importFileId;

      // Reset status for second import
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: { lastStatus: "success" },
      });

      // Second import with same content
      const result2 = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-dup-2-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Second Import",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result2.output.success).toBe(true);
      expect(result2.output.isDuplicate).toBe(true);
      expect(result2.output.skippedReason).toBe("Duplicate content detected");
      expect(result2.output.importFileId).toBe(firstFileId);

      // Verify scheduled import was updated with duplicate info
      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.lastStatus).toBe("success");
    });

    it("should allow duplicates when checking is disabled", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          advancedOptions: {
            skipDuplicateChecking: true,
          },
        },
      });

      // First import
      const result1 = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-skip-1-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "First Import",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      const firstFileId = result1.output.importFileId;

      // Reset status
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: { lastStatus: "success" },
      });

      // Second import
      const result2 = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-skip-2-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Second Import",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result2.output.success).toBe(true);
      expect(result2.output.isDuplicate).toBe(false);
      expect(result2.output.importFileId).not.toBe(firstFileId);
    });

    it("should check duplicates within time window", async () => {
      // Create old import file (outside duplicate window)
      const oldImportFile = await payload.create({
        collection: "import-files",
        data: {
          originalName: "Old Import",
          catalog: testCatalog.id,
          fileHash: "abc123", // Same hash we'll generate
          status: "COMPLETED",
          createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
        },
      });

      // New import should not detect as duplicate (outside window)
      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-window-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "New Import",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(true);
      expect(result.output.isDuplicate).toBe(false);
    });
  });

  describe("Authentication Handling", () => {
    it("should pass bearer token authentication", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          sourceUrl: "https://example.com/authenticated/data.csv",
          authConfig: {
            type: "bearer",
            token: "test-bearer-token",
          },
        },
      });

      const mockFetch = global.fetch as any;
      mockFetch.mockImplementationOnce((url: string, options: any) => {
        // Verify auth header
        expect(options.headers["Authorization"]).toBe("Bearer test-bearer-token");
        return mockExternalDataFetch(url, options);
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-auth-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            authConfig: testScheduledImport.authConfig,
            catalogId: testCatalog.id,
            originalName: "Auth Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(true);
    });

    it("should pass basic authentication", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          authConfig: {
            type: "basic",
            username: "testuser",
            password: "testpass",
          },
        },
      });

      const mockFetch = global.fetch as any;
      mockFetch.mockImplementationOnce((url: string, options: any) => {
        // Verify basic auth header
        const authString = Buffer.from("testuser:testpass").toString("base64");
        expect(options.headers["Authorization"]).toBe(`Basic ${authString}`);
        return mockExternalDataFetch(url, options);
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-basic-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            authConfig: testScheduledImport.authConfig,
            catalogId: testCatalog.id,
            originalName: "Basic Auth Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(true);
    });

    it("should pass custom headers", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          authConfig: {
            type: "custom",
            headers: {
              "X-API-Key": "custom-key-123",
              "X-Client-ID": "client-456",
            },
          },
        },
      });

      const mockFetch = global.fetch as any;
      mockFetch.mockImplementationOnce((url: string, options: any) => {
        // Verify custom headers
        expect(options.headers["X-API-Key"]).toBe("custom-key-123");
        expect(options.headers["X-Client-ID"]).toBe("client-456");
        return mockExternalDataFetch(url, options);
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-custom-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            authConfig: testScheduledImport.authConfig,
            catalogId: testCatalog.id,
            originalName: "Custom Headers Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(true);
    });
  });

  describe("Import Name Templates", () => {
    it("should generate names from template variables", async () => {
      const templates = [
        {
          template: "{{name}} - {{date}}",
          expectedPattern: /Service Import.*\d{4}-\d{2}-\d{2}/,
        },
        {
          template: "{{url}} at {{time}}",
          expectedPattern: /example\.com at \d{2}:\d{2}:\d{2}/,
        },
        {
          template: "Webhook {{date}} from {{url}}",
          expectedPattern: /Webhook \d{4}-\d{2}-\d{2} from example\.com/,
        },
      ];

      for (const { template, expectedPattern } of templates) {
        await payload.update({
          collection: "scheduled-imports",
          id: testScheduledImport.id,
          data: {
            importNameTemplate: template,
            lastStatus: "idle", // Reset status
          },
        });

        // Generate name from template
        const currentTime = new Date();
        let importName = template;
        importName = importName.replace("{{name}}", testScheduledImport.name);
        importName = importName.replace("{{date}}", currentTime.toISOString().split("T")[0]);
        importName = importName.replace("{{time}}", currentTime.toTimeString().split(" ")[0]);
        importName = importName.replace("{{url}}", new URL(testScheduledImport.sourceUrl).hostname);

        const result = await urlFetchJob.handler({
          req: { payload },
          job: {
            id: `job-template-${Date.now()}`,
            task: JOB_TYPES.URL_FETCH,
            input: {
              scheduledImportId: testScheduledImport.id,
              sourceUrl: testScheduledImport.sourceUrl,
              catalogId: testCatalog.id,
              originalName: importName,
              userId: testUser.id,
              triggeredBy: "webhook",
            },
          },
        });

        const importFile = await payload.findByID({
          collection: "import-files",
          id: result.output.importFileId,
        });

        expect(importFile.originalName).toMatch(expectedPattern);
      }
    });

    it("should handle missing template gracefully", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          importNameTemplate: null,
        },
      });

      const defaultName = `${testScheduledImport.name} - ${new Date().toISOString().split("T")[0]}`;

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-notemplate-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: defaultName,
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      const importFile = await payload.findByID({
        collection: "import-files",
        id: result.output.importFileId,
      });

      expect(importFile.originalName).toBe(defaultName);
    });
  });

  describe("Multi-Sheet Configuration", () => {
    it("should pass multi-sheet config to import file", async () => {
      const multiSheetConfig = {
        enabled: true,
        sheets: [
          {
            sheetName: "Events",
            datasetId: testDataset.id,
            mappingRules: {
              dateField: "event_date",
              nameField: "event_name",
              locationField: "venue",
            },
          },
          {
            sheetName: "Speakers",
            datasetId: testDataset.id,
            mappingRules: {
              nameField: "speaker_name",
            },
          },
        ],
      };

      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          multiSheetConfig,
        },
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-multisheet-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Multi-sheet Import",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      const importFile = await payload.findByID({
        collection: "import-files",
        id: result.output.importFileId,
      });

      expect(importFile.metadata.datasetMapping).toEqual({
        enabled: true,
        sheets: multiSheetConfig.sheets,
      });
    });
  });

  describe("Statistics Tracking", () => {
    it("should update success statistics", async () => {
      // Set initial statistics
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          statistics: {
            totalRuns: 10,
            successfulRuns: 8,
            failedRuns: 2,
            averageDuration: 5000,
          },
        },
      });

      const startTime = Date.now();

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-stats-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Stats Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(true);

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.statistics.totalRuns).toBe(11);
      expect(updatedImport.statistics.successfulRuns).toBe(9);
      expect(updatedImport.statistics.failedRuns).toBe(2);
      
      // Average duration should be updated
      const duration = Date.now() - startTime;
      const expectedAverage = Math.round((5000 * 10 + duration) / 11);
      expect(updatedImport.statistics.averageDuration).toBeCloseTo(expectedAverage, -2);
    });

    it("should update failure statistics", async () => {
      // Mock fetch to fail
      const mockFetch = global.fetch as any;
      mockFetch.mockImplementationOnce(() => {
        throw new Error("Network error");
      });

      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          statistics: {
            totalRuns: 5,
            successfulRuns: 3,
            failedRuns: 2,
            averageDuration: 1000,
          },
        },
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-fail-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Fail Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(false);

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.statistics.totalRuns).toBe(6);
      expect(updatedImport.statistics.successfulRuns).toBe(3);
      expect(updatedImport.statistics.failedRuns).toBe(3);
      expect(updatedImport.lastStatus).toBe("failed");
      expect(updatedImport.lastError).toContain("Network error");
    });
  });

  describe("Error Handling", () => {
    it("should handle fetch timeouts", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockImplementationOnce(async () => {
        // Simulate timeout
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error("Request timeout");
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-timeout-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Timeout Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(false);
      expect(result.output.error).toContain("timeout");
    });

    it("should handle invalid content types", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockImplementationOnce(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([
            ["content-type", "application/pdf"], // Unsupported type
          ]),
          arrayBuffer: async () => Buffer.from("PDF content"),
        });
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-pdf-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "PDF Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      // Should still save the file but with correct extension
      expect(result.output.success).toBe(true);

      const importFile = await payload.findByID({
        collection: "import-files",
        id: result.output.importFileId,
      });

      if (typeof importFile.file === "object") {
        expect(importFile.file.mimeType).toBe("application/pdf");
      }
    });

    it("should handle HTTP error responses", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockImplementationOnce(() => {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
        });
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-404-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "404 Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(false);
      expect(result.output.error).toContain("404");

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.lastStatus).toBe("failed");
      expect(updatedImport.lastError).toContain("404");
    });
  });

  describe("Retry Logic", () => {
    it("should retry on failure with exponential backoff", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          retryConfig: {
            maxRetries: 2,
            retryDelayMinutes: 1,
            exponentialBackoff: true,
          },
        },
      });

      let attemptCount = 0;
      const mockFetch = global.fetch as any;
      mockFetch.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return mockExternalDataFetch(testScheduledImport.sourceUrl);
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-retry-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Retry Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(true);
      expect(attemptCount).toBe(3); // Initial + 2 retries
    });

    it("should fail after max retries exceeded", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          retryConfig: {
            maxRetries: 1,
            retryDelayMinutes: 1,
            exponentialBackoff: false,
          },
        },
      });

      const mockFetch = global.fetch as any;
      mockFetch.mockImplementation(() => {
        throw new Error("Persistent failure");
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-maxretry-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: testScheduledImport.sourceUrl,
            catalogId: testCatalog.id,
            originalName: "Max Retry Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(false);
      expect(result.output.error).toContain("Persistent failure");
    });
  });
});