/**
 * Convenience helper for loading email branding + translations together.
 *
 * Most email-sending code needs both branding (site name, logo) and a
 * translator function. This helper combines them into a single call.
 *
 * @module
 * @category Email
 */
import type { Payload } from "payload";

import type { EmailBranding } from "./branding";
import { getEmailBranding } from "./branding";
import type { EmailTranslator } from "./i18n";
import { getEmailTranslations } from "./i18n";

/** Combined email context with branding and translations. */
export interface EmailContext {
  branding: EmailBranding;
  t: EmailTranslator;
}

/**
 * Load email branding and create a translator for the given locale.
 *
 * @example
 * ```typescript
 * const { branding, t } = await getEmailContext(payload, user.locale);
 * const subject = t("verificationSubject");
 * ```
 */
export const getEmailContext = async (payload: Payload, locale?: string | null): Promise<EmailContext> => {
  const branding = await getEmailBranding(payload);
  const t = getEmailTranslations(locale, { siteName: branding.siteName });
  return { branding, t };
};
