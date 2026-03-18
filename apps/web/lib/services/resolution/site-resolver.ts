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

import { logger } from "../../logger";
import { createCachedResolver } from "./create-cached-resolver";

const resolver = createCachedResolver<Site>({ collection: "sites", keyField: "domain" });

/**
 * Finds a site by custom domain.
 */
export const findSiteByDomain = (payload: Payload, domain: string): Promise<Site | null> =>
  resolver.findByKey(payload, domain);

/**
 * Finds the default site (isDefault: true).
 */
export const findDefaultSite = (payload: Payload): Promise<Site | null> => resolver.findDefault(payload);

/**
 * Resolves the active site for a request.
 *
 * Resolution priority:
 * 1. Custom domain match (skip localhost/dev domains)
 * 2. Default site
 */
export const resolveSite = async (payload: Payload, host?: string | null): Promise<Site | null> => {
  // 1. Try domain match (skip localhost and known dev domains)
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
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
  resolver.clearCache();
};
