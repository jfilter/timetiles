/**
 * Test path utilities.
 *
 * Provides utilities for working with test file paths, fixtures,
 * and generating unique identifiers for test isolation.
 *
 * @module
 * @category Test Setup
 */
import { randomUUID } from "node:crypto";
import path from "node:path";

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
