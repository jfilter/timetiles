/**
 * Shared helpers for fetching user-owned collection data.
 *
 * Both AccountDeletionService and DataExportService need to count and
 * fetch documents owned by a user across multiple collections. This
 * module eliminates the repeated `payload.find/count` boilerplate.
 *
 * @module
 * @category Utils
 */
import type { Payload, Where } from "payload";

import type { Config } from "@/payload-types";

type CollectionSlug = keyof Config["collections"];

/**
 * Count documents in a collection that belong to a user.
 *
 * @param payload - Payload instance
 * @param collection - Collection slug to count in
 * @param userId - The user ID to filter by
 * @param options - Optional configuration
 * @param options.userField - Field name that stores the user reference (default: "createdBy")
 * @param options.extraWhere - Additional where conditions to apply
 * @returns The total number of matching documents
 */
export const countUserDocs = async (
  payload: Payload,
  collection: CollectionSlug,
  userId: number,
  options: { userField?: string; extraWhere?: Where[] } = {}
): Promise<number> => {
  const { userField = "createdBy", extraWhere = [] } = options;

  const where: Where =
    extraWhere.length > 0
      ? { and: [{ [userField]: { equals: userId } }, ...extraWhere] }
      : { [userField]: { equals: userId } };

  const result = await payload.count({ collection, where, overrideAccess: true });

  return result.totalDocs;
};

/**
 * Find all documents in a collection that belong to a user.
 *
 * Returns all matching docs with pagination disabled by default.
 *
 * @param payload - Payload instance
 * @param collection - Collection slug to search in
 * @param userId - The user ID to filter by
 * @param options - Optional configuration
 * @param options.userField - Field name that stores the user reference (default: "createdBy")
 * @param options.extraWhere - Additional where conditions to apply
 * @param options.limit - Maximum number of documents to return (default: no limit)
 * @returns Array of matching documents
 */
export const findUserDocs = async <T extends CollectionSlug>(
  payload: Payload,
  collection: T,
  userId: number,
  options: { userField?: string; extraWhere?: Where[]; limit?: number } = {}
): Promise<Config["collections"][T][]> => {
  const { userField = "createdBy", extraWhere = [], limit } = options;

  const where: Where =
    extraWhere.length > 0
      ? { and: [{ [userField]: { equals: userId } }, ...extraWhere] }
      : { [userField]: { equals: userId } };

  const result = await payload.find({
    collection,
    where,
    ...(limit != null ? { limit } : { pagination: false }),
    overrideAccess: true,
  });

  return result.docs;
};
