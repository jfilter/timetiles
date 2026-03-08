/**
 * Utility for computing import file paths.
 *
 * Centralises the path-resolution logic so that individual job handlers
 * do not import `node:path` directly (which is difficult to mock with tsgo).
 *
 * @module
 * @category Jobs/Utils
 */
import path from "node:path";

/**
 * Return the absolute path to an import file given its filename.
 *
 * Uses the `UPLOAD_DIR` environment variable (defaulting to `"uploads"`)
 * and resolves relative to `process.cwd()`.
 */
export const getImportFilePath = (filename: string): string => {
  const uploadDir = path.resolve(process.cwd(), `${process.env.UPLOAD_DIR ?? "uploads"}/import-files`);
  return path.join(uploadDir, filename);
};
