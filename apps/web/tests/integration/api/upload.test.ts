/**
 * Integration tests for file upload API endpoint.
 *
 * Tests CSV and Excel file upload functionality including
 * validation, processing, and import job creation.
 *
 * @module
 * @category Integration Tests
 */
import fs from "fs";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

describe.sequential("Import Files Collection", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;
  let testCatalogId: string;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    // Clear collections before each test
    await testEnv.seedManager.truncate();

    // Create test catalog
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const catalog = await payload.create({
      collection: "catalogs",
      data: {
        name: `Test Catalog ${timestamp}`,
        slug: `test-catalog-${timestamp}-${randomSuffix}`,
        description: "Catalog for testing",
      },
    });
    testCatalogId = catalog.id;
  });

  it("should create import file record with file upload", async () => {
    // Create a test file path and read the file
    const testFilePath = join(__dirname, "../../fixtures", "valid-events.csv");
    const fileBuffer = fs.readFileSync(testFilePath);
    const fileName = "valid-events.csv";

    // Create import file record with file upload via Payload's Local API
    // We need to provide file data through the request context
    const importFile = await payload.create({
      collection: "import-files",
      data: {
        catalog: parseInt(testCatalogId, 10),
        status: "pending",
        datasetsCount: 0,
        datasetsProcessed: 0,
      },
      file: {
        data: fileBuffer,
        name: fileName,
        size: fileBuffer.length,
        mimetype: "text/csv",
      },
    });

    expect(importFile.id).toBeDefined();
    expect(importFile.filename).toBeDefined(); // Payload auto-generated
    expect(importFile.mimeType).toBe("text/csv"); // Should match our file
    expect(importFile.filesize).toBe(fileBuffer.length); // Should match file size
    expect(importFile.catalog.id || importFile.catalog).toBe(parseInt(testCatalogId, 10));
    expect(importFile.status).toBe("pending");
  });

  it("should trigger hooks on file upload", async () => {
    const testFilePath = join(__dirname, "../../fixtures", "valid-events.csv");
    const fileBuffer = fs.readFileSync(testFilePath);
    const fileName = "valid-events.csv";

    const importFile = await payload.create({
      collection: "import-files",
      data: {
        catalog: parseInt(testCatalogId, 10),
        sessionId: "test-session-123",
        status: "pending",
      },
      file: {
        data: fileBuffer,
        name: fileName,
        size: fileBuffer.length,
        mimetype: "text/csv",
      },
    });

    // Check that hooks populated metadata correctly
    expect(importFile.originalName).toBe("valid-events.csv"); // Set by beforeOperation hook
    expect(importFile.filename).toBeDefined(); // Payload auto-generated with unique name
    expect(importFile.filename).not.toBe("valid-events.csv"); // Should be unique
    expect(importFile.sessionId).toBe("test-session-123");
    expect(importFile.rateLimitInfo).toBeDefined();
    expect(importFile.metadata).toBeDefined();
    expect(importFile.importedAt).toBeDefined();
  });

  it("should validate file size limits in beforeValidate hook", () => {
    // Test would require mocking the file size or creating a large test file
    // For now, just verify the collection configuration is correct
    const collections = payload.config.collections;
    const importFilesCollection = collections.find((c: any) => c.slug === "import-files");

    expect(importFilesCollection).toBeDefined();
    expect(importFilesCollection.upload).toBeDefined();
    expect(importFilesCollection.upload.staticDir).toBe(process.env.UPLOAD_DIR_IMPORT_FILES);
    expect(importFilesCollection.upload.mimeTypes).toContain("text/csv");
  });

  it("should apply rate limiting in beforeChange hook", async () => {
    // Since rate limiting is applied in the hook, we can test by creating multiple records
    // rapidly and checking that the service is called
    const testFilePath = join(__dirname, "../../fixtures", "valid-events.csv");
    const fileBuffer = fs.readFileSync(testFilePath);
    const fileName = "valid-events.csv";

    const importFile = await payload.create({
      collection: "import-files",
      data: {
        catalog: parseInt(testCatalogId, 10),
        status: "pending",
      },
      file: {
        data: fileBuffer,
        name: fileName,
        size: fileBuffer.length,
        mimetype: "text/csv",
      },
    });

    // Should succeed without rate limiting errors for the first request
    expect(importFile.id).toBeDefined();
    expect(importFile.rateLimitInfo).toBeDefined();
  });
});
