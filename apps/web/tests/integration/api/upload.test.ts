/**
 * Integration tests for file upload API endpoint.
 *
 * Tests CSV and Excel file upload functionality including
 * validation, processing, and import job creation.
 *
 * @module
 * @category Integration Tests
 */
import fs from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnv } from "@/lib/config/env";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withIngestFile,
  withUsers,
} from "../../setup/integration/environment";

describe.sequential("Import Files Collection", () => {
  const collectionsToReset = [
    "ingest-files",
    "ingest-jobs",
    "datasets",
    "dataset-schemas",
    "payload-jobs",
    "user-usage",
  ];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let testCatalogId: string;
  let testUserId: string | number;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });

    const { users } = await withUsers(testEnv, { testUser: { role: "admin" } });
    testUserId = users.testUser.id;

    const { catalog } = await withCatalog(testEnv, { user: users.testUser });
    testCatalogId = catalog.id;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate(collectionsToReset);
  });

  it("should create import file record with file upload", async () => {
    // Create a test file path and read the file
    const testFilePath = join(__dirname, "../../fixtures", "valid-events.csv");
    const fileBuffer = fs.readFileSync(testFilePath);
    const fileName = "valid-events.csv";

    // Use the helper function that properly handles file uploads
    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), fileBuffer, {
      user: testUserId,
      filename: fileName,
      datasetsCount: 0,
      datasetsProcessed: 0,
    });

    expect(ingestFile.id).toBeDefined();
    expect(ingestFile.filename).toBeDefined(); // Payload auto-generated
    expect(ingestFile.mimeType).toBe("text/csv"); // Should match our file
    expect(ingestFile.filesize).toBe(fileBuffer.length); // Should match file size
    expect(ingestFile.catalog.id ?? ingestFile.catalog).toBe(Number.parseInt(testCatalogId, 10));
    expect(ingestFile.status).toBe("pending");
  });

  it("should trigger hooks on file upload", async () => {
    const testFilePath = join(__dirname, "../../fixtures", "valid-events.csv");
    const fileBuffer = fs.readFileSync(testFilePath);
    const fileName = "valid-events.csv";

    const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), fileBuffer, {
      user: testUserId,
      filename: fileName,
    });

    // Check that hooks populated metadata correctly
    expect(ingestFile.originalName).toBe("valid-events.csv"); // Set by beforeOperation hook
    expect(ingestFile.filename).toBeDefined(); // Payload auto-generated with unique name
    expect(ingestFile.filename).not.toBe("valid-events.csv"); // Should be unique
    expect(ingestFile.metadata).toMatchObject({ uploadSource: "api" });
    expect(ingestFile.uploadedAt).toBeDefined();
  });

  it("should reject files exceeding user trust level size limit", async () => {
    // Create a user with trust level 0 (UNTRUSTED) — maxFileSizeMB: 1
    const { users } = await withUsers(testEnv, { untrustedUser: { role: "user", trustLevel: "0" } });

    // Create a catalog owned by this user so ownership check passes
    const { catalog: untrustedCatalog } = await withCatalog(testEnv, { user: users.untrustedUser });

    // Create a CSV buffer slightly over 1MB (the UNTRUSTED limit)
    // Build 1.1MB CSV without JS string concatenation (avoids V8 heap OOM in forks).
    // Buffer.alloc + write avoids creating intermediate JS strings.
    const targetSize = Math.ceil(1.1 * 1024 * 1024);
    const oversizedContent = Buffer.alloc(targetSize);
    let offset = oversizedContent.write("title,date,location\n");
    const row = "Test,2024-01-01,Test Location\n";
    while (offset + row.length < targetSize) {
      offset += oversizedContent.write(row, offset);
    }

    // Attempting to upload should fail with file size error
    await expect(
      withIngestFile(testEnv, untrustedCatalog.id, oversizedContent, {
        user: users.untrustedUser.id,
        filename: "oversized.csv",
      })
    ).rejects.toThrow(/[Ff]ile too large|[Mm]aximum size/);
  });

  it("records the rate-limited client on uploads when rate limiting is enforced", async () => {
    // Upload rate limiting is skipped under NODE_ENV=test, so enforce it for this upload only.
    vi.stubEnv("NODE_ENV", "development");
    resetEnv();
    try {
      const fileBuffer = fs.readFileSync(join(__dirname, "../../fixtures", "valid-events.csv"));

      const { ingestFile } = await withIngestFile(testEnv, Number.parseInt(testCatalogId, 10), fileBuffer, {
        user: testUserId,
        filename: "valid-events.csv",
      });

      expect(ingestFile.rateLimitInfo).toMatchObject({
        clientId: "unknown",
        isAuthenticated: true,
        timestamp: expect.any(String),
      });
    } finally {
      vi.unstubAllEnvs();
      resetEnv();
    }
  });
});
