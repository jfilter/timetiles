/**
 * Validate scraper output before returning to caller.
 *
 * @module
 * @category Services
 */

import { OutputValidationError } from "../lib/errors.js";

/**
 * Reject output that cannot be handed on, and only that.
 *
 * An EMPTY file is deliberately accepted. A scrape that legitimately finds
 * nothing — a listing page with no entries today — writes a zero-byte file,
 * and rejecting it turned a correct run into a failed one. The caller reads
 * "file present, zero records" as a successful run of zero rows; a scraper
 * that never wrote the file at all is still a failure, and that distinction
 * lives in the caller because only it knows whether the file exists.
 *
 * A file that has content but whose FIRST line is blank is still malformed:
 * there is data with no header to name its columns, which no consumer can use.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- async by contract: part of the awaited validation pipeline and covered by promise-based tests
export const validateOutput = async (content: Buffer, maxSizeMb: number): Promise<void> => {
  const sizeMb = content.length / (1024 * 1024);

  if (sizeMb > maxSizeMb) {
    throw new OutputValidationError(`Output size (${sizeMb.toFixed(1)}MB) exceeds limit (${maxSizeMb}MB)`);
  }

  if (content.length === 0) {
    return; // legitimately empty scrape
  }

  // Basic CSV validation: check that the first line looks like a header
  const firstLine = content.toString("utf-8").split("\n")[0];
  if (!firstLine || firstLine.trim().length === 0) {
    throw new OutputValidationError("Output file has no header row");
  }
};
