/**
 * Language display names in the viewer's locale.
 *
 * Detection stores ISO 639-3 codes and produces an English name alongside them; that name
 * is what used to be rendered, so a page under `/de` read "Automatisch erkannt: German".
 * Resolve from the CODE instead, through `Intl.DisplayNames`.
 *
 * @module
 * @category Utils
 */

/** `Intl.DisplayNames` speaks ISO 639-1 for the languages the detector reports. */
const ISO_639_3_TO_1: Record<string, string> = {
  eng: "en",
  deu: "de",
  fra: "fr",
  spa: "es",
  ita: "it",
  nld: "nl",
  por: "pt",
};

/** ISO 639-2 "undetermined" — `Intl.DisplayNames` renders it as the useless "root". */
export const UNDETERMINED_LANGUAGE_CODE = "und";

/**
 * Display name for a detected language code, in `locale`.
 *
 * `fallback` covers the undetermined code and anything Intl cannot name; it defaults to the
 * raw code so a caller without a translated string still shows something recognizable.
 */
export const getLanguageName = (code: string, locale: string, fallback?: string): string => {
  if (code === UNDETERMINED_LANGUAGE_CODE) return fallback ?? code;

  const shortCode = ISO_639_3_TO_1[code] ?? code;
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(shortCode) ?? fallback ?? code;
  } catch {
    return fallback ?? code;
  }
};
