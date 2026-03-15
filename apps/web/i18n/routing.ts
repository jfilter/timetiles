/**
 * next-intl routing configuration.
 *
 * Defines supported locales, default locale, and URL prefix strategy.
 * The default locale (from DEFAULT_LOCALE env var) has no URL prefix.
 * Non-default locales get a prefix (e.g., /de/explore).
 *
 * @module
 * @category Configuration
 */

import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./config";

export const routing = defineRouting({
  locales: [...SUPPORTED_LOCALES],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
});
