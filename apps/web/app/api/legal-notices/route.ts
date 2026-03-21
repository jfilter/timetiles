/**
 * API endpoint for fetching legal notice configuration.
 *
 * Returns legal page URLs and the optional registration disclaimer
 * for display on the registration form.
 *
 * @module
 * @category API
 */
import { type Locale, SUPPORTED_LOCALES } from "@/i18n/config";
import { apiRoute } from "@/lib/api";
import type { LegalNotices } from "@/lib/hooks/use-legal-notices";
import { logError } from "@/lib/logger";

const EMPTY_NOTICES: LegalNotices = { termsUrl: null, privacyUrl: null, registrationDisclaimer: null };

export const GET = apiRoute({
  auth: "none",
  handler: async ({ payload, req }) => {
    try {
      const url = new URL(req.url);
      const rawLocale = url.searchParams.get("locale") ?? "en";
      const locale: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(rawLocale)
        ? (rawLocale as Locale)
        : "en";

      const settings = await payload.findGlobal({ slug: "settings", locale });
      const legal = settings.legal;

      const notices: LegalNotices = {
        termsUrl: legal?.termsUrl ?? null,
        privacyUrl: legal?.privacyUrl ?? null,
        registrationDisclaimer: legal?.registrationDisclaimer ?? null,
      };

      return new Response(JSON.stringify(notices), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      });
    } catch (error) {
      logError(error, "Failed to fetch legal notices");
      return { ...EMPTY_NOTICES };
    }
  },
});
