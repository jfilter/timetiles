/**
 * Keep client updates from replacing Payload-generated storage metadata.
 *
 * Do not redeclare upload fields: Payload sanitizes custom fields before merging
 * its upload fields, so a default text validator can replace its MIME validator.
 * A beforeValidate hook preserves the native field definitions and validation.
 *
 * @module
 * @category Collections
 */
import type { CollectionBeforeValidateHook } from "payload";

const STORAGE_FIELDS = ["filename", "mimeType", "url", "thumbnailURL", "filesize", "width", "height", "sizes"] as const;

export const preserveUploadMetadata: CollectionBeforeValidateHook = ({ data, operation, originalDoc, req }) => {
  // Internal writers have no user; actual uploads/replacements have a file
  // processed by Payload. Neither should be mistaken for a metadata-only PATCH.
  if (operation !== "update" || !req.user || Boolean(req.file) || !data) return data;
  const restored = { ...data };
  for (const field of STORAGE_FIELDS) {
    if (field in restored) restored[field] = originalDoc?.[field];
  }
  return restored;
};
