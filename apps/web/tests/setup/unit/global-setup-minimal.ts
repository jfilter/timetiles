/**
 * Vitest setup for unit tests.
 *
 * Configures test environment for unit tests that don't require database
 * access. Sets up temporary directories and minimal environment variables.
 *
 * @module
 * @category Test Setup
 */
import fs from "node:fs";
import path from "node:path";

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}

// Set upload directory environment variables for unit tests
process.env.UPLOAD_DIR = `/tmp/uploads`;
process.env.UPLOAD_TEMP_DIR = `/tmp/temp`;

// Ensure upload directories exist for unit tests
const uploadDirs = [
  `${process.env.UPLOAD_DIR}/media`,
  `${process.env.UPLOAD_DIR}/import-files`,
  process.env.UPLOAD_TEMP_DIR,
];

uploadDirs.forEach((dir) => {
  const fullPath = path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});
