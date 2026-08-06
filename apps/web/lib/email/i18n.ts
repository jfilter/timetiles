/**
 * Lightweight email translation helper.
 *
 * Loads email message files directly (no next-intl dependency) so translations
 * work in API routes, services, and background job handlers.
 *
 * @module
 * @category Email
 */
import { escapeHtml } from "@timetiles/ui/lib/escape-html";

import { DEFAULT_LOCALE } from "@/i18n/config";

import de from "./messages/de";
import en from "./messages/en";

/** All translation keys available for emails. */
export type EmailKey = keyof typeof en;

/**
 * A translation function returned by {@link getEmailTranslations}.
 *
 * Calling it escapes substituted values for HTML, because that is where almost
 * every result goes — the templates interpolate straight into markup. Use
 * `.plain()` for the few places that are not markup, above all subject lines,
 * where an escaped ampersand would be visible to the recipient.
 */
export type EmailTranslator = ((key: EmailKey, params?: EmailParams) => string) & {
  /** Same substitution, no HTML escaping. For plain-text contexts only. */
  plain: (key: EmailKey, params?: EmailParams) => string;
};

type EmailParams = Record<string, string | number>;

const messages: Record<string, Record<EmailKey, string>> = { en, de };

/**
 * Substitute `{name}` placeholders.
 *
 * The replacement is passed as a FUNCTION rather than a string: as a string,
 * `replaceAll` interprets `$&`, `` $` ``, `$'` and `$1` inside it, so a value
 * the user chose could splice other parts of the message into the output.
 */
const interpolate = (text: string, params: EmailParams | undefined, escape: boolean): string => {
  if (!params) return text;

  let result = text;
  for (const [key, value] of Object.entries(params)) {
    const rendered = escape ? escapeHtml(String(value)) : String(value);
    result = result.replaceAll(`{${key}}`, () => rendered);
  }
  return result;
};

/**
 * Get a translation function for the given locale.
 *
 * Falls back to {@link DEFAULT_LOCALE} if the locale is not supported.
 *
 * @example
 * ```typescript
 * const t = getEmailTranslations("de", { siteName: "TimeTiles" });
 * t("greeting", { name: "Max" }); // "Hallo Max,"
 * t("footer"); // "Dies ist eine automatische Nachricht von TimeTiles..."
 * ```
 */
/**
 * The locale email content will actually be rendered in.
 *
 * Shared so that date formatting and message lookup cannot disagree — they did,
 * and German emails carried English dates as a result.
 */
export const resolveEmailLocale = (locale?: string | null): string =>
  locale && locale in messages ? locale : DEFAULT_LOCALE;

export const getEmailTranslations = (locale?: string | null, defaults?: EmailParams): EmailTranslator => {
  const msgs = messages[resolveEmailLocale(locale)]!;

  const render = (key: EmailKey, params: EmailParams | undefined, escape: boolean): string => {
    const merged = (defaults ?? params) ? { ...defaults, ...params } : undefined;
    return interpolate(msgs[key], merged, escape);
  };

  const translate = ((key, params) => render(key, params, true)) as EmailTranslator;
  translate.plain = (key, params) => render(key, params, false);
  return translate;
};
