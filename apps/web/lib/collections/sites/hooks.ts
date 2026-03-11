/**
 * Hooks for the Sites collection.
 *
 * Provides lifecycle hooks for:
 * - Setting createdBy on creation
 * - Enforcing single default site
 * - Invalidating site cache on changes
 *
 * @module
 * @category Collections
 */
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from "payload";

import { clearSiteCache } from "@/lib/services/site-resolver";
import type { Site } from "@/payload-types";

export { setCreatedByHook as setCreatedBy } from "../shared-fields";

/**
 * Enforces that only one site can be the default.
 * When a site is set as default, unsets any other default sites.
 */
export const enforceSingleDefault: CollectionBeforeChangeHook<Site> = async ({
  data,
  req,
  operation,
  originalDoc,
  context,
}) => {
  // Skip if called recursively from another enforceSingleDefault
  if (context?.skipEnforceSingleDefault) {
    return data;
  }

  // Only run if isDefault is being set to true
  const wasDefault = originalDoc?.isDefault ?? false;
  const isNowDefault = data.isDefault ?? false;

  if (isNowDefault && !wasDefault) {
    // On update, exclude the current document; on create, update all defaults
    const idFilter = operation === "update" && originalDoc?.id ? { not_equals: originalDoc.id } : undefined;

    // Unset isDefault on all other sites (overrideAccess to clear across all users)
    await req.payload.update({
      collection: "sites",
      where: { isDefault: { equals: true }, ...(idFilter && { id: idFilter }) },
      data: { isDefault: false },
      depth: 0,
      overrideAccess: true,
      context: {
        skipEnforceSingleDefault: true, // Prevent recursion
      },
    });
  }

  return data;
};

/**
 * Invalidates the site resolver cache after any site change.
 */
export const invalidateSiteCache: CollectionAfterChangeHook<Site> = () => {
  clearSiteCache();
};
