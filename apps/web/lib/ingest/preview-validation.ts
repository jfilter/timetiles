/**
 * Business-logic validation for import preview requests.
 *
 * Validates that a preview exists on disk, is not expired, and belongs to
 * the requesting user. Used by all import API routes that operate on
 * previews: configure, validate-preview, and preview-schema.
 *
 * @module
 * @category Import
 */
import fs from "node:fs";

import { UnauthorizedError, ValidationError } from "@/lib/api/errors";
import type { PreviewMetadata } from "@/lib/types/ingest-wizard";
import type { User } from "@/payload-types";

/**
 * Validate business-logic constraints that Zod cannot check.
 *
 * Shape validation (required fields, types, non-empty arrays) is handled
 * by Zod schemas. This function checks that the preview
 * exists on disk, is not expired, and belongs to the requesting user.
 *
 * Throws {@link ValidationError} or {@link UnauthorizedError} on failure.
 * After a successful call, `previewMeta` is narrowed to non-null.
 */
export function validateRequest(
  previewMeta: PreviewMetadata | null,
  user: User
): asserts previewMeta is PreviewMetadata {
  if (!previewMeta) {
    throw new ValidationError("Preview not found or expired. Please upload the file again.");
  }

  // Bug 27 fix: reject expired previews
  if (previewMeta.expiresAt && new Date(previewMeta.expiresAt) < new Date()) {
    throw new ValidationError("Preview has expired. Please upload the file again.");
  }

  if (previewMeta.userId !== user.id) {
    throw new UnauthorizedError("You do not have access to this preview");
  }

  if (!fs.existsSync(previewMeta.filePath)) {
    throw new ValidationError("Preview file not found. Please upload the file again.");
  }
}
