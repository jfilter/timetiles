/**
 * Shared i18n configuration constants.
 *
 * @module
 * @category Configuration
 */
export const SUPPORTED_LOCALES = ["en", "de"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

// Read DEFAULT_LOCALE directly from process.env (not getEnv()) because this
// module is imported by i18n/navigation.ts which is used in client components.
// getEnv() requires DATABASE_URL/PAYLOAD_SECRET which don't exist on the client.
const envLocale = process.env.DEFAULT_LOCALE as Locale | undefined;
export const DEFAULT_LOCALE: Locale = envLocale && SUPPORTED_LOCALES.includes(envLocale) ? envLocale : "en";
