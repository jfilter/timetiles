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

import { safeFetchRecord } from "@/lib/collections/catalog-ownership";
import { isPrivileged } from "@/lib/collections/shared-fields";
import { clearViewCache } from "@/lib/services/resolution/view-resolver";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { View } from "@/payload-types";

import { createEnforceSingleDefault } from "../shared-hooks";

export { setCreatedByHook as setCreatedBy } from "../shared-fields";

/**
 * Reject attaching a View to a Site the caller does not own.
 *
 * Views `create` is bare `isAuthenticated` (createPublicOwnershipAccess), `site`
 * is a required relationship, and `isPublic` defaults to true — while the view
 * resolver reads views anonymously with `overrideAccess: false`. Without this
 * check any authenticated user could plant a public View on someone else's Site
 * and have it served from that site's `/explore?view=<slug>`, controlling its
 * data scope, filter config and map style. Sites deliberately restrict `create`
 * to editors/admins "to prevent domain takeover"; a View is what actually drives
 * the public page, so it needs the equivalent guard.
 *
 * Mirrors datasets' `processCatalogValidation`: enforced on create, and on
 * update whenever the `site` relationship changes.
 */
export const validateSiteOwnership: CollectionBeforeChangeHook<View> = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  // System operations (seeding, migrations, account-deletion transfers) have no
  // acting user and are trusted.
  if (!req.user) return data;
  if (isPrivileged(req.user)) return data;

  const siteId = extractRelationId(data.site);
  if (siteId == null) return data;

  if (operation === "update") {
    const previousSiteId = extractRelationId(originalDoc?.site);
    // Unchanged relationship — ownership was already validated when it was set.
    if (previousSiteId === siteId) return data;
  }

  const site = await safeFetchRecord(req, "sites", siteId);
  // A site we cannot read must not be silently accepted.
  if (!site) {
    throw new Error("You can only create views in your own sites");
  }

  if (extractRelationId(site.createdBy) !== req.user.id) {
    throw new Error("You can only create views in your own sites");
  }

  return data;
};

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
