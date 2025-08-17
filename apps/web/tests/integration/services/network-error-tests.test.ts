/**
 * Network Error Handling Tests for Scheduled Imports
 *
 * Tests various network failure scenarios including:
 * - Malformed URLs
 * - DNS failures
 * - Connection failures
 * - Partial downloads
 * - Corrupted file handling
 */

import { Readable } from "stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createIntegrationTestEnvironment } from "@/tests/setup/test-environment-builder";

// Mock fetch globally
global.fetch = vi.fn();

describe.sequential("Network Error Handling Tests", () => {
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

    // Mock payload.jobs.queue
    vi.spyOn(payload.jobs, "queue").mockResolvedValue({
      id: "mock-job-id",
      task: "url-fetch",
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);
  }, 60000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockReset();
    // Add specific mock implementations for network tests
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
      ).rejects.toThrow("URL must start with http:// or https://");
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
      ).rejects.toThrow("URL must start with http:// or https://");
    });

    it("should handle URLs with invalid characters gracefully", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Invalid Chars URL Import",
          sourceUrl: "https://example.com/file with spaces.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Mock the URL to return 404
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers(),
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

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
      expect(result.output.error).toContain("404");
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

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
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
      expect(result.output.error).toMatch(/ENOTFOUND|getaddrinfo|network/i);
    });
  });

  describe("Connection Failures", () => {
    it("should handle connection refused errors", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Connection Refused Import",
          sourceUrl: "http://localhost:1/file.csv", // Port 1 should be refused
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
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
      expect(result.output.error).toMatch(/ECONNREFUSED|connection refused|network/i);
    });

    it("should handle connection timeout", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Timeout Import",
          sourceUrl: "https://example.com/slow-file.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          timeoutSeconds: 1, // 1 second timeout
        },
      });

      // Mock a slow response
      // nock('https://example.com')
      // .get('/slow-file.csv')
      // .delayConnection(2000) // 2 second delay
      // .reply(200, 'test,data\n1,2');

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
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

      expect(result.output.success).toBe(false);
      expect(result.output.error).toContain("timeout");
    });
  });

  describe("HTTP Error Responses", () => {
    it("should handle 404 Not Found", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "404 Import",
          sourceUrl: "https://example.com/missing.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // nock('https://example.com')
      // .get('/missing.csv')
      // .reply(404, 'Not Found');

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

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
      expect(result.output.error).toContain("404");
    });

    it("should handle 500 Internal Server Error", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "500 Import",
          sourceUrl: "https://example.com/error.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // nock('https://example.com')
      // .get('/error.csv')
      // .reply(500, 'Internal Server Error');

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

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
      expect(result.output.error).toContain("500");
    });

    it("should handle authentication failures", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Auth Failure Import",
          sourceUrl: "https://example.com/protected.csv",
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

      // nock('https://example.com')
      // .get('/protected.csv')
      // .matchHeader('authorization', 'Bearer invalid-token')
      // .reply(401, 'Unauthorized');

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

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
      expect(result.output.error).toContain("401");
    });
  });

  describe("Partial Download Handling", () => {
    it("should handle connection drops mid-download", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Partial Download Import",
          sourceUrl: "https://example.com/partial.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Create a stream that errors after some data
      const brokenStream = new Readable({
        read() {
          this.push("header1,header2\n");
          this.push("data1,data2\n");
          // Emit error after pushing some data
          process.nextTick(() => {
            this.destroy(new Error("Connection reset by peer"));
          });
        },
      });

      // Mock a broken stream response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/csv", "content-length": "1000" }),
        arrayBuffer: async () => {
          throw new Error("Connection reset by peer");
        },
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

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

      expect(result.output.success).toBe(false);
      expect(result.output.error).toMatch(/Connection reset|stream|error/i);
    });
  });

  describe("Content Type Mismatches", () => {
    it("should handle wrong content type when expecting CSV", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Wrong Content Type Import",
          sourceUrl: "https://example.com/wrong-type.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          advancedConfig: {
            expectedContentType: "csv",
          },
        },
      });

      // Return HTML instead of CSV
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        arrayBuffer: async () => Buffer.from("<html><body>Not a CSV</body></html>"),
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

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

      // Should still succeed but log warning
      expect(result.output.success).toBe(true);
      expect(result.output.mimeType).toBe("text/html");
    });

    it("should handle binary data when expecting text", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Binary Data Import",
          sourceUrl: "https://example.com/binary.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          advancedConfig: {
            expectedContentType: "csv",
          },
        },
      });

      // Return binary data
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: async () => binaryData,
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

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

      // Should fail for non-allowed MIME type
      expect(result.output.success).toBe(false);
      expect(result.output.error).toContain("mime type");
    });
  });

  describe("File Size Handling", () => {
    it("should reject files exceeding max size limit", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Large File Import",
          sourceUrl: "https://example.com/large.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
          advancedConfig: {
            maxFileSize: 1, // 1MB limit
          },
        },
      });

      // Mock a large file (2MB of data)
      const largeData = "x".repeat(2 * 1024 * 1024);
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/csv", "content-length": String(largeData.length) }),
        arrayBuffer: async () => Buffer.from(largeData),
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

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

      expect(result.output.success).toBe(false);
      expect(result.output.error).toContain("exceeds maximum");
    });
  });

  describe("Redirect Handling", () => {
    it("should follow redirects up to a limit", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Redirect Import",
          sourceUrl: "https://example.com/redirect1.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Set up redirect chain
      // nock('https://example.com')
      // .get('/redirect1.csv')
      // .reply(301, '', { Location: 'https://example.com/redirect2.csv' });

      // nock('https://example.com')
      // .get('/redirect2.csv')
      // .reply(302, '', { Location: 'https://example.com/final.csv' });

      // nock('https://example.com')
      // .get('/final.csv')
      // .reply(200, 'test,data\n1,2', { 'Content-Type': 'text/csv' });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
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

    it("should handle infinite redirect loops", async () => {
      const scheduledImport = await payload.create({
        collection: "scheduled-imports",
        data: {
          name: "Infinite Redirect Import",
          sourceUrl: "https://example.com/loop1.csv",
          enabled: true,
          catalog: testCatalogId as any,
          scheduleType: "frequency",
          frequency: "daily",
        },
      });

      // Set up infinite redirect loop
      // nock('https://example.com')
      // .persist()
      // .get('/loop1.csv')
      // .reply(301, '', { Location: 'https://example.com/loop2.csv' });

      // nock('https://example.com')
      // .persist()
      // .get('/loop2.csv')
      // .reply(301, '', { Location: 'https://example.com/loop1.csv' });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
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

      expect(result.output.success).toBe(false);
      expect(result.output.error).toMatch(/redirect|loop/i);
    });
  });
});
