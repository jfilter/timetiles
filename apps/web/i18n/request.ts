/**
 * Per-request i18n configuration for next-intl.
 *
 * Resolves the current locale and loads the corresponding message file.
 * This is called on every request by the next-intl plugin.
 *
 * @module
 * @category Configuration
 */

import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
