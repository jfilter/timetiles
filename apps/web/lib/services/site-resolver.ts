/**
 * Site resolver service for determining the active Site configuration.
 *
 * Resolves sites in priority order:
 * 1. Custom domain match (e.g., events.city.gov)
 * 2. Default site (isDefault: true)
 * 3. Null (no site configured)
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import type { Site } from "@/payload-types";

import { logger } from "../logger";

/** Cache for resolved sites (domain -> site) */
const siteCacheByDomain = new Map<string, Site | null>();

/** Cache for default site */
let defaultSiteCache: Site | null | undefined;

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL = 5 * 60 * 1000;

/** Last cache clear timestamp */
let lastCacheClear = Date.now();

/**
 * Clears the site cache if TTL has expired.
 */
const maybeClearCache = (): void => {
  const now = Date.now();
  if (now - lastCacheClear > CACHE_TTL) {
    siteCacheByDomain.clear();
    defaultSiteCache = undefined;
    lastCacheClear = now;
  }
};

/**
 * Finds a site by custom domain.
 *
 * @param payload - Payload instance
 * @param domain - The domain to match (e.g., events.city.gov)
 * @returns The matching site or null
 */
export const findSiteByDomain = async (payload: Payload, domain: string): Promise<Site | null> => {
  maybeClearCache();

  if (siteCacheByDomain.has(domain)) {
    return siteCacheByDomain.get(domain) ?? null;
  }

  try {
    const result = await payload.find({
      collection: "sites",
      where: { domain: { equals: domain }, _status: { equals: "published" } },
      limit: 1,
      sort: "createdAt",
      depth: 1, // Include logo/favicon media
    });

    const site = result.docs[0] ?? null;
    siteCacheByDomain.set(domain, site);
    return site;
  } catch (error) {
    logger.error({ error, domain }, "Error finding site by domain");
    return null;
  }
};

/**
 * Finds the default site (isDefault: true).
 *
 * @param payload - Payload instance
 * @returns The default site or null
 */
export const findDefaultSite = async (payload: Payload): Promise<Site | null> => {
  maybeClearCache();

  if (defaultSiteCache !== undefined) {
    return defaultSiteCache;
  }

  try {
    const result = await payload.find({
      collection: "sites",
      where: { isDefault: { equals: true }, _status: { equals: "published" } },
      limit: 1,
      depth: 1,
    });

    const site = result.docs[0] ?? null;
    // eslint-disable-next-line require-atomic-updates -- Race condition is acceptable for caching; concurrent calls fetch same data
    defaultSiteCache = site;
    return site;
  } catch (error) {
    logger.error({ error }, "Error finding default site");
    return null;
  }
};

/**
 * Resolves the active site for a request.
 *
 * Resolution priority:
 * 1. Custom domain match (skip localhost/dev domains)
 * 2. Default site
 *
 * @param payload - Payload instance
 * @param host - The request host header
 * @returns The resolved site or null
 */
export const resolveSite = async (payload: Payload, host?: string | null): Promise<Site | null> => {
  // 1. Try domain match (skip localhost and known dev domains)
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    // Strip port if present
    const domain = host.split(":")[0] ?? host;
    const siteByDomain = await findSiteByDomain(payload, domain);
    if (siteByDomain) {
      logger.debug({ domain }, "Resolved site by domain");
      return siteByDomain;
    }
  }

  // 2. Fall back to default site
  const defaultSite = await findDefaultSite(payload);
  if (defaultSite) {
    logger.debug("Resolved default site");
  }
  return defaultSite;
};

/**
 * Clears all site caches. Useful for testing or after admin changes.
 */
export const clearSiteCache = (): void => {
  siteCacheByDomain.clear();
  defaultSiteCache = undefined;
  lastCacheClear = Date.now();
};
