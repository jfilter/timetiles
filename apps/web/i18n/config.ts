/**
 * Shared i18n configuration constants.
 *
 * @module
 * @category Configuration
 */
import { getEnv } from "@/lib/config/env";

export const SUPPORTED_LOCALES = ["en", "de"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = getEnv().DEFAULT_LOCALE;
