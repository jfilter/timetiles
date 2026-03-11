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
import type { Payload, Where } from "payload";

import type { View } from "@/payload-types";

import { logger } from "../logger";

/** Cache for resolved views (cacheKey -> view) */
const viewCacheBySlug = new Map<string, View | null>();

/** Cache for default views (siteId -> view) */
const defaultViewCache = new Map<number, View | null>();

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL = 5 * 60 * 1000;

/** Last cache clear timestamp */
let lastCacheClear = Date.now();

/**
 * Clears the view cache if TTL has expired.
 */
const maybeClearCache = (): void => {
  const now = Date.now();
  if (now - lastCacheClear > CACHE_TTL) {
    viewCacheBySlug.clear();
    defaultViewCache.clear();
    lastCacheClear = now;
  }
};

/**
 * Finds a view by slug within a site.
 *
 * @param payload - Payload instance
 * @param slug - The slug to match (e.g., city-events)
 * @param siteId - The site ID to scope the search
 * @returns The matching view or null
 */
export const findViewBySlug = async (payload: Payload, slug: string, siteId?: number): Promise<View | null> => {
  maybeClearCache();

  const cacheKey = `${siteId ?? "global"}:${slug}`;
  if (viewCacheBySlug.has(cacheKey)) {
    return viewCacheBySlug.get(cacheKey) ?? null;
  }

  try {
    const where: Where = {
      slug: { equals: slug },
      _status: { equals: "published" },
      ...(siteId != null && { site: { equals: siteId } }),
    };

    const result = await payload.find({ collection: "views", where, limit: 1, depth: 1 });

    const view = result.docs[0] ?? null;
    viewCacheBySlug.set(cacheKey, view);
    return view;
  } catch (error) {
    logger.error({ error, slug, siteId }, "Error finding view by slug");
    return null;
  }
};

/**
 * Finds the default view within a site (isDefault: true).
 *
 * @param payload - Payload instance
 * @param siteId - The site ID to scope the search
 * @returns The default view or null
 */
export const findDefaultView = async (payload: Payload, siteId?: number): Promise<View | null> => {
  maybeClearCache();

  const cacheId = siteId ?? 0;
  if (defaultViewCache.has(cacheId)) {
    return defaultViewCache.get(cacheId) ?? null;
  }

  try {
    const where: Where = {
      isDefault: { equals: true },
      _status: { equals: "published" },
      ...(siteId != null && { site: { equals: siteId } }),
    };

    const result = await payload.find({ collection: "views", where, limit: 1, depth: 1 });

    const view = result.docs[0] ?? null;
    defaultViewCache.set(cacheId, view);
    return view;
  } catch (error) {
    logger.error({ error, siteId }, "Error finding default view");
    return null;
  }
};

/**
 * Resolves the active view for a request within a site.
 *
 * Resolution priority:
 * 1. Slug match
 * 2. Default view within the site
 *
 * @param payload - Payload instance
 * @param siteId - The site ID
 * @param slug - Optional view slug
 * @returns The resolved view or null
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
  viewCacheBySlug.clear();
  defaultViewCache.clear();
  lastCacheClear = Date.now();
};

/**
 * Gets the data scope filter for a view.
 * Returns filter constraints for catalogs/datasets based on view configuration.
 *
 * @param view - The view configuration
 * @returns Filter constraints for data queries
 */
export const getViewDataScopeFilter = (view: View | null): { catalogIds?: number[]; datasetIds?: number[] } => {
  if (!view?.dataScope) {
    return {};
  }

  const { mode, catalogs, datasets } = view.dataScope;

  switch (mode) {
    case "catalogs":
      if (catalogs && catalogs.length > 0) {
        const catalogIds = catalogs.map((c) => (typeof c === "number" ? c : c.id));
        return { catalogIds };
      }
      return {};

    case "datasets":
      if (datasets && datasets.length > 0) {
        const datasetIds = datasets.map((d) => (typeof d === "number" ? d : d.id));
        return { datasetIds };
      }
      return {};

    case "all":
    default:
      return {};
  }
};
