/**
 * Utility for extracting IDs from Payload CMS relationship fields.
 *
 * Payload relationship fields can be either the full related document (object with id)
 * or just the ID (number/string), depending on depth and population settings.
 * This helper normalizes both cases to a plain ID.
 *
 * @module
 * @category Utils
 */

/**
 * Extract the ID from a Payload relationship field value.
 *
 * Handles both populated (object) and unpopulated (id) relationship values.
 *
 * @example
 * ```typescript
 * // Works with both populated and unpopulated relationships:
 * const userId = extractRelationId(doc.createdBy); // number | string | undefined
 * const datasetId = extractRelationId(job.dataset); // number | string | undefined
 * ```
 */
export const extractRelationId = <TId = number>(value: { id: TId } | TId | null | undefined): TId | undefined => {
  if (value == null) return undefined;
  if (typeof value === "object") return (value as { id: TId }).id;
  return value;
};
