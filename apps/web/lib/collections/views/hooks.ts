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
import type { CollectionBeforeChangeHook } from "payload";

import type { View } from "@/payload-types";

/**
 * Sets the createdBy field to the current user on creation.
 */
export const setCreatedBy: CollectionBeforeChangeHook<View> = async ({ data, req, operation }) => {
  if (operation === "create" && req.user) {
    data.createdBy = req.user.id;
  }
  return data;
};

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

    // Unset isDefault on all other views
    await req.payload.update({
      collection: "views",
      where: {
        isDefault: { equals: true },
        ...(idFilter && { id: idFilter }),
      },
      data: {
        isDefault: false,
      },
      depth: 0,
      context: {
        skipEnforceSingleDefault: true, // Prevent recursion
      },
    });
  }

  return data;
};
