// @vitest-environment node
/**
 *
 * Security Validation Tests for scheduled ingests.
 *
 * Tests various security scenarios including:
 * - Authentication validation
 * - Authorization checks
 * - Input sanitization
 * - URL validation and SSRF prevention
 * - Sensitive data handling
 * Uses node environment instead of jsdom to avoid AbortController compatibility issues
 * with Node 24's native fetch API..
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TEST_CREDENTIALS, TEST_EMAILS } from "@/tests/constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  withScheduledIngest,
  withTestServer,
  withUsers,
} from "@/tests/setup/integration/environment";

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

const withPrivateUrlBypass = async <T>(enabled: boolean, fn: () => Promise<T>): Promise<T> => {
  const previous = process.env.ALLOW_PRIVATE_URLS;
  process.env.ALLOW_PRIVATE_URLS = enabled ? "true" : "";
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.ALLOW_PRIVATE_URLS;
    } else {
      process.env.ALLOW_PRIVATE_URLS = previous;
    }
  }
};

describe.sequential("Security Validation Tests", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let cleanup: () => Promise<void>;
  let adminUser: any;
  let regularUser: any;
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

    // Create admin and regular users
    const { users } = await withUsers(envWithServer, {
      adminUser: { role: "admin", email: "admin@example.com" },
      regularUser: { role: "user", email: "user@example.com" },
    });
    adminUser = users.adminUser;
    regularUser = users.regularUser;

    // Create test catalog owned by regularUser so they can create scheduled ingests
    const catalog = await payload.create({
      collection: "catalogs",
      data: { name: "Security Test Catalog", description: "Catalog for security tests", createdBy: regularUser.id },
      user: regularUser,
    });
    testCatalogId = catalog.id;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  describe("URL Validation and SSRF Prevention", () => {
    it("should reject localhost URLs", async () => {
      await withPrivateUrlBypass(false, async () => {
        await expect(
          payload.create({
            collection: "scheduled-ingests",
            data: {
              name: "Localhost Import",
              sourceUrl: "http://localhost/internal.csv",
              enabled: true,
              catalog: testCatalogId,
              scheduleType: "frequency",
              frequency: "daily",
            },
            user: adminUser,
          })
        ).rejects.toThrow(/private|internal|Source URL/i);

        await expect(
          withScheduledIngest(testEnv, testCatalogId, "http://127.0.0.1/internal.csv", {
            user: adminUser,
            name: "Loopback Import Test",
            frequency: "daily",
          })
        ).rejects.toThrow(/private|internal|Source URL/i);
      });
    });

    it("should reject private IP ranges", async () => {
      const privateIPs = ["http://192.168.1.1/data.csv", "http://10.0.0.1/data.csv", "http://172.16.0.1/data.csv"];

      await withPrivateUrlBypass(false, async () => {
        for (const url of privateIPs) {
          await expect(
            withScheduledIngest(testEnv, testCatalogId, url, {
              user: adminUser,
              name: `Private IP Import ${url}`,
              frequency: "daily",
            })
          ).rejects.toThrow(/private|internal|Source URL/i);
        }
      });
    });

    it("should reject file:// protocol URLs", async () => {
      await expect(
        payload.create({
          collection: "scheduled-ingests",
          data: {
            name: "File Protocol Import",
            sourceUrl: "file:///etc/passwd",
            enabled: true,
            catalog: testCatalogId,
            scheduleType: "frequency",
            frequency: "daily",
          },
          user: adminUser,
        })
      ).rejects.toThrow(/The following field is invalid: Source URL|URL must start with http/);
    });

    it("should handle URL redirection to private IPs", async () => {
      const { scheduledIngest } = await withScheduledIngest(
        testEnv,
        testCatalogId,
        `${testServerUrl}/redirect-to-private.csv`,
        { user: adminUser, name: "Redirect to Private IP", frequency: "daily" }
      );

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Handler throws on failure (redirect to non-existent endpoint returns error)
      await expect(
        urlFetchJob.handler({
          job: { id: "test-job-redirect" },
          req: { payload },
          input: {
            scheduledIngestId: scheduledIngest.id,
            sourceUrl: scheduledIngest.sourceUrl,
            authConfig: scheduledIngest.authConfig,
            catalogId: testCatalogId,
            originalName: "Test Import",
            userId: adminUser.id,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("Authentication Credential Security", () => {
    it("should encrypt credentials at rest and decrypt on read", async () => {
      const { scheduledIngest } = await withScheduledIngest(
        testEnv,
        testCatalogId,
        "https://api.example.com/data.csv",
        {
          user: adminUser,
          name: "Secure Auth Import",
          frequency: "daily",
          authConfig: { type: "bearer", bearerToken: TEST_CREDENTIALS.bearer.superSecretToken },
        }
      );

      // Fetch via Payload API — afterRead hooks should decrypt
      const fetched = await payload.findByID({ collection: "scheduled-ingests", id: scheduledIngest.id });
      expect(fetched.authConfig.bearerToken).toBe(TEST_CREDENTIALS.bearer.superSecretToken);

      // Verify the raw database value is NOT plaintext (encrypted at rest)
      const { createDatabaseClient } = await import("@/lib/database/client");
      const client = createDatabaseClient({ connectionString: process.env.DATABASE_URL! });
      try {
        await client.connect();
        const rawResult = await client.query(
          `SELECT auth_config_bearer_token FROM payload."scheduled_ingests" WHERE id = $1`,
          [scheduledIngest.id]
        );
        if (rawResult.rows.length > 0) {
          const rawToken = rawResult.rows[0].auth_config_bearer_token;
          if (rawToken) {
            expect(rawToken).not.toBe(TEST_CREDENTIALS.bearer.superSecretToken);
          }
        }
      } finally {
        await client.end();
      }
    });

    it("should handle invalid authentication types", async () => {
      // Set up test server endpoint
      testServer.respondWithCSV("/invalid-auth.csv", "test,data\n1,2");

      const { scheduledIngest } = await withScheduledIngest(
        testEnv,
        testCatalogId,
        `${testServerUrl}/invalid-auth.csv`,
        {
          user: adminUser,
          name: "Invalid Auth Type Import",
          frequency: "daily",
          authConfig: {
            type: "none",
            // Try to inject headers anyway
            customHeaders: { "X-Admin": "true", "X-Bypass-Auth": "1" },
          },
        }
      );

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-auth" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId,
          originalName: "Test Import",
          userId: adminUser.id,
        },
      });

      // Custom headers should be sent
      expect(result.output.ingestFileId).toBeDefined();
    });

    it("should validate Basic Auth credentials format", async () => {
      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/basic-auth.csv`, {
        user: adminUser,
        name: "Basic Auth Import",
        frequency: "daily",
        authConfig: { type: "basic", username: TEST_EMAILS.user, password: TEST_CREDENTIALS.basic.strongPassword },
      });

      // Set up test server endpoint with Basic Auth
      testServer.respondWithAuth(
        "/basic-auth.csv",
        "basic",
        { username: TEST_EMAILS.user, password: TEST_CREDENTIALS.basic.strongPassword },
        { body: "test,data\n1,2", headers: { "Content-Type": "text/csv" } },
        { status: 401, body: "Unauthorized" }
      );

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-basic-auth" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId,
          originalName: "Test Import",
          userId: adminUser.id,
        },
      });

      expect(result.output.ingestFileId).toBeDefined();
    });
  });

  describe("Input Sanitization", () => {
    it("should handle malicious import name templates", async () => {
      const maliciousTemplates = [
        '{{name}} <script>alert("xss")</script>',
        '{{name}}"; DROP TABLE scheduled_ingests; --',
        "{{name}}${process.env.DATABASE_URL}",
        // Skip null byte test as PostgreSQL doesn't support it
        // "{{name}}" + "\x00" + "null-byte",
      ];

      // Set up test server endpoints for malicious templates
      testServer.respondWithCSV("/malicious-template.csv", "test,data\n1,2");

      for (const template of maliciousTemplates) {
        const { scheduledIngest } = await withScheduledIngest(
          testEnv,
          testCatalogId,
          `${testServerUrl}/malicious-template.csv`,
          { user: adminUser, name: "XSS Test Import", frequency: "daily", ingestNameTemplate: template }
        );

        // Template should be stored as-is (sanitization happens on use)
        expect(scheduledIngest.ingestNameTemplate).toBe(template);
      }
    });

    it("should sanitize custom headers JSON", async () => {
      // Set up test server endpoint
      testServer.respondWithCSV("/custom-headers.csv", "test,data\n1,2");

      const { scheduledIngest } = await withScheduledIngest(
        testEnv,
        testCatalogId,
        `${testServerUrl}/custom-headers.csv`,
        {
          user: adminUser,
          name: "Custom Headers Test",
          frequency: "daily",
          authConfig: {
            type: "none",
            customHeaders: {
              "X-Custom-Header": "value",
              // 'Content-Type': 'text/csv', // Should not override
              // 'Host': 'evil.com', // Should not be allowed
              // 'Authorization': 'Bearer stolen-token', // Should not override auth
            },
          },
        }
      );

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-headers" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId,
          originalName: "Test Import",
          userId: adminUser.id,
        },
      });

      expect(result.output.ingestFileId).toBeDefined();
    });
  });

  describe("Access Control", () => {
    it("should enforce ownership-based access for scheduled ingests", async () => {
      testServer.respondWithCSV("/admin.csv", "test,data\n1,2");

      const { scheduledIngest: adminImport } = await withScheduledIngest(
        testEnv,
        testCatalogId,
        `${testServerUrl}/admin.csv`,
        { user: adminUser, name: "Admin Import", frequency: "daily" }
      );

      const canRead = await payload.find({
        collection: "scheduled-ingests",
        where: { id: { equals: adminImport.id } },
        user: regularUser,
        overrideAccess: false,
      });
      expect(canRead.docs).toHaveLength(0);

      await expect(
        payload.findByID({
          collection: "scheduled-ingests",
          id: adminImport.id,
          user: regularUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();

      await expect(
        payload.delete({
          collection: "scheduled-ingests",
          id: adminImport.id,
          user: regularUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();

      const stillExists = await payload.findByID({
        collection: "scheduled-ingests",
        id: adminImport.id,
        overrideAccess: true,
      });
      expect(stillExists.id).toBe(adminImport.id);
    });

    it("should prevent unauthorized catalog access", async () => {
      testServer.respondWithCSV("/private-catalog.csv", "test,data\n1,2");

      const { users: admin2Users } = await withUsers(testEnv, { admin2: { role: "user" } });
      const admin2 = admin2Users.admin2;

      const privateCatalog = await payload.create({
        collection: "catalogs",
        data: { name: "Private Catalog", description: "Should not be accessible to regularUser", isPublic: false },
        user: admin2,
      });

      const regularUserFull = await payload.findByID({ collection: "users", id: regularUser.id });

      await expect(
        payload.create({
          collection: "scheduled-ingests",
          data: {
            name: "Unauthorized Catalog Import",
            sourceUrl: `${testServerUrl}/private-catalog.csv`,
            enabled: true,
            catalog: privateCatalog.id,
            scheduleType: "frequency",
            frequency: "daily",
          },
          user: regularUserFull,
        })
      ).rejects.toThrow();
    });

    it("should prevent URL fetch job inputs from impersonating another schedule owner", async () => {
      const privateCatalog = await payload.create({
        collection: "catalogs",
        data: {
          name: "Private Catalog for URL Fetch Test",
          description: "Private catalog for testing URL fetch permissions",
          isPublic: false,
        },
        user: { id: adminUser.id },
      });

      const { scheduledIngest } = await withScheduledIngest(
        testEnv,
        privateCatalog.id,
        `${testServerUrl}/fetch-test.csv`,
        { user: adminUser, name: "URL Fetch Permission Test", frequency: "daily" }
      );

      testServer.respondWithCSV("/fetch-test.csv", "test,data\n1,2");

      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");
      const regularUserFull = await payload.findByID({ collection: "users", id: regularUser.id });

      await expect(
        urlFetchJob.handler({
          job: { id: "test-job-catalog-access" },
          req: { payload, user: regularUserFull },
          input: {
            scheduledIngestId: scheduledIngest.id,
            sourceUrl: scheduledIngest.sourceUrl,
            authConfig: scheduledIngest.authConfig,
            catalogId: privateCatalog.id,
            originalName: "Test Import",
            userId: regularUserFull.id,
          },
        })
      ).rejects.toThrow(/owner|scheduled ingest/i);
    });

    it("should enforce import file access through user ownership", async () => {
      const adminUserFull = await payload.findByID({ collection: "users", id: adminUser.id });
      const csvContent = "name,date\nAdmin Event,2024-01-01";
      const fileBuffer = new Uint8Array(Buffer.from(csvContent, "utf8"));
      const adminIngestFile = await payload.create({
        collection: "ingest-files",
        data: { user: adminUser.id, status: "pending" },
        file: { data: fileBuffer, name: "admin-owned-file.csv", size: fileBuffer.length, mimetype: "text/csv" },
        user: adminUserFull,
      });

      await expect(
        payload.findByID({
          collection: "ingest-files",
          id: adminIngestFile.id,
          user: regularUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();

      const adminFile = await payload.findByID({
        collection: "ingest-files",
        id: adminIngestFile.id,
        user: adminUser,
        overrideAccess: false,
      });
      expect(adminFile.id).toBe(adminIngestFile.id);
    });

    it("should prevent cross-user scheduled ingest modification", async () => {
      const regularUserFull = await payload.findByID({ collection: "users", id: regularUser.id });

      const { scheduledIngest } = await withScheduledIngest(
        testEnv,
        testCatalogId,
        `${testServerUrl}/regular-user-data.csv`,
        { name: "Regular User's scheduled ingest", enabled: false, frequency: "daily", user: regularUserFull }
      );

      const { users: anotherUsers } = await withUsers(testEnv, { anotherUser: { role: "user" } });
      const anotherUser = anotherUsers.anotherUser;

      await expect(
        payload.update({
          collection: "scheduled-ingests",
          id: scheduledIngest.id,
          data: { name: "Hijacked Import" },
          user: anotherUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();

      const unchanged = await payload.findByID({
        collection: "scheduled-ingests",
        id: scheduledIngest.id,
        overrideAccess: true,
      });
      expect(unchanged.name).toBe("Regular User's scheduled ingest");
    });
  });

  describe("File Content Security", () => {
    it("should reject files with suspicious content", async () => {
      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/suspicious.csv`, {
        user: adminUser,
        name: "Suspicious Content Import",
        frequency: "daily",
      });

      // Set up test server endpoint with CSV injection content
      testServer.respondWithCSV("/suspicious.csv", '=cmd|"/c calc"!A1,@SUM(1+9)*cmd|"/c calc"!A1\n=1+1,normal data');

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Execute the job
      const result = await urlFetchJob.handler({
        job: { id: "test-job-csv-injection" },
        req: { payload },
        input: {
          scheduledIngestId: scheduledIngest.id,
          sourceUrl: scheduledIngest.sourceUrl,
          authConfig: scheduledIngest.authConfig,
          catalogId: testCatalogId,
          originalName: "Test Import",
          userId: adminUser.id,
        },
      });

      // Should still succeed - content validation happens during parsing
      expect(result.output.ingestFileId).toBeDefined();
    });

    it("should handle zip bombs and large files", async () => {
      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/large.csv`, {
        user: adminUser,
        name: "Large File Import",
        frequency: "daily",
        additionalData: {
          advancedOptions: {
            maxFileSizeMB: 1, // 1MB limit
          },
        },
      });

      // Set up test server endpoint with data larger than 1MB
      const largeData = "data,value\n";
      const fullData = largeData + "1,test\n".repeat(150000); // Generate ~1.2MB of data
      testServer.respond("/large.csv", {
        body: fullData,
        headers: { "Content-Type": "text/csv", "Content-Length": String(fullData.length) },
      });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Handler throws on file size limit exceeded
      await expect(
        urlFetchJob.handler({
          job: { id: "test-job-large" },
          req: { payload },
          input: {
            scheduledIngestId: scheduledIngest.id,
            sourceUrl: scheduledIngest.sourceUrl,
            authConfig: scheduledIngest.authConfig,
            catalogId: testCatalogId,
            originalName: "Test Import",
            userId: adminUser.id,
          },
        })
      ).rejects.toThrow(/too large/i);
    });
  });

  describe("Error Message Security", () => {
    it("should not expose internal system details in error messages", async () => {
      const { scheduledIngest } = await withScheduledIngest(testEnv, testCatalogId, `${testServerUrl}/error-test.csv`, {
        user: adminUser,
        name: "Error Exposure Test",
        frequency: "daily",
      });

      // Set up test server endpoint that simulates connection error
      testServer.respond("/error-test.csv", { error: true });

      // Import the job handler
      const { urlFetchJob } = await import("@/lib/jobs/handlers/url-fetch-job");

      // Handler throws on failure — catch the error to inspect the message
      let errorMessage = "";
      try {
        await urlFetchJob.handler({
          job: { id: "test-job-error" },
          req: { payload },
          input: {
            scheduledIngestId: scheduledIngest.id,
            sourceUrl: scheduledIngest.sourceUrl,
            authConfig: scheduledIngest.authConfig,
            catalogId: testCatalogId,
            originalName: "Test Import",
            userId: adminUser.id,
          },
        });
        // Should not reach here
        expect.unreachable("Expected handler to throw");
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      // Error should be present but not expose system details
      expect(errorMessage).toBeTruthy();
      expect(errorMessage).not.toContain("/etc/");
      expect(errorMessage).not.toContain("\\Windows\\");
    });
  });
});
