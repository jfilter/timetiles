/**
 * Per-request i18n configuration for next-intl.
 *
 * Resolves the current locale and loads the corresponding message file.
 * This is called on every request by the next-intl plugin.
 *
 * @module
 * @category Configuration
 */

import { locale as rootLocale } from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

export default getRequestConfig(async ({ locale: explicitLocale }) => {
  // Explicit `locale` wins, else the [locale] root param (undefined outside it, e.g. Payload admin).
  // Route Handlers and Server Actions must pass `locale`: next/root-params throws there.
  const requested = explicitLocale ?? (await rootLocale());
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
