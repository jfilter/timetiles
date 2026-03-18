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

import { clearViewCache } from "@/lib/services/resolution/view-resolver";
import type { View } from "@/payload-types";

import { createEnforceSingleDefault } from "../shared-hooks";

export { setCreatedByHook as setCreatedBy } from "../shared-fields";

/**
 * Enforces that only one view can be the default within its site.
 * When a view is set as default, unsets any other default views in the same site.
 */
export const enforceSingleDefault: CollectionBeforeChangeHook<View> = createEnforceSingleDefault({
  collection: "views",
  scope: {
    field: "site",
    getId: (data) => {
      const site = data.site;
      return typeof site === "number" ? site : (site as { id: number } | undefined)?.id;
    },
  },
});

/**
 * Invalidates the view resolver cache after any view change.
 */
export const invalidateViewCache: CollectionAfterChangeHook<View> = () => {
  clearViewCache();
};
