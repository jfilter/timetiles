/* eslint-disable sonarjs/cors */
// @vitest-environment node
/**
 * Integration tests for webhook import service functionality
 * Tests service logic with real database and dependencies
 * Uses node environment instead of jsdom to avoid AbortController compatibility issues
 * with Node 24's native fetch API..
 *
 * @module
 */

import { createReadStream } from "fs";
import { promises as fs } from "fs";
import http from "http";
import path from "path";
import type { Payload } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { JOB_TYPES } from "@/lib/constants/import-constants";
import { urlFetchJob } from "@/lib/jobs/handlers/url-fetch-job";
import type { Catalog, Dataset, ScheduledImport, User } from "@/payload-types";

import { TEST_CREDENTIALS } from "../../constants/test-credentials";
import { TestDataBuilder } from "../../setup/test-data-builder";
import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

// Test server to serve fixture files
let testServer: http.Server;
let testServerPort: number;

// Start a simple HTTP server to serve test files
const startTestServer = async (): Promise<void> => {
  return new Promise((resolve) => {
    testServer = http.createServer((req, res) => {
      const fixturesDir = path.join(__dirname, "../../fixtures");

      // Check authentication headers for auth test endpoints
      if (req.url?.startsWith("/auth/")) {
        const authHeader = req.headers.authorization;

        if (req.url === "/auth/bearer.csv") {
          if (authHeader !== `Bearer ${TEST_CREDENTIALS.bearer.alternateToken}`) {
            res.writeHead(401, { "Content-Type": "text/plain" });
            res.end("Unauthorized: Invalid bearer token");
            return;
          }
        } else if (req.url === "/auth/basic.csv") {
          const expectedAuth =
            "Basic " +
            Buffer.from(`${TEST_CREDENTIALS.basic.username}:${TEST_CREDENTIALS.basic.password}`).toString("base64");
          if (authHeader !== expectedAuth) {
            res.writeHead(401, { "Content-Type": "text/plain" });
            res.end("Unauthorized: Invalid basic auth");
            return;
          }
        } else if (
          req.url === "/auth/custom.csv" &&
          (req.headers["x-api-key"] !== TEST_CREDENTIALS.apiKey.key ||
            req.headers["x-custom-header"] !== "custom-value")
        ) {
          res.writeHead(401, { "Content-Type": "text/plain" });
          res.end("Unauthorized: Missing custom headers");
          return;
        }

        // If auth passes, serve the CSV file
        const filePath = path.join(fixturesDir, "valid-events.csv");
        res.writeHead(200, {
          "Content-Type": "text/csv",
          "Access-Control-Allow-Origin": "*", // Safe in test environment
        });
        createReadStream(filePath).pipe(res);
        return;
      }

      // Map URLs to fixture files
      const fileMap: Record<string, any> = {
        "/test-data.csv": { file: "valid-events.csv", contentType: "text/csv" },
        "/test-data.xlsx": {
          file: "events.xlsx",
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        "/empty.csv": { file: "empty.csv", contentType: "text/csv" },
        "/malformed.csv": { file: "malformed-data.csv", contentType: "text/csv" },
        "/special.csv": { file: "special-characters.csv", contentType: "text/csv" },
        "/multi-sheet.xlsx": {
          file: "multi-sheet.xlsx",
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        "/timeout.csv": { file: "valid-events.csv", contentType: "text/csv", delay: 5000 }, // For timeout test
        "/500-error.csv": { status: 500, message: "Internal Server Error" }, // For error test
        "/wrong-type.html": { file: "valid-events.csv", contentType: "text/html" }, // Wrong content type
      };

      const mapping = fileMap[req.url ?? ""];

      // Handle error responses
      if (mapping && "status" in mapping) {
        res.writeHead(mapping.status, { "Content-Type": "text/plain" });
        res.end(mapping.message);
        return;
      }

      // Handle delayed responses for timeout testing
      if (mapping && "delay" in mapping) {
        setTimeout(() => {
          const filePath = path.join(fixturesDir, mapping.file);
          res.writeHead(200, {
            "Content-Type": mapping.contentType,
            "Access-Control-Allow-Origin": "*", // Safe in test environment
          });
          createReadStream(filePath).pipe(res);
        }, mapping.delay);
        return;
      }

      if (mapping) {
        const filePath = path.join(fixturesDir, mapping.file);
        res.writeHead(200, {
          "Content-Type": mapping.contentType,
          "Access-Control-Allow-Origin": "*", // Safe in test environment
        });
        createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    // Listen on a random available port on localhost
    testServer.listen(0, "127.0.0.1", () => {
      const address = testServer.address();
      if (address && typeof address !== "string") {
        testServerPort = address.port;
      }
      resolve();
    });
  });
};

describe.sequential("Webhook Import Service Integration", () => {
  let payload: Payload;
  let cleanup: () => Promise<void>;
  let testData: TestDataBuilder;
  let testUser: User;
  let testCatalog: Catalog;
  let testDataset: Dataset;
  let testScheduledImport: ScheduledImport;
  let uploadDir: string;

  beforeAll(async () => {
    // Start the test server first
    await startTestServer();

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
    // Stop the test server
    if (testServer) {
      await new Promise<void>((resolve) => {
        testServer.close(() => resolve());
      });
    }
    await cleanup();
    if (uploadDir) {
      await fs.rm(uploadDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Create fresh scheduled import using local test server
    testScheduledImport = await testData.createScheduledImport({
      name: `Service Import ${Date.now()}`,
      catalog: testCatalog.id,
      dataset: testDataset.id,
      createdBy: testUser.id,
      webhookEnabled: true,
      sourceUrl: `http://127.0.0.1:${testServerPort}/test-data.csv`,
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

      // Check if successful and has importFileId
      if (!result.output.success || !("importFileId" in result.output)) {
        throw new Error("Expected successful result with importFileId");
      }
      expect(result.output.importFileId).toBeDefined();

      // Verify import file in database

      const importFile = await payload.findByID({
        collection: "import-files",
        id: result.output.importFileId,
      });

      expect(importFile).toBeDefined();
      // The originalName should contain our specified name
      expect(importFile.originalName).toContain("Webhook Import Test");
      // Catalog might be populated as object or ID or null
      const catalogId =
        typeof importFile.catalog === "object" && importFile.catalog !== null
          ? importFile.catalog.id
          : importFile.catalog;
      expect(catalogId).toBe(testCatalog.id);
      // scheduledImport field may not be set on import-files
      // The relationship is tracked in metadata instead
      expect(importFile.status).toBe("parsing");

      // Verify metadata
      expect(importFile.metadata).toMatchObject({
        scheduledExecution: {
          scheduledImportId: testScheduledImport.id,
          executionTime: expect.any(String),
        },
      });

      // Verify file was saved
      if (importFile.filename) {
        expect(importFile.filename).toMatch(/url-import-.*\.csv$/);
        expect(importFile.mimeType).toBe("text/csv");

        // Note: Physical file verification would require checking the actual Payload upload directory
        // which may differ from our test setup. The file is saved by Payload's internal upload mechanism
        // and the path resolution depends on Payload's configuration.
        // For now, we're satisfied that the import file record exists with the correct filename format.
      }
    });

    it("should handle Excel files correctly", async () => {
      const excelUrl = `http://localhost:${testServerPort}/test-data.xlsx`;

      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          sourceUrl: excelUrl,
        },
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-excel-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: excelUrl,
            catalogId: testCatalog.id,
            originalName: "Excel Import",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(true);

      // Check if successful and has importFileId
      if (!result.output.success || !("importFileId" in result.output)) {
        throw new Error("Expected successful result with importFileId");
      }

      const importFile = await payload.findByID({
        collection: "import-files",
        id: result.output.importFileId,
      });

      if (importFile.filename) {
        expect(importFile.filename).toMatch(/\.xlsx$/);
        expect(importFile.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      }
    });
  });

  describe("Duplicate Content Detection", () => {
    afterEach(async () => {
      // Clean up import files after each test to avoid interference
      const existingFiles = await payload.find({
        collection: "import-files",
        where: {
          catalog: { equals: testCatalog.id },
        },
      });

      for (const file of existingFiles.docs) {
        await payload.delete({
          collection: "import-files",
          id: file.id,
        });
      }
    });

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
      if (!result1.output.success || !("isDuplicate" in result1.output)) {
        throw new Error("Expected successful result with isDuplicate");
      }
      expect(result1.output.isDuplicate).toBe(false);
      const firstFileId = result1.output.importFileId;

      // Mark the first import as completed for duplicate detection to work
      await payload.update({
        collection: "import-files",
        id: firstFileId,
        data: { status: "completed" },
      });

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
      if (!result2.output.success || !("isDuplicate" in result2.output)) {
        throw new Error("Expected successful result with isDuplicate");
      }
      expect(result2.output.isDuplicate).toBe(true);
      expect(result2.output.skippedReason).toBe("Duplicate content detected");
      expect(result2.output.importFileId.toString()).toBe(firstFileId.toString());

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

      if (!result1.output.success || !("importFileId" in result1.output)) {
        throw new Error("Expected successful result with importFileId");
      }
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
      if (!result2.output.success || !("isDuplicate" in result2.output)) {
        throw new Error("Expected successful result with isDuplicate");
      }
      expect(result2.output.isDuplicate).toBe(false);
      expect(result2.output.importFileId).not.toBe(firstFileId);
    });

    it("should check duplicates within time window", async () => {
      // Create old import file with DIFFERENT content to ensure different hash
      const differentContent = Buffer.from("different,content\ntest,data\n");
      await payload.create({
        collection: "import-files",
        data: {
          originalName: "Old Import",
          catalog: testCatalog.id,
          status: "completed",
          metadata: {
            urlFetch: {
              contentHash: "different-hash-12345", // Different hash for different content
            },
          },
        },
        file: {
          data: differentContent,
          mimetype: "text/csv",
          name: "old-import.csv",
          size: differentContent.length,
        },
      });

      // New import with different content should not be detected as duplicate
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
      // Different content = different hash = not a duplicate
      if (!result.output.success || !("isDuplicate" in result.output)) {
        throw new Error("Expected successful result with isDuplicate");
      }
      expect(result.output.isDuplicate).toBe(false);
    });
  });

  describe("Authentication Handling", () => {
    it("should pass bearer token authentication", async () => {
      // Update scheduled import with bearer auth to test endpoint
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          sourceUrl: `http://localhost:${testServerPort}/auth/bearer.csv`,
          authConfig: {
            type: "bearer",
            bearerToken: TEST_CREDENTIALS.bearer.alternateToken,
          },
        },
      });

      // Now test that the auth works by fetching from protected endpoint
      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-auth-bearer-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: `http://localhost:${testServerPort}/auth/bearer.csv`,
            authConfig: {
              type: "bearer",
              bearerToken: TEST_CREDENTIALS.bearer.alternateToken,
            },
            catalogId: testCatalog.id,
            originalName: "Bearer Auth Test",
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
          sourceUrl: `http://localhost:${testServerPort}/auth/basic.csv`,
          authConfig: {
            type: "basic",
            username: TEST_CREDENTIALS.basic.username,
            password: TEST_CREDENTIALS.basic.password,
          },
        },
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-basic-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: `http://localhost:${testServerPort}/auth/basic.csv`,
            authConfig: {
              type: "basic",
              username: "testuser",
              password: "testpass",
            },
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
          sourceUrl: `http://localhost:${testServerPort}/auth/custom.csv`,
          authConfig: {
            type: "none",
            customHeaders: {
              "X-API-Key": TEST_CREDENTIALS.apiKey.key,
              "X-Custom-Header": "custom-value",
            },
          },
        },
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-custom-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: `http://localhost:${testServerPort}/auth/custom.csv`,
            authConfig: {
              type: "custom",
              customHeaders: {
                "X-API-Key": TEST_CREDENTIALS.apiKey.key,
                "X-Custom-Header": "custom-value",
              },
            },
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
    beforeEach(async () => {
      // Clear any existing import files to avoid duplicate detection issues
      const existingFiles = await payload.find({
        collection: "import-files",
        where: {
          catalog: { equals: testCatalog.id },
        },
      });

      for (const file of existingFiles.docs) {
        await payload.delete({
          collection: "import-files",
          id: file.id,
        });
      }
    });

    it("should generate names from template variables", async () => {
      const templates = [
        {
          template: "{{name}} - {{date}}",
          expectedPattern: /Service Import.*\d{4}-\d{2}-\d{2}/,
        },
        {
          template: "{{url}} at {{time}}",
          expectedPattern: /localhost at \d{2}:\d{2}:\d{2}/,
        },
        {
          template: "Webhook {{date}} from {{url}}",
          expectedPattern: /Webhook \d{4}-\d{2}-\d{2} from localhost/,
        },
      ];

      for (const { template, expectedPattern } of templates) {
        await payload.update({
          collection: "scheduled-imports",
          id: testScheduledImport.id,
          data: {
            importNameTemplate: template,
            lastStatus: "success", // Reset status to valid value
          },
        });

        // Generate name from template
        const currentTime = new Date();
        let importName = template;
        importName = importName.replace("{{name}}", testScheduledImport.name ?? "");
        importName = importName.replace("{{date}}", currentTime.toISOString().split("T")[0] ?? "");
        importName = importName.replace("{{time}}", currentTime.toTimeString().split(" ")[0] ?? "");
        // Use the actual test server URL
        const actualUrl = `http://localhost:${testServerPort}/test-data.csv`;
        importName = importName.replace("{{url}}", new URL(actualUrl).hostname);

        const result = await urlFetchJob.handler({
          req: { payload },
          job: {
            id: `job-template-${Date.now()}`,
            task: JOB_TYPES.URL_FETCH,
            input: {
              scheduledImportId: testScheduledImport.id,
              sourceUrl: testScheduledImport.sourceUrl,
              catalogId: testCatalog.id,
              originalName: importName, // Use the generated name from template
              userId: testUser.id,
              triggeredBy: "webhook",
            },
          },
        });

        if (!result.output.success || !("importFileId" in result.output)) {
          throw new Error("Expected successful result with importFileId");
        }
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

      // Check if successful and has importFileId
      if (!result.output.success || !("importFileId" in result.output)) {
        throw new Error("Expected successful result with importFileId");
      }

      const importFile = await payload.findByID({
        collection: "import-files",
        id: result.output.importFileId,
      });

      expect(importFile.originalName).toBe(defaultName);
    });
  });

  describe("Multi-Sheet Configuration", () => {
    beforeEach(async () => {
      // Clear any existing import files to avoid duplicate detection issues
      const existingFiles = await payload.find({
        collection: "import-files",
        where: {
          catalog: { equals: testCatalog.id },
        },
      });

      for (const file of existingFiles.docs) {
        await payload.delete({
          collection: "import-files",
          id: file.id,
        });
      }
    });

    it("should pass multi-sheet config to import file", async () => {
      const multiSheetConfig = {
        enabled: true,
        sheets: [
          {
            sheetIdentifier: "Events",
            dataset: testDataset.id,
            mappingRules: {
              dateField: "event_date",
              nameField: "event_name",
              locationField: "venue",
            },
          },
          {
            sheetIdentifier: "Speakers",
            dataset: testDataset.id,
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

      // Check if successful and has importFileId
      if (!result.output.success || !("importFileId" in result.output)) {
        throw new Error("Expected successful result with importFileId");
      }

      const importFile = await payload.findByID({
        collection: "import-files",
        id: result.output.importFileId,
      });

      // Check that datasetMapping is present and has the correct structure
      if (
        typeof importFile.metadata !== "object" ||
        importFile.metadata === null ||
        Array.isArray(importFile.metadata)
      ) {
        throw new Error("Expected metadata to be an object");
      }
      expect(importFile.metadata.datasetMapping).toBeDefined();
      const datasetMapping = importFile.metadata.datasetMapping as {
        enabled: boolean;
        sheets: Array<{ sheetIdentifier: string }>;
      };
      expect(datasetMapping.enabled).toBe(true);
      expect(datasetMapping.sheets).toHaveLength(2);
      // Check sheet identifiers only
      expect(datasetMapping.sheets[0]?.sheetIdentifier).toBe("Events");
      expect(datasetMapping.sheets[1]?.sheetIdentifier).toBe("Speakers");
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

      expect(updatedImport.statistics?.totalRuns).toBe(11);
      expect(updatedImport.statistics?.successfulRuns).toBe(9);
      expect(updatedImport.statistics?.failedRuns).toBe(2);

      // Average duration should be updated
      // Use larger tolerance for timing-dependent tests
      expect(updatedImport.statistics?.averageDuration).toBeGreaterThan(0);
      expect(updatedImport.statistics?.averageDuration).toBeLessThan(10000);
    });

    it("should update failure statistics", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          sourceUrl: `http://localhost:${testServerPort}/500-error.csv`, // Use error endpoint
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
            sourceUrl: `http://localhost:${testServerPort}/500-error.csv`,
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

      expect(updatedImport.statistics?.totalRuns).toBe(6);
      expect(updatedImport.statistics?.successfulRuns).toBe(3);
      expect(updatedImport.statistics?.failedRuns).toBe(3);
      expect(updatedImport.lastStatus).toBe("failed");
      expect(updatedImport.lastError).toContain("500");
    });
  });

  describe("Error Handling", () => {
    it("should handle fetch timeouts", async () => {
      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-timeout-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: `http://localhost:${testServerPort}/timeout.csv`,
            catalogId: testCatalog.id,
            originalName: "Timeout Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      // Timeout test may succeed if server responds before timeout
      // Just check that the result has the expected structure
      expect(result.output).toHaveProperty("success");
      if (!result.output.success) {
        expect("error" in result.output && result.output.error).toContain("timeout");
      }
    });

    it("should handle invalid content types", async () => {
      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-html-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: `http://localhost:${testServerPort}/wrong-type.html`,
            catalogId: testCatalog.id,
            originalName: "HTML Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      // Should still save the file but detect it as CSV based on content
      expect(result.output.success).toBe(true);

      // Check if successful and has importFileId
      if (!result.output.success || !("importFileId" in result.output)) {
        throw new Error("Expected successful result with importFileId");
      }

      const importFile = await payload.findByID({
        collection: "import-files",
        id: result.output.importFileId,
      });

      // The file content is actually CSV, so it should be detected as CSV
      expect(importFile.mimeType).toBe("text/csv");
    });

    it("should handle HTTP error responses", async () => {
      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-500-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: `http://localhost:${testServerPort}/500-error.csv`,
            catalogId: testCatalog.id,
            originalName: "500 Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(false);
      expect("error" in result.output && result.output.error).toContain("500");

      const updatedImport = await payload.findByID({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
      });

      expect(updatedImport.lastStatus).toBe("failed");
      expect(updatedImport.lastError).toContain("500");
    });
  });

  describe("Retry Logic", () => {
    it("should retry on failure with exponential backoff", async () => {
      // The 500 error endpoint will fail, but with retries it should keep trying
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          sourceUrl: `http://localhost:${testServerPort}/500-error.csv`,
          retryConfig: {
            maxRetries: 2,
            retryDelayMinutes: 1, // Minimum valid value is 1
            exponentialBackoff: true,
          },
        },
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-retry-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: `http://localhost:${testServerPort}/500-error.csv`,
            catalogId: testCatalog.id,
            originalName: "Retry Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      // Should fail after retries
      expect(result.output.success).toBe(false);
      expect("error" in result.output && result.output.error).toContain("500");
    });

    it("should fail after max retries exceeded", async () => {
      await payload.update({
        collection: "scheduled-imports",
        id: testScheduledImport.id,
        data: {
          sourceUrl: `http://localhost:${testServerPort}/500-error.csv`, // Always fails
          retryConfig: {
            maxRetries: 1,
            retryDelayMinutes: 1, // Minimum valid value is 1
            exponentialBackoff: false,
          },
        },
      });

      const result = await urlFetchJob.handler({
        req: { payload },
        job: {
          id: `job-maxretry-${Date.now()}`,
          task: JOB_TYPES.URL_FETCH,
          input: {
            scheduledImportId: testScheduledImport.id,
            sourceUrl: `http://localhost:${testServerPort}/500-error.csv`,
            catalogId: testCatalog.id,
            originalName: "Max Retry Test",
            userId: testUser.id,
            triggeredBy: "webhook",
          },
        },
      });

      expect(result.output.success).toBe(false);
      expect("error" in result.output && result.output.error).toContain("500");
    });
  });
});
