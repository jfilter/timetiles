/**
 * Utilities for embed functionality.
 *
 * @module
 * @category Utils
 */
import type { Site } from "@/payload-types";

/**
 * Checks whether a request's Referer origin is allowed by the site's
 * embedding config.
 *
 * Returns `true` if:
 * - No restrictions are configured (empty or missing `allowedOrigins`)
 * - The referer's origin matches one of the allowed origins
 *
 * When `allowedOrigins` is configured, a missing `Referer` header is
 * treated as **denied**. This prevents bypass via `Referrer-Policy: no-referrer`
 * on the embedding page. The middleware still sets `frame-ancestors *` because
 * it runs in Edge Runtime without DB access — the origin check here is the
 * actual enforcement layer and refuses to render content for disallowed origins.
 */
export const isEmbedOriginAllowed = (site: Site | null, referer: string | null): boolean => {
  const origins = site?.embeddingConfig?.allowedOrigins;
  if (!origins?.length) return true;
  if (!referer) return false;

  try {
    const refererOrigin = new URL(referer).origin;
    return origins.some((entry) => refererOrigin === entry.origin);
  } catch {
    return false;
  }
};
