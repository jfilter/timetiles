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

// Helper function to create import file with proper upload
export const createImportFileWithUpload = async (
  payload: any,
  data: any,
  fileContent: string | Buffer,
  fileName: string,
  mimeType: string
) => {
  const fileBuffer = typeof fileContent === "string" ? Buffer.from(fileContent, "utf8") : fileContent;

  return await payload.create({
    collection: "import-files",
    data,
    file: {
      data: fileBuffer,
      name: fileName,
      size: fileBuffer.length,
      mimetype: mimeType,
    },
  });
};

/**
 * Path to test fixtures directory
 */
export const FIXTURES_PATH = path.join(__dirname, "../fixtures");

/**
 * Helper to create unique identifiers for tests
 */
export const createTestId = (): string => `test-${Date.now()}-${randomUUID().split("-")[0]}`;

/**
 * Helper to create unique file paths
 */
export const createTempFilePath = (tempDir: string, filename: string): string => {
  const testId = createTestId();
  return `${tempDir}/${testId}-${filename}`;
};

/**
 * Helper to get fixture file path
 */
export const getFixturePath = (filename: string): string => {
  return path.join(FIXTURES_PATH, filename);
};
