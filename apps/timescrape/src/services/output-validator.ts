/**
 * Validate scraper output before returning to caller.
 *
 * @module
 * @category Services
 */

import { OutputValidationError } from "../lib/errors.js";

// eslint-disable-next-line @typescript-eslint/require-await -- async by contract: part of the awaited validation pipeline and covered by promise-based tests
export const validateOutput = async (content: Buffer, maxSizeMb: number): Promise<void> => {
  const sizeMb = content.length / (1024 * 1024);

  if (sizeMb > maxSizeMb) {
    throw new OutputValidationError(`Output size (${sizeMb.toFixed(1)}MB) exceeds limit (${maxSizeMb}MB)`);
  }

  if (content.length === 0) {
    throw new OutputValidationError("Output file is empty");
  }

  // Basic CSV validation: check that the first line looks like a header
  const firstLine = content.toString("utf-8").split("\n")[0];
  if (!firstLine || firstLine.trim().length === 0) {
    throw new OutputValidationError("Output file has no header row");
  }
};
