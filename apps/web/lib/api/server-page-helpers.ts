/**
 * Server-side helpers for gating pages based on site context.
 *
 * These helpers are for use in Next.js server components (pages/layouts),
 * not in API routes (use `site: "default"` in `apiRoute()` config instead).
 *
 * @module
 * @category API
 */
import type { Payload } from "payload";

import { redirect } from "@/i18n/navigation";
import { resolveSite } from "@/lib/services/resolution/site-resolver";

/**
 * Redirect to the home page if the request is not from the default (main) site.
 * No-op when no sites are configured or the resolved site is the default.
 *
 * @param payload - Payload instance
 * @param headers - Request headers (from `next/headers`)
 * @param locale - The current locale for the redirect
 */
export const redirectIfNotDefaultSite = async (payload: Payload, headers: Headers, locale: string): Promise<void> => {
  const site = await resolveSite(payload, headers.get("host"));
  if (site && !site.isDefault) {
    redirect({ href: "/", locale });
  }
};
