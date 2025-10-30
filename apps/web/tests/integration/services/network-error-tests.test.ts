// @vitest-environment node
/**
 * Network Error Handling Tests for Scheduled Imports.
 *
 * Tests various network failure scenarios including:
 * - Malformed URLs
 * - DNS failures
 * - Connection failures
 * - Partial downloads
 * - Corrupted file handling.
 *
 * This test uses real HTTP servers instead of mocking to ensure
 * authentic network behavior testing.
 *
 * Uses node environment instead of jsdom to avoid AbortController compatibility issues
 * with Node 24's native fetch API..
 *
 * @module
 */

import type { Server } from "http";
import { createServer } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { urlFetchJob } from "@/lib/jobs/handlers/url-fetch-job";
import { createIntegrationTestEnvironment } from "@/tests/setup/test-environment-builder";

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
type UrlFetchErrorOutput = UrlFetchFailureOutput;

describe.sequential("Network Error Handling Tests", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testUserId: string;
  let testCatalogId: string;
  let testServer: Server;
  let testServerPort: number;
  let testServerUrl: string;

  // Helper to get a random port
  const getRandomPort = () => Math.floor(Math.random() * 10000) + 40000;

  // Helper to create test server with specific behavior
  const createTestServer = (handler: (req: any, res: any) => void): Promise<void> => {
    return new Promise((resolve) => {
      testServer = createServer(handler);
      testServerPort = getRandomPort();
      testServer.listen(testServerPort, "127.0.0.1", () => {
        testServerUrl = `http://127.0.0.1:${testServerPort}`;
        resolve();
      });
    });
  };

  // Helper to close test server
  const closeTestServer = (): Promise<void> => {
    return new Promise((resolve) => {
      if (testServer) {
        testServer.close(() => {
          testServer = undefined as any;
          resolve();
        });
      } else {
        resolve();
      }
    });
  };

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;

    // Create test user
    const user = await payload.create({
      collection: "users",
      data: {
        email: "network-test@example.com",
        password: "test123456",
        role: "admin",
      },
    });
    testUserId = user.id;

    // Create test catalog
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: "Network Test Catalog",
        description: "Catalog for network error tests",
      },
    });
    testCatalogId = catalog.id;
  }, 60000);

  afterAll(async () => {
    await closeTestServer();
    await cleanup();
  });

  beforeEach(async () => {
    await closeTestServer();
  });

  describe("Malformed URL Handling", () => {
    it("should reject completely invalid URLs", async () => {
      await expect(
        payload.create({
          collection: "scheduled-imports",
          data: {
            name: "Invalid URL Import",
            sourceUrl: "not-a-url",
            enabled: true,
            catalog: testCatalogId as any,
            scheduleType: "frequency",
            frequency: "daily",
          },
        })
      ).rejects.toThrow(/The following field is invalid: Source URL/);
    });

    it("should reject URLs with invalid protocols", async () => {
      await expect(
        payload.create({
          collection: "scheduled-imports",
          data: {
            name: "FTP URL Import",
            sourceUrl: "ftp://example.com/file.csv",
            enabled: true,
            catalog: testCatalogId as any,
            scheduleType: "frequency",
            frequency: "daily",
          },
        })
      ).rejects.toThrow(/The following field is invalid: Source URL/);
    });

    it("should handle URLs with spaces (encoded properly)", async () => {
      // Create a test server that returns 404 for paths with spaces
      await createTestServer((req, res) => {
        if (req.url?.includes("file%20with%20spaces.csv") || req.url?.includes("file with spaces.csv")) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        } else {
          res.writeHead(200, { "Content-Type": "text/csv" });
          res.end("test,data\n1,2");
        }
      });

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "URL with Spaces Import",
          sourceUrl: `${testServerUrl}/file with spaces.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-1" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(false);
      if (!result.output.success) {
        const failureOutput = result.output as UrlFetchFailureOutput;
        expect(failureOutput.error).toContain("404");
      }
    });
  });

  describe("DNS Resolution Failures", () => {
    it("should handle non-existent domain names", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "DNS Failure Import",
          sourceUrl: "https://this-domain-definitely-does-not-exist-12345.com/file.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Execute the job - real DNS will fail for non-existent domain
      const result = await urlFetchJob.handler({
        job: { id: "test-job-2" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(false);
      if (!result.output.success) {
        const failureOutput = result.output as UrlFetchFailureOutput;
        expect(failureOutput.error).toMatch(/ENOTFOUND|getaddrinfo|network|fetch failed/i);
      }
    });
  });

  describe("Connection Failures", () => {
    it("should handle connection refused errors", async () => {
      // Use a port that's guaranteed to be refused (1 is privileged and likely unused)
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Connection Refused Import",
          sourceUrl: "http://127.0.0.1:1/file.csv", // Port 1 should be refused
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Execute the job - real connection will be refused
      const result = await urlFetchJob.handler({
        job: { id: "test-job-3" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(false);
      if (!result.output.success) {
        const failureOutput = result.output as UrlFetchFailureOutput;
        expect(failureOutput.error).toMatch(/ECONNREFUSED|connection refused|network|fetch failed/i);
      }
    });

    it("should handle connection timeout", async () => {
      // Create a server that accepts connections but never responds
      await createTestServer((_req, _res) => {
        // Don't respond, causing a timeout
        // The connection is established but no data is sent
      });

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Timeout Import",
          sourceUrl: `${testServerUrl}/slow-file.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          advancedOptions: {
            timeoutMinutes: 1, // Minimum allowed (in test env this becomes 3 seconds)
          },
          retryConfig: {
            maxRetries: 0, // No retries for timeout test to avoid exceeding test timeout
            retryDelayMinutes: 1, // Minimum allowed
            exponentialBackoff: false,
          },
        },
      });

      // Execute the job - should timeout in 3 seconds (test environment timeout)
      const result = await urlFetchJob.handler({
        job: { id: "test-job-4" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      // Should fail due to timeout
      expect(result.output.success).toBe(false);
      if (!result.output.success) {
        const failureOutput = result.output as UrlFetchFailureOutput;
        expect(failureOutput.error).toMatch(/abort|timeout|fetch failed/i);
      }
    }, 8000); // Allow 8 seconds for the test (3s timeout + buffer)
  });

  describe("HTTP Error Responses", () => {
    it("should handle 404 Not Found", async () => {
      // Create test server that returns 404
      await createTestServer((_req, res) => {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      });

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "404 Import",
          sourceUrl: `${testServerUrl}/missing.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-5" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(false);
      if (!result.output.success) {
        const failureOutput = result.output as UrlFetchFailureOutput;
        expect(failureOutput.error).toContain("404");
      }
    });

    it("should handle 500 Internal Server Error", async () => {
      // Create test server that returns 500
      await createTestServer((_req, res) => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      });

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "500 Import",
          sourceUrl: `${testServerUrl}/error.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-6" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(false);
      if (!result.output.success) {
        const failureOutput = result.output as UrlFetchFailureOutput;
        expect(failureOutput.error).toContain("500");
      }
    });

    it("should handle authentication failures", async () => {
      // Create test server that checks for authorization header
      await createTestServer((req, res) => {
        const authHeader = req.headers.authorization;
        if (authHeader !== "Bearer valid-token") {
          res.writeHead(401, { "Content-Type": "text/plain" });
          res.end("Unauthorized");
        } else {
          res.writeHead(200, { "Content-Type": "text/csv" });
          res.end("test,data\n1,2");
        }
      });

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Auth Failure Import",
          sourceUrl: `${testServerUrl}/protected.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          authConfig: {
            type: "bearer",
            bearerToken: "invalid-token",
          },
        },
      });

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-7" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(false);
      if (!result.output.success) {
        const failureOutput = result.output as UrlFetchFailureOutput;
        expect(failureOutput.error).toContain("401");
      }
    });
  });

  describe("Partial Download Handling", () => {
    it("should handle connection drops mid-download", async () => {
      // Create test server that sends partial data then closes connection
      await createTestServer((_req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/csv",
          "Content-Length": "1000", // Claim 1000 bytes but send less
        });
        res.write("test,data\n"); // Send partial data
        // Abruptly close the connection
        setTimeout(() => res.destroy(), 10);
      });

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Partial Download Import",
          sourceUrl: `${testServerUrl}/partial.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-8" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      // May succeed if the partial data is valid CSV, or fail if connection is detected as broken
      // The important thing is it doesn't hang or crash
      expect(result.output).toBeDefined();
    });
  });

  describe("Content Type Mismatches", () => {
    it("should handle wrong content type when expecting CSV", async () => {
      // Create test server that returns HTML instead of CSV
      await createTestServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body>Not a CSV</body></html>");
      });

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Wrong Content Type Import",
          sourceUrl: `${testServerUrl}/wrong-type.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          advancedConfig: {
            expectedContentType: "csv",
          },
        },
      });

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-9" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      // Handler currently accepts HTML and overrides content type to CSV
      // This is documented behavior
      expect(result.output.success).toBe(true);
      if (result.output.success) {
        const successOutput = result.output as UrlFetchSuccessOutput;
        expect(successOutput.contentType).toBe("text/csv");
      }
    });

    it("should handle binary data when expecting text", async () => {
      // Create test server that returns binary data
      await createTestServer((_req, res) => {
        const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(binaryData);
      });

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Binary Data Import",
          sourceUrl: `${testServerUrl}/binary.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          advancedConfig: {
            expectedContentType: "csv",
          },
        },
      });

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-10" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      // Handler should reject binary data when expecting CSV
      expect(result.output.success).toBe(false);
      if (!result.output.success) {
        const errorOutput = result.output as UrlFetchErrorOutput;
        // Binary data causes parsing error when expecting CSV
        expect(errorOutput.error).toBeDefined();
        expect(typeof errorOutput.error).toBe("string");
      }
    });
  });

  describe("File Size Handling", () => {
    it("should reject files exceeding max size limit", async () => {
      // Create test server that returns large data
      await createTestServer((_req, res) => {
        const largeData = "x".repeat(2 * 1024 * 1024); // 2MB of data
        res.writeHead(200, {
          "Content-Type": "text/csv",
          "Content-Length": String(largeData.length),
        });
        res.end(largeData);
      });

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Large File Import",
          sourceUrl: `${testServerUrl}/large.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          advancedOptions: {
            maxFileSizeMB: 1, // 1MB limit
          },
        },
      });

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-11" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      // Handler should reject files exceeding max size limit
      expect(result.output.success).toBe(false);
      if (!result.output.success) {
        const failureOutput = result.output as UrlFetchFailureOutput;
        expect(failureOutput.error).toContain("too large");
      }
    });
  });

  describe("Redirect Handling", () => {
    it("should follow redirects", async () => {
      let requestCount = 0;
      // Create test server that redirects then returns data
      await createTestServer((_req, res) => {
        requestCount++;
        if (requestCount === 1) {
          // First request: redirect
          res.writeHead(302, { Location: `${testServerUrl}/final.csv` });
          res.end();
        } else {
          // Second request: return data
          res.writeHead(200, { "Content-Type": "text/csv" });
          res.end("test,data\n1,2");
        }
      });

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Redirect Import",
          sourceUrl: `${testServerUrl}/redirect1.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Execute the job - fetch follows redirects automatically
      const result = await urlFetchJob.handler({
        job: { id: "test-job-12" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(true);
    });

    it("should handle too many redirects", async () => {
      // Create test server that always redirects (infinite loop)
      await createTestServer((req, res) => {
        // Always redirect to a slightly different URL
        const currentPath = req.url || "/";
        const nextPath = currentPath + "x";
        res.writeHead(302, { Location: `${testServerUrl}${nextPath}` });
        res.end();
      });

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Infinite Redirect Import",
          sourceUrl: `${testServerUrl}/loop.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Execute the job - should fail due to too many redirects
      const result = await urlFetchJob.handler({
        job: { id: "test-job-13" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUserId,
        },
      });

      // Fetch API has built-in redirect limit (typically 20)
      expect(result.output.success).toBe(false);
      if (!result.output.success) {
        const failureOutput = result.output as UrlFetchFailureOutput;
        // The actual error message varies by Node version
        expect(failureOutput.error).toMatch(/redirect|fetch failed/i);
      }
    });
  });

  describe("Real Job Queue Integration", () => {
    it("should queue follow-up jobs using real payload.jobs.queue", async () => {
      // Create test server that returns valid CSV
      await createTestServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/csv" });
        res.end("name,date,location\nEvent 1,2024-01-01,San Francisco\n");
      });

      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Real Queue Test Import",
          sourceUrl: `${testServerUrl}/data.csv`,
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Execute the job with real job queue
      const result = await urlFetchJob.handler({
        job: { id: "test-job-queue" },
        req: { payload },
        input: {
          scheduledImportId: scheduledImport.id,
          sourceUrl: scheduledImport.sourceUrl,
          authConfig: scheduledImport.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Queue Test Import",
          userId: testUserId,
        },
      });

      expect(result.output.success).toBe(true);
      if (result.output.success) {
        const successOutput = result.output as UrlFetchSuccessOutput;
        expect(successOutput.importFileId).toBeDefined();
        expect(successOutput.contentType).toBe("text/csv");

        // Verify the import file was created
        const importFile = await payload.findByID({
          collection: "import-files",
          id: successOutput.importFileId,
        });
        expect(importFile).toBeDefined();
        // Status should be "parsing" because afterChange hook queues dataset-detection job immediately
        expect(importFile.status).toBe("parsing");

        // The real job queue was called to queue schema detection
        // The status is "parsing" after the afterChange hook completes
      }
    });
  });
});
