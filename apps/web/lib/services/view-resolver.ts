/**
 * View resolver service for determining the active View configuration.
 *
 * Resolves views in priority order:
 * 1. Custom domain match (e.g., events.city.gov)
 * 2. URL slug match (e.g., /v/city-events)
 * 3. Default view (isDefault: true)
 * 4. Null (no view configured)
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import type { View } from "@/payload-types";

import { logger } from "../logger";

/** Cache for resolved views (domain -> view) */
const viewCacheByDomain = new Map<string, View | null>();

/** Cache for resolved views (slug -> view) */
const viewCacheBySlug = new Map<string, View | null>();

/** Cache for default view */
let defaultViewCache: View | null | undefined;

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
    viewCacheByDomain.clear();
    viewCacheBySlug.clear();
    defaultViewCache = undefined;
    lastCacheClear = now;
  }
};

/**
 * Finds a view by custom domain.
 *
 * @param payload - Payload instance
 * @param domain - The domain to match (e.g., events.city.gov)
 * @returns The matching view or null
 */
export const findViewByDomain = async (payload: Payload, domain: string): Promise<View | null> => {
  maybeClearCache();

  // Check cache first
  if (viewCacheByDomain.has(domain)) {
    return viewCacheByDomain.get(domain) ?? null;
  }

  try {
    const result = await payload.find({
      collection: "views",
      where: {
        "branding.domain": { equals: domain },
        _status: { equals: "published" },
      },
      limit: 1,
      depth: 1, // Include logo/favicon media
    });

    const view = result.docs[0] ?? null;
    viewCacheByDomain.set(domain, view);
    return view;
  } catch (error) {
    logger.error({ error, domain }, "Error finding view by domain");
    return null;
  }
};

/**
 * Finds a view by URL slug.
 *
 * @param payload - Payload instance
 * @param slug - The slug to match (e.g., city-events)
 * @returns The matching view or null
 */
export const findViewBySlug = async (payload: Payload, slug: string): Promise<View | null> => {
  maybeClearCache();

  // Check cache first
  if (viewCacheBySlug.has(slug)) {
    return viewCacheBySlug.get(slug) ?? null;
  }

  try {
    const result = await payload.find({
      collection: "views",
      where: {
        slug: { equals: slug },
        _status: { equals: "published" },
      },
      limit: 1,
      depth: 1,
    });

    const view = result.docs[0] ?? null;
    viewCacheBySlug.set(slug, view);
    return view;
  } catch (error) {
    logger.error({ error, slug }, "Error finding view by slug");
    return null;
  }
};

/**
 * Finds the default view (isDefault: true).
 *
 * @param payload - Payload instance
 * @returns The default view or null
 */
export const findDefaultView = async (payload: Payload): Promise<View | null> => {
  maybeClearCache();

  // Check cache first
  if (defaultViewCache !== undefined) {
    return defaultViewCache;
  }

  try {
    const result = await payload.find({
      collection: "views",
      where: {
        isDefault: { equals: true },
        _status: { equals: "published" },
      },
      limit: 1,
      depth: 1,
    });

    const view = result.docs[0] ?? null;
    // eslint-disable-next-line require-atomic-updates -- Race condition is acceptable for caching; concurrent calls fetch same data
    defaultViewCache = view;
    return view;
  } catch (error) {
    logger.error({ error }, "Error finding default view");
    return null;
  }
};

/**
 * Extracts the view slug from a URL path.
 * Expects paths like /v/city-events or /v/city-events/explore
 *
 * @param pathname - The URL pathname
 * @returns The slug or null if not a view path
 */
export const extractViewSlugFromPath = (pathname: string): string | null => {
  const match = /^\/v\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
};

/**
 * Resolves the active view for a request.
 *
 * Resolution priority:
 * 1. Custom domain match
 * 2. URL slug match (/v/[slug])
 * 3. Default view
 *
 * @param payload - Payload instance
 * @param options - Resolution options
 * @returns The resolved view or null
 */
export const resolveView = async (
  payload: Payload,
  options: {
    host?: string | null;
    pathname?: string | null;
  }
): Promise<View | null> => {
  const { host, pathname } = options;

  // 1. Try domain match (skip localhost and known dev domains)
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    // Strip port if present
    const domain = host.split(":")[0] ?? host;
    const viewByDomain = await findViewByDomain(payload, domain);
    if (viewByDomain) {
      logger.debug({ domain }, "Resolved view by domain");
      return viewByDomain;
    }
  }

  // 2. Try slug from URL path
  if (pathname) {
    const slug = extractViewSlugFromPath(pathname);
    if (slug) {
      const viewBySlug = await findViewBySlug(payload, slug);
      if (viewBySlug) {
        logger.debug({ slug }, "Resolved view by slug");
        return viewBySlug;
      }
    }
  }

  // 3. Fall back to default view
  const defaultView = await findDefaultView(payload);
  if (defaultView) {
    logger.debug("Resolved default view");
  }
  return defaultView;
};

/**
 * Clears all view caches. Useful for testing or after admin changes.
 */
export const clearViewCache = (): void => {
  viewCacheByDomain.clear();
  viewCacheBySlug.clear();
  defaultViewCache = undefined;
  lastCacheClear = Date.now();
};

/**
 * Gets the data scope filter for a view.
 * Returns filter constraints for catalogs/datasets based on view configuration.
 *
 * @param view - The view configuration
 * @returns Filter constraints for data queries
 */
export const getViewDataScopeFilter = (
  view: View | null
): {
  catalogIds?: number[];
  datasetIds?: number[];
} => {
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
