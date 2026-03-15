/**
 * Shared i18n configuration constants.
 *
 * @module
 * @category Configuration
 */

export const SUPPORTED_LOCALES = ["en", "de"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = ((process.env.DEFAULT_LOCALE as Locale) || "en") satisfies Locale;
