// @vitest-environment node
/**
 * Network Error Handling Tests for scheduled ingests.
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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { urlFetchJob } from "@/lib/jobs/handlers/url-fetch-job";
import { TEST_EMAILS } from "@/tests/constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withScheduledIngest,
  withTestServer,
  withUsers,
} from "@/tests/setup/integration/environment";
import type { TestServer } from "@/tests/setup/integration/http-server";

// Type definitions for urlFetchJob output
interface UrlFetchSuccessOutput {
  ingestFileId: string | number;
  filename: string;
  fileSize: number | undefined;
  contentType: string;
  isDuplicate: boolean;
  contentHash: string | undefined;
  skippedReason?: string;
}

type _UrlFetchOutput = UrlFetchSuccessOutput;

/**
 * Helper: call urlFetchJob.handler and expect it to throw.
 * Returns the error message for further assertions.
 */
const expectHandlerToThrow = async (handlerArgs: Parameters<typeof urlFetchJob.handler>[0]): Promise<string> => {
  let caughtError: unknown;
  try {
    await urlFetchJob.handler(handlerArgs);
  } catch (error) {
    caughtError = error;
  }

  expect(caughtError).toBeDefined();
  return caughtError instanceof Error ? caughtError.message : String(caughtError);
};

describe.sequential("Network Error Handling Tests", () => {
  const collectionsToReset = ["scheduled-ingests", "ingest-files", "payload-jobs", "user-usage"];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let cleanup: () => Promise<void>;
  let testUser: any;
  let testCatalogId: string;
  let testServer: TestServer;
  let testServerUrl: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    const envWithServer = await withTestServer(testEnv);
    payload = envWithServer.payload;
    cleanup = envWithServer.cleanup;
    testServer = envWithServer.testServer;
    testServerUrl = envWithServer.testServerUrl;

    // Create test user
    const { users } = await withUsers(envWithServer, { testUser: { role: "admin", email: TEST_EMAILS.network } });
    testUser = users.testUser;

    // Create test catalog
    const { catalog } = await withCatalog(envWithServer, {
      name: "Network Test Catalog",
      description: "Catalog for network error tests",
      user: testUser,
    });
    testCatalogId = catalog.id;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    testServer.reset();
    await testEnv.seedManager.truncate(collectionsToReset);
  });

  describe("Malformed URL Handling", () => {
    it("should reject completely invalid URLs", async () => {
      await expect(
        payload.create({
          collection: "scheduled-ingests",
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
          collection: "scheduled-ingests",
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
      testServer
        .respond("/file%20with%20spaces.csv", {
          status: 404,
          body: "Not Found",
          headers: { "Content-Type": "text/plain" },
        })
        .respond("/file with spaces.csv", {
          status: 404,
          body: "Not Found",
          headers: { "Content-Type": "text/plain" },
        });

      const { scheduledIngest } = await withScheduledIngest(
        testEnv,
        testCatalogId,
        `${testServerUrl}/file with spaces.csv`,
        { user: testUser, name: "URL with Spaces Import", frequency: "daily" }
      );

      // Execute the job
      const errorMsg = await expectHandlerToThrow({
        job: { id: "test-job-1" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUser.id,
        },
      });

      {
        expect(errorMsg).toContain("404");
      }
    });
  });

  describe("DNS Resolution Failures", () => {
    it("should handle non-existent domain names", async () => {
      const { scheduledIngest } = await withScheduledIngest(
        testEnv,
        testCatalogId,
        "https://this-domain-definitely-does-not-exist-12345.com/file.csv",
        { user: testUser, name: "DNS Failure Import", frequency: "daily" }
      );

      // Execute the job - real DNS will fail for non-existent domain
      const errorMsg = await expectHandlerToThrow({
        job: { id: "test-job-2" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUser.id,
        },
      });

      {
        expect(errorMsg).toMatch(/ENOTFOUND|getaddrinfo|network|fetch failed/i);
      }
    });
  });

  describe("Connection Failures", () => {
    it("should handle connection refused errors", async () => {
      // Use a port that's guaranteed to be refused (1 is privileged and likely unused)
      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, "http://127.0.0.1:1/file.csv", {
        user: testUser,
        name: "Connection Refused Import",
        frequency: "daily",
      });

      // Execute the job - real connection will be refused
      const errorMsg = await expectHandlerToThrow({
        job: { id: "test-job-3" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUser.id,
        },
      });

      {
        expect(errorMsg).toMatch(/ECONNREFUSED|connection refused|network|fetch failed/i);
      }
    });

    it("should handle connection timeout", async () => {
      const previousTestTimeout = process.env.URL_FETCH_TEST_TIMEOUT_MS;
      process.env.URL_FETCH_TEST_TIMEOUT_MS = "300";

      try {
        testServer.route("/slow-file.csv", () => {
          // Keep the connection open without responding to trigger a fetch timeout.
        });

        const { scheduledIngest } = await withScheduledIngest(
          testEnv,
          testCatalogId,
          `${testServerUrl}/slow-file.csv`,
          {
            user: testUser,
            name: "Timeout Import",
            frequency: "daily",
            maxRetries: 0, // No retries for timeout test to avoid exceeding test timeout
            retryDelayMinutes: 1, // Minimum allowed
            additionalData: {
              advancedOptions: {
                timeoutMinutes: 1, // Minimum allowed (overridden to 300ms for this test)
              },
              retryConfig: {
                maxRetries: 0, // No retries for timeout test to avoid exceeding test timeout
                retryDelayMinutes: 1, // Minimum allowed
                exponentialBackoff: false,
              },
            },
          }
        );

        // Execute the job - should timeout quickly via the test override
        const errorMsg = await expectHandlerToThrow({
          job: { id: "test-job-4" },
          req: { payload },
          input: {
            scheduledIngestId: scheduledIngest.id,
            sourceUrl: scheduledIngest.sourceUrl,
            authConfig: scheduledIngest.authConfig,
            catalogId: testCatalogId as any,
            originalName: "Test Import",
            userId: testUser.id,
          },
        });

        // Should fail due to timeout

        {
          expect(errorMsg).toMatch(/abort|timeout|fetch failed/i);
        }
      } finally {
        if (previousTestTimeout === undefined) {
          delete process.env.URL_FETCH_TEST_TIMEOUT_MS;
        } else {
          process.env.URL_FETCH_TEST_TIMEOUT_MS = previousTestTimeout;
        }
      }
    }, 4000);
  });

  describe("HTTP Error Responses", () => {
    it("should handle 404 Not Found", async () => {
      testServer.respond("/missing.csv", { status: 404, body: "Not Found", headers: { "Content-Type": "text/plain" } });

      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/missing.csv`, {
        user: testUser,
        name: "404 Import",
        frequency: "daily",
      });

      // Execute the job
      const errorMsg = await expectHandlerToThrow({
        job: { id: "test-job-5" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUser.id,
        },
      });

      {
        expect(errorMsg).toContain("404");
      }
    });

    it("should handle 500 Internal Server Error", async () => {
      testServer.respond("/error.csv", {
        status: 500,
        body: "Internal Server Error",
        headers: { "Content-Type": "text/plain" },
      });

      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/error.csv`, {
        user: testUser,
        name: "500 Import",
        frequency: "daily",
      });

      // Execute the job
      const errorMsg = await expectHandlerToThrow({
        job: { id: "test-job-6" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUser.id,
        },
      });

      {
        expect(errorMsg).toContain("500");
      }
    });

    it("should handle authentication failures", async () => {
      testServer.route("/protected.csv", (req, res) => {
        const authHeader = req.headers.authorization;
        if (authHeader === "Bearer valid-token") {
          res.writeHead(200, { "Content-Type": "text/csv" });
          res.end("test,data\n1,2");
        } else {
          res.writeHead(401, { "Content-Type": "text/plain" });
          res.end("Unauthorized");
        }
      });

      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/protected.csv`, {
        user: testUser,
        name: "Auth Failure Import",
        frequency: "daily",
        authConfig: { type: "bearer", bearerToken: "invalid-token" },
      });

      // Execute the job
      const errorMsg = await expectHandlerToThrow({
        job: { id: "test-job-7" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUser.id,
        },
      });

      {
        expect(errorMsg).toContain("401");
      }
    });
  });

  describe("Partial Download Handling", () => {
    it("should handle connection drops mid-download", async () => {
      testServer.route("/partial.csv", (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/csv",
          "Content-Length": "1000", // Claim 1000 bytes but send less
        });
        res.write("test,data\n"); // Send partial data
        // Abruptly close the connection
        setTimeout(() => res.destroy(), 10);
      });

      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/partial.csv`, {
        user: testUser,
        name: "Partial Download Import",
        frequency: "daily",
      });

      const errorMsg = await expectHandlerToThrow({
        job: { id: "test-job-8" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUser.id,
        },
      });

      expect(errorMsg).toMatch(/terminated|abort|premature|fetch failed|socket|ECONNRESET|incomplete response body/i);
    });
  });

  describe("Content Type Mismatches", () => {
    it("should reject HTML responses even when URL ends in .csv", async () => {
      testServer.respond("/wrong-type.csv", {
        status: 200,
        body: "<html><body>Not a CSV</body></html>",
        headers: { "Content-Type": "text/html" },
      });

      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/wrong-type.csv`, {
        user: testUser,
        name: "Wrong Content Type Import",
        frequency: "daily",
      });

      const errorMsg = await expectHandlerToThrow({
        job: { id: "test-job-9" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUser.id,
        },
      });

      expect(errorMsg).toMatch(/Unsupported file type: text\/html/i);
    });

    it("should reject binary data when URL ends in .csv", async () => {
      testServer.respond("/binary.csv", {
        status: 200,
        body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        headers: { "Content-Type": "image/png" },
      });

      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/binary.csv`, {
        user: testUser,
        name: "Binary Data Import",
        frequency: "daily",
      });

      const errorMsg = await expectHandlerToThrow({
        job: { id: "test-job-10" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUser.id,
        },
      });

      expect(errorMsg).toMatch(/Unsupported file type: image\/png/i);
    });
  });

  describe("File Size Handling", () => {
    it("should reject files exceeding max size limit", async () => {
      const largeData = "x".repeat(2 * 1024 * 1024);
      testServer.respond("/large.csv", {
        status: 200,
        body: largeData,
        headers: { "Content-Type": "text/csv", "Content-Length": String(largeData.length) },
      });

      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/large.csv`, {
        user: testUser,
        name: "Large File Import",
        frequency: "daily",
        additionalData: {
          advancedOptions: {
            maxFileSizeMB: 1, // 1MB limit
          },
        },
      });

      // Execute the job
      const errorMsg = await expectHandlerToThrow({
        job: { id: "test-job-11" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUser.id,
        },
      });

      // Handler should reject files exceeding max size limit

      {
        expect(errorMsg).toContain("too large");
      }
    });
  });

  describe("Redirect Handling", () => {
    it("should follow redirects", async () => {
      let requestCount = 0;
      testServer.route("/redirect1.csv", (_req, res) => {
        requestCount++;
        res.writeHead(302, { Location: `${testServerUrl}/final.csv` });
        res.end();
      });
      testServer.route("/final.csv", (_req, res) => {
        requestCount++;
        res.writeHead(200, { "Content-Type": "text/csv" });
        res.end("test,data\n1,2");
      });

      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/redirect1.csv`, {
        user: testUser,
        name: "Redirect Import",
        frequency: "daily",
      });

      // Execute the job - fetch follows redirects automatically
      const result = await urlFetchJob.handler({
        job: { id: "test-job-12" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUser.id,
        },
      });

      expect(result.output.ingestFileId).toBeDefined();
      expect(requestCount).toBe(2);
    });

    it("should handle too many redirects", async () => {
      testServer.setDefaultHandler((req, res) => {
        // Always redirect to a slightly different URL
        const currentPath = req.url ?? "/";
        const nextPath = currentPath + "x";
        res.writeHead(302, { Location: `${testServerUrl}${nextPath}` });
        res.end();
      });

      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/loop.csv`, {
        user: testUser,
        name: "Infinite Redirect Import",
        frequency: "daily",
      });

      // Execute the job - should fail due to too many redirects
      const errorMsg = await expectHandlerToThrow({
        job: { id: "test-job-13" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Test Import",
          userId: testUser.id,
        },
      });

      // Fetch API has built-in redirect limit (typically 20)

      {
        // The actual error message varies by Node version
        expect(errorMsg).toMatch(/redirect|fetch failed/i);
      }
    });
  });

  describe("Real Job Queue Integration", () => {
    it("should queue follow-up jobs using real payload.jobs.queue", async () => {
      testServer.respondWithCSV("/data.csv", "name,date,location\nEvent 1,2024-01-01,San Francisco\n");

      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/data.csv`, {
        user: testUser,
        name: "Real Queue Test Import",
        frequency: "daily",
      });

      // Execute the job with real job queue
      const result = await urlFetchJob.handler({
        job: { id: "test-job-queue" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId as any,
          originalName: "Queue Test Import",
          userId: testUser.id,
        },
      });

      expect(result.output.ingestFileId).toBeDefined();
      if (result.output.ingestFileId) {
        const successOutput = result.output as UrlFetchSuccessOutput;
        expect(successOutput.ingestFileId).toBeDefined();
        expect(successOutput.contentType).toBe("text/csv");

        // Verify the import file was created
        const ingestFile = await payload.findByID({ collection: "ingest-files", id: successOutput.ingestFileId });
        expect(ingestFile).toBeDefined();
        // Status is "pending" after url-fetch creates the file (hooks skipped via skipIngestFileHooks context);
        // the workflow's next task handles progression to "parsing".
        expect(ingestFile.status).toBe("pending");
      }
    });
  });
});
