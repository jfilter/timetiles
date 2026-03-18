/**
 * Cached loader for email branding (site name + logo).
 *
 * Reads the Branding global from Payload and caches it for 5 minutes
 * to avoid a DB query on every email send.
 *
 * @module
 * @category Email
 */
import type { Payload } from "payload";

/** Branding values relevant for email templates. */
export interface EmailBranding {
  siteName: string;
  logoUrl: string | null;
}

let cache: { data: EmailBranding; expiry: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Load email branding from the Branding global (cached).
 *
 * Falls back to "TimeTiles" if siteName is not configured.
 */
export const getEmailBranding = async (payload: Payload): Promise<EmailBranding> => {
  if (cache && Date.now() < cache.expiry) return cache.data;

  const branding = await payload.findGlobal({ slug: "branding", depth: 1, overrideAccess: true });
  const baseUrl = process.env.NEXT_PUBLIC_PAYLOAD_URL ?? "";
  const logo = typeof branding.logoLight === "object" ? branding.logoLight : null;

  const data: EmailBranding = {
    siteName: branding.siteName ?? "TimeTiles",
    logoUrl: logo?.url ? `${baseUrl}${logo.url}` : null,
  };

  // eslint-disable-next-line require-atomic-updates -- intentional: worst case is a harmless double-load
  cache = { data, expiry: Date.now() + CACHE_TTL };
  return data;
};
