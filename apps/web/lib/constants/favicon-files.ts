/**
 * Shared naming for the favicon set generated from the Branding global.
 *
 * The Branding `afterChange` hook writes these files into `public/`, and the
 * metadata builder points browsers at exactly the same names. Keeping the
 * names in one place is what stops the generator and the consumer from
 * drifting apart — they previously did, so the generated files were written
 * and then never referenced by any page.
 *
 * @module
 * @category Constants
 */

/** Themes a favicon set is generated for. */
export type FaviconTheme = "light" | "dark";

/** Base name and pixel size of every file in a generated favicon set. */
export const FAVICON_SIZES = [
  { base: "icon-32", size: 32 },
  { base: "apple-touch-icon", size: 180 },
  { base: "icon-192", size: 192 },
  { base: "icon-512", size: 512 },
] as const;

/** Filename of a generated favicon, e.g. `icon-192-dark.png`. */
export const faviconFileName = (base: string, theme: FaviconTheme): string => `${base}-${theme}.png`;

/** Public URL of a generated favicon, e.g. `/icon-192-dark.png`. */
export const faviconPublicUrl = (base: string, theme: FaviconTheme): string => `/${faviconFileName(base, theme)}`;
