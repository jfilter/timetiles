/**
 * Hooks for the Views collection.
 *
 * Provides lifecycle hooks for:
 * - Setting createdBy on creation
 * - Enforcing single default view
 *
 * @module
 * @category Collections
 */
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from "payload";

import { clearViewCache } from "@/lib/services/view-resolver";
import type { View } from "@/payload-types";

export { setCreatedByHook as setCreatedBy } from "../shared-fields";

/**
 * Enforces that only one view can be the default.
 * When a view is set as default, unsets any other default views.
 */
export const enforceSingleDefault: CollectionBeforeChangeHook<View> = async ({
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

    // Unset isDefault on all other views (overrideAccess to clear across all users)
    await req.payload.update({
      collection: "views",
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
 * Invalidates the view resolver cache after any view change.
 */
export const invalidateViewCache: CollectionAfterChangeHook<View> = () => {
  clearViewCache();
};
