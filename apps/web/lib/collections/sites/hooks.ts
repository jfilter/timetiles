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

import { createEnforceSingleDefault } from "../shared-hooks";

export { setCreatedByHook as setCreatedBy } from "../shared-fields";

/**
 * Enforces that only one site can be the default.
 * When a site is set as default, unsets any other default sites.
 */
export const enforceSingleDefault: CollectionBeforeChangeHook<Site> = createEnforceSingleDefault({
  collection: "sites",
});

/**
 * Invalidates the site resolver cache after any site change.
 */
export const invalidateSiteCache: CollectionAfterChangeHook<Site> = () => {
  clearSiteCache();
};
