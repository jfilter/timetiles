// Vitest setup file for tests that don't need database
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}

// Create unique temp directory for each test worker
const workerId = process.env.VITEST_WORKER_ID ?? "1";
const tempDir = `/tmp/timetiles-test-${workerId}-${randomUUID()}`;
process.env.TEMP_DIR = tempDir;

// Set upload directory environment variables for unit tests
process.env.UPLOAD_DIR_MEDIA = `/tmp/media`;
process.env.UPLOAD_DIR_IMPORT_FILES = `/tmp/import-files`;
process.env.UPLOAD_TEMP_DIR = `/tmp/temp`;

// Ensure temp directory exists
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Ensure upload directories exist for unit tests
const uploadDirs = [process.env.UPLOAD_DIR_MEDIA, process.env.UPLOAD_DIR_IMPORT_FILES, process.env.UPLOAD_TEMP_DIR];

uploadDirs.forEach((dir) => {
  const fullPath = path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});
