/**
 * Test helper utilities.
 *
 * Provides common helper functions for test setup including file uploads,
 * data creation, and test environment configuration.
 *
 * @module
 * @category Test Setup
 */
import { randomUUID } from "crypto";
import path from "path";

// Helper function to create import file with upload for testing
export const createImportFileWithUpload = async (
  payload: any,
  data: any,
  fileContent: string | Buffer,
  fileName: string,
  mimeType: string
) => {
  // Convert to Uint8Array which is what Payload's file-type checker expects
  const fileBuffer = typeof fileContent === "string" 
    ? new Uint8Array(Buffer.from(fileContent, "utf8"))
    : new Uint8Array(fileContent);
  
  // Create file object with Uint8Array data
  const file = {
    data: fileBuffer,
    mimetype: mimeType,
    name: fileName,
    size: fileBuffer.length,
  };
  
  // Use Payload's Local API with file parameter
  const importFile = await payload.create({
    collection: "import-files",
    data,
    file,
  });
  
  return importFile;
};

/**
 * Path to test fixtures directory.
 */
export const FIXTURES_PATH = path.join(__dirname, "../fixtures");

/**
 * Helper to create unique identifiers for tests.
 */
export const createTestId = (): string => `test-${Date.now()}-${randomUUID().split("-")[0]}`;

/**
 * Helper to create unique file paths.
 */
export const createTempFilePath = (tempDir: string, filename: string): string => {
  const testId = createTestId();
  return `${tempDir}/${testId}-${filename}`;
};

/**
 * Helper to get fixture file path.
 */
export const getFixturePath = (filename: string): string => {
  return path.join(FIXTURES_PATH, filename);
};
