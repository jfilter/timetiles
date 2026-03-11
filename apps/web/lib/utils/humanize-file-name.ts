/**
 * Strips the file extension and normalizes whitespace from a filename
 * to produce a human-readable label.
 *
 * @module
 * @category Utils
 */

export const humanizeFileName = (fileName: string): string =>
  fileName
    .replace(/\.[^/.]+$/, "")
    .replaceAll(/[-_]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
