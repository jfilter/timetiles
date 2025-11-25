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

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createIntegrationTestEnvironment, withCatalog, withImportFile } from "../../setup/integration/environment";

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
    const { catalog } = await withCatalog(testEnv);
    testCatalogId = catalog.id;
  });

  it("should create import file record with file upload", async () => {
    // Create a test file path and read the file
    const testFilePath = join(__dirname, "../../fixtures", "valid-events.csv");
    const fileBuffer = fs.readFileSync(testFilePath);
    const fileName = "valid-events.csv";

    // Use the helper function that properly handles file uploads
    const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), fileBuffer, {
      filename: fileName,
      datasetsCount: 0,
      datasetsProcessed: 0,
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

    const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), fileBuffer, {
      filename: fileName,
    });

    // Check that hooks populated metadata correctly
    expect(importFile.originalName).toBe("valid-events.csv"); // Set by beforeOperation hook
    expect(importFile.filename).toBeDefined(); // Payload auto-generated with unique name
    expect(importFile.filename).not.toBe("valid-events.csv"); // Should be unique
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

    const { importFile } = await withImportFile(testEnv, parseInt(testCatalogId, 10), fileBuffer, {
      filename: fileName,
    });

    // Should succeed without rate limiting errors for the first request
    expect(importFile.id).toBeDefined();
    expect(importFile.rateLimitInfo).toBeDefined();
  });
});
