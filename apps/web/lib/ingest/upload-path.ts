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

import { getEnv } from "@/lib/config/env";

/**
 * Return the absolute path to an import file given its filename.
 *
 * Uses the `UPLOAD_DIR` environment variable (defaulting to `"uploads"`)
 * and resolves relative to `process.cwd()`.
 */
export const getIngestFilePath = (filename: string): string => {
  const uploadDir = path.resolve(process.cwd(), `${getEnv().UPLOAD_DIR}/ingest-files`);
  const resolved = path.resolve(uploadDir, filename);
  if (!resolved.startsWith(uploadDir + path.sep)) {
    throw new Error("Invalid filename: path traversal detected");
  }
  return resolved;
};
