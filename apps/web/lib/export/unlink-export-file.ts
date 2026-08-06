/**
 * Best-effort deletion of export archives from disk.
 *
 * Export ZIPs contain the user's complete personal data, so every path that
 * retires a record must also retire its file. Failures are logged, never
 * thrown: the caller's outcome (a 410, a status flip) must not depend on the
 * filesystem.
 *
 * @module
 * @category Services
 */
import { unlink } from "node:fs/promises";

import { logger } from "@/lib/logger";

const isENOENT = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";

/**
 * Best-effort unlink; a file that is already gone is not an error.
 *
 * "missing" and "failed" are distinguished because only the former means the file is really
 * gone. A "failed" path has to stay on the record so a later cleanup run can retry it.
 */
export const unlinkExportFile = async (
  exportId: string | number,
  filePath: string,
  context: string
): Promise<"deleted" | "missing" | "failed"> => {
  try {
    await unlink(filePath);
    logger.debug({ exportId, filePath }, "Deleted export file");
    return "deleted";
  } catch (error) {
    if (isENOENT(error)) {
      logger.debug({ exportId, filePath, context }, "Export file already gone");
      return "missing";
    }
    logger.warn({ exportId, filePath, error, context }, "Could not delete export file");
    return "failed";
  }
};
