/**
 * Filesystem walks over directories a scraper container writes to.
 *
 * A path that vanishes mid-walk is normal (the scraper deletes temp files);
 * every other error propagates, so a tree the runner cannot read is never
 * mistaken for an empty one.
 *
 * @module
 * @category Lib
 */

import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === "ENOENT";

/** Entries of a directory, or none when it does not exist; every other error propagates. */
export const listDirectory = async (dir: string): Promise<Dirent[]> => {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
};

/** Size of a file in bytes, or 0 when it vanished; every other error propagates. */
const fileSize = async (path: string): Promise<number> => {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (isMissing(error)) return 0;
    throw error;
  }
};

interface DirectoryUsage {
  bytes: number;
  entries: number;
}

/** Bytes and entries in a directory tree; stops counting past `maxEntries`. */
export const measureDirectory = async (
  dir: string,
  maxEntries: number,
  usage: DirectoryUsage = { bytes: 0, entries: 0 }
): Promise<DirectoryUsage> => {
  for (const entry of await listDirectory(dir)) {
    usage.entries++;
    if (usage.entries > maxEntries) return usage;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await measureDirectory(full, maxEntries, usage);
    } else if (entry.isFile()) {
      const size = await fileSize(full);
      usage.bytes += size;
    }
  }
  return usage;
};
