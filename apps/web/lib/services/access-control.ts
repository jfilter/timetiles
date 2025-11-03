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

import { logger } from "@/lib/logger";
import type { User } from "@/payload-types";

export interface AccessibleCatalogIds {
  publicCatalogIds: number[];
  ownedCatalogIds: number[];
  allAccessibleIds: number[];
}

/**
 * Get catalog IDs that are accessible to the user.
 *
 * Returns three sets of IDs:
 * - publicCatalogIds: Catalogs marked as public
 * - ownedCatalogIds: Catalogs created by the user
 * - allAccessibleIds: Combined list of all accessible catalogs
 *
 * @param payload - Payload CMS instance
 * @param user - Current user (optional)
 * @returns Object containing public, owned, and all accessible catalog IDs
 */
export const getAccessibleCatalogIds = async (payload: Payload, user?: User | null): Promise<AccessibleCatalogIds> => {
  try {
    // Get public catalogs
    const publicCatalogs = await payload.find({
      collection: "catalogs",
      where: { isPublic: { equals: true } },
      limit: 100,
      pagination: false,
      overrideAccess: true,
    });
    const publicCatalogIds = publicCatalogs.docs.map((cat) => cat.id);

    // Get owned catalogs (if authenticated)
    let ownedCatalogIds: number[] = [];
    if (user) {
      const ownedCatalogs = await payload.find({
        collection: "catalogs",
        where: { createdBy: { equals: user.id } },
        limit: 100,
        pagination: false,
        overrideAccess: true,
      });
      ownedCatalogIds = ownedCatalogs.docs.map((cat) => cat.id);
    }

    // Combine all accessible catalog IDs (removing duplicates)
    const allAccessibleIds = [...new Set([...publicCatalogIds, ...ownedCatalogIds])];

    return {
      publicCatalogIds,
      ownedCatalogIds,
      allAccessibleIds,
    };
  } catch (error) {
    logger.warn("Error fetching accessible catalogs", { error });
    return {
      publicCatalogIds: [],
      ownedCatalogIds: [],
      allAccessibleIds: [],
    };
  }
};

/**
 * Get all accessible catalog IDs for a user (simplified version).
 *
 * This is a convenience method that returns only the combined list of
 * accessible catalog IDs, useful for simple permission checks.
 *
 * @param payload - Payload CMS instance
 * @param user - Current user (optional)
 * @returns Array of accessible catalog IDs
 */
export const getAllAccessibleCatalogIds = async (payload: Payload, user?: User | null): Promise<number[]> => {
  const { allAccessibleIds } = await getAccessibleCatalogIds(payload, user);
  return allAccessibleIds;
};
