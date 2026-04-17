/**
 * Provides shared utilities for access control and permissions.
 *
 * This module centralizes the logic for determining what catalogs, datasets,
 * and events a user can access based on their authentication status and
 * ownership relationships. It's used by Payload collection access control
 * and API routes to ensure consistent permission checks.
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import type { User } from "@/payload-types";

/**
 * Check whether a user can access a specific catalog through Payload's
 * collection access rules.
 *
 * @param payload - Payload CMS instance
 * @param catalogId - Catalog ID to validate
 * @param user - Current user (optional)
 * @returns Whether the catalog is accessible to the caller
 */
export const canAccessCatalog = async (payload: Payload, catalogId: number, user?: User | null): Promise<boolean> => {
  const result = await payload.find({
    collection: "catalogs",
    where: { id: { equals: catalogId } },
    limit: 1,
    select: { name: true },
    user,
    overrideAccess: false,
  });

  return result.docs.length > 0;
};
