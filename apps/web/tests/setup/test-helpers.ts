import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import { TestEnvironmentBuilder } from "./test-environment-builder";

// Helper function to create import file with proper upload
export const createImportFileWithUpload = async (
  payload: any,
  data: any,
  fileContent: string | Buffer,
  fileName: string,
  mimeType: string,
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
 * Creates an isolated test environment for each test
 * Uses the test-environment-builder for consistency
 */
export const createIsolatedTestEnvironment = async (): Promise<{
  seedManager: any;
  payload: any;
  cleanup: () => Promise<void>;
  tempDir: string;
}> => {
  const builder = new TestEnvironmentBuilder();
  const env = await builder.createIsolatedTestEnvironment();
  
  return {
    seedManager: env.seedManager,
    payload: env.payload,
    cleanup: env.cleanup,
    tempDir: env.tempDir || "",
  };
};

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
