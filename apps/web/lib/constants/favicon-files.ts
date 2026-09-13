/**
 * Shared naming and location for the favicon set generated from the Branding global.
 *
 * The Branding `afterChange` hook writes these files into persistent upload
 * storage, `app/api/favicons/[file]/route.ts` serves them, and the metadata
 * builder links them — all three resolve names and paths here.
 *
 * @module
 * @category Constants
 */
import { join } from "node:path";

import { getEnv } from "@/lib/config/env";

/** Themes a favicon set is generated for. */
export type FaviconTheme = "light" | "dark";

const FAVICON_THEMES: readonly FaviconTheme[] = ["light", "dark"];

/** Base name and pixel size of every file in a generated favicon set. */
export const FAVICON_SIZES = [
  { base: "icon-32", size: 32 },
  { base: "apple-touch-icon", size: 180 },
  { base: "icon-192", size: 192 },
  { base: "icon-512", size: 512 },
] as const;

/** Filename of a generated favicon, e.g. `icon-192-dark.png`. */
export const faviconFileName = (base: string, theme: FaviconTheme): string => `${base}-${theme}.png`;

/** Every filename a generated favicon set can contain. */
export const FAVICON_FILE_NAMES: readonly string[] = FAVICON_THEMES.flatMap((theme) =>
  FAVICON_SIZES.map(({ base }) => faviconFileName(base, theme))
);

/** Upload-storage directory holding the generated favicons. */
export const faviconDir = (): string => join(getEnv().UPLOAD_DIR, "favicons");

/** URL of a generated favicon, e.g. `/api/favicons/icon-192-dark.png`. */
export const faviconUrl = (base: string, theme: FaviconTheme): string =>
  `/api/favicons/${faviconFileName(base, theme)}`;
