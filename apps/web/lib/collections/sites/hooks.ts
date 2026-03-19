/**
 * Hooks for the Sites collection.
 *
 * Provides lifecycle hooks for:
 * - Setting createdBy on creation
 * - Enforcing single default site
 * - Restricting domain field changes to admins
 * - Sanitizing custom code fields
 * - Invalidating site cache on changes
 * - Auto-creating a default View when a Site is created
 *
 * @module
 * @category Collections
 */
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from "payload";

import { logError } from "@/lib/logger";
import { sanitizeCSS } from "@/lib/security/css-sanitizer";
import { sanitizeHTML } from "@/lib/security/html-sanitizer";
import { clearSiteCache } from "@/lib/services/resolution/site-resolver";
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
 * Restricts domain field changes to admin users only.
 */
export const restrictDomainField: CollectionBeforeChangeHook<Site> = ({ data, req, originalDoc }) => {
  const user = req.user;
  if (!user || user.role === "admin") return data;
  if (data.domain && data.domain !== originalDoc?.domain) {
    delete data.domain;
  }
  return data;
};

/**
 * Sanitizes custom code fields before saving to the database.
 */
export const sanitizeCustomCode: CollectionBeforeChangeHook<Site> = ({ data }) => {
  if (data.customCode) {
    if (data.customCode.bodyStartHtml) data.customCode.bodyStartHtml = sanitizeHTML(data.customCode.bodyStartHtml);
    if (data.customCode.bodyEndHtml) data.customCode.bodyEndHtml = sanitizeHTML(data.customCode.bodyEndHtml);
    if (data.customCode.headHtml) data.customCode.headHtml = sanitizeHTML(data.customCode.headHtml);
    if (data.customCode.customCSS) data.customCode.customCSS = sanitizeCSS(data.customCode.customCSS);
  }
  return data;
};

/**
 * Invalidates the site resolver cache after any site change.
 */
export const invalidateSiteCache: CollectionAfterChangeHook<Site> = () => {
  clearSiteCache();
};

/**
 * Auto-creates a default View when a new Site is created.
 * The View shows all data with auto-detected filters and default map settings.
 */
export const createDefaultView: CollectionAfterChangeHook<Site> = async ({ doc, operation, req }) => {
  if (operation !== "create") return doc;

  try {
    await req.payload.create({
      collection: "views",
      overrideAccess: true,
      req,
      data: {
        name: "Default",
        slug: `${doc.slug}-default`,
        site: doc.id,
        isDefault: true,
        isPublic: true,
        _status: "published",
        dataScope: { mode: "all" },
        filterConfig: { mode: "auto", maxFilters: 5 },
        mapSettings: { baseMapStyle: "default" },
      },
    });
  } catch (error) {
    logError(error, "Failed to create default view for site", { siteId: doc.id });
  }

  return doc;
};
