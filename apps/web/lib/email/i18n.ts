/**
 * Lightweight email translation helper.
 *
 * Loads email message files directly (no next-intl dependency) so translations
 * work in API routes, services, and background job handlers.
 *
 * @module
 * @category Email
 */
import { DEFAULT_LOCALE } from "@/i18n/config";

import de from "./messages/de";
import en from "./messages/en";

/** All translation keys available for emails. */
export type EmailKey = keyof typeof en;

/** A translation function returned by {@link getEmailTranslations}. */
export type EmailTranslator = (key: EmailKey, params?: Record<string, string | number>) => string;

const messages: Record<string, Record<EmailKey, string>> = { en, de };

/**
 * Get a translation function for the given locale.
 *
 * Falls back to {@link DEFAULT_LOCALE} if the locale is not supported.
 *
 * @example
 * ```typescript
 * const t = getEmailTranslations("de");
 * t("greeting", { name: "Max" }); // "Hallo Max,"
 * t("footer"); // "Dies ist eine automatische Nachricht..."
 * ```
 */
export const getEmailTranslations = (locale?: string | null): EmailTranslator => {
  const resolved = locale && locale in messages ? locale : DEFAULT_LOCALE;
  const msgs = messages[resolved]!;

  return (key, params) => {
    let text: string = msgs[key];
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }
    return text;
  };
};
