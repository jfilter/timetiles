/**
 * Locale prefixing for hard navigations that bypass the next-intl router.
 *
 * Mirrors `localePrefix: "as-needed"`: the default locale stays unprefixed,
 * other locales get `/{locale}` in front of an unlocalized app path.
 *
 * @module
 * @category Configuration
 */

import { DEFAULT_LOCALE } from "./config";

export const localizePath = (path: string, locale: string): string => {
  if (locale === DEFAULT_LOCALE || path === `/${locale}` || path.startsWith(`/${locale}/`)) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
};
