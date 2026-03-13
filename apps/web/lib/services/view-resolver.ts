/**
 * View resolver service for determining the active View configuration.
 *
 * Resolves views within a site:
 * 1. Slug match (e.g., ?view=city-events)
 * 2. Default view (isDefault: true within the site)
 * 3. Null (no view configured)
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import type { View } from "@/payload-types";

import { logger } from "../logger";
import { createCachedResolver } from "./create-cached-resolver";

const resolver = createCachedResolver<View>({ collection: "views", keyField: "slug", scopeField: "site" });

/**
 * Finds a view by slug within a site.
 */
export const findViewBySlug = (payload: Payload, slug: string, siteId?: number): Promise<View | null> =>
  resolver.findByKey(payload, slug, siteId);

/**
 * Finds the default view within a site (isDefault: true).
 */
export const findDefaultView = (payload: Payload, siteId?: number): Promise<View | null> =>
  resolver.findDefault(payload, siteId);

/**
 * Resolves the active view for a request within a site.
 *
 * Resolution priority:
 * 1. Slug match
 * 2. Default view within the site
 */
export const resolveView = async (payload: Payload, siteId?: number, slug?: string | null): Promise<View | null> => {
  // 1. Try slug match
  if (slug) {
    const viewBySlug = await findViewBySlug(payload, slug, siteId);
    if (viewBySlug) {
      logger.debug({ slug, siteId }, "Resolved view by slug");
      return viewBySlug;
    }
  }

  // 2. Fall back to default view within the site
  const view = await findDefaultView(payload, siteId);
  if (view) {
    logger.debug({ siteId }, "Resolved default view");
  }
  return view;
};

/**
 * Clears all view caches. Useful for testing or after admin changes.
 */
export const clearViewCache = (): void => {
  resolver.clearCache();
};
