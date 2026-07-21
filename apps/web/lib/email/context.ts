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
import { getEmailTranslations, resolveEmailLocale } from "./i18n";

/** Combined email context with branding and translations. */
export interface EmailContext {
  branding: EmailBranding;
  t: EmailTranslator;
  /**
   * The locale the translator actually resolved to.
   *
   * Exposed because the message catalogue is only half of localizing an email:
   * dates are formatted by callers, and passing `undefined` to `Intl` picks the
   * SERVER's locale, not the recipient's. That put English dates inside German
   * emails. Callers formatting a date must pass this.
   */
  locale: string;
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
  return { branding, t, locale: resolveEmailLocale(locale) };
};
