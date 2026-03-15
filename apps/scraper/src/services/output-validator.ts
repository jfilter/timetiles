/**
 * Validate scraper output before returning to caller.
 *
 * @module
 * @category Services
 */

import { OutputValidationError } from "../lib/errors.js";

export async function validateOutput(content: Buffer, maxSizeMb: number): Promise<void> {
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
}
