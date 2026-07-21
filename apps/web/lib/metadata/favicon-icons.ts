/**
 * Builds favicon metadata from site and platform branding.
 *
 * When the Branding global has favicon sources configured, the Branding
 * `afterChange` hook renders a properly sized icon set into `public/`. This
 * module points browsers at that generated set. It used to hand out the raw
 * uploaded source image instead, so every browser downloaded a full-size
 * upload as its favicon and the generated files were never requested at all.
 *
 * The generated files are only advertised when they are actually on disk —
 * generation can fail (unreachable media, bad image) and a `public/` directory
 * that was never regenerated must not produce 404 icons.
 *
 * @module
 * @category Utils
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { FAVICON_SIZES, faviconFileName, faviconPublicUrl, type FaviconTheme } from "@/lib/constants/favicon-files";
import type { Branding, Media, Site } from "@/payload-types";

type MediaField = (number | null) | Media | undefined;

interface IconDescriptor {
  url: string;
  type?: string;
  sizes?: string;
  media?: string;
}

export interface FaviconIconMetadata {
  icon: IconDescriptor[];
  shortcut: IconDescriptor[];
  apple: IconDescriptor[];
}

/** Predicate used to check whether a generated theme set exists on disk. */
export type GeneratedIconsExist = (theme: FaviconTheme) => boolean;

const FALLBACK_ICON_METADATA: FaviconIconMetadata = {
  icon: [
    { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
  shortcut: [],
  apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
};

const APPLE_BASE = "apple-touch-icon";
const SHORTCUT_BASE = "icon-32";

/**
 * Extract a usable URL from a populated Payload media relation.
 */
export const resolveMediaUrl = (media: MediaField): string | undefined => {
  if (!media || typeof media === "number") return undefined;
  return media.url ?? undefined;
};

/** True when a media relation is set at all (populated or an unresolved ID). */
const hasMedia = (media: MediaField): boolean => media != null;

/** Default on-disk check: every file of the theme's set must be present. */
const defaultGeneratedIconsExist: GeneratedIconsExist = (theme) =>
  FAVICON_SIZES.every(({ base }) => existsSync(join(process.cwd(), "public", faviconFileName(base, theme))));

const buildSingleIconMetadata = (url: string): FaviconIconMetadata => ({
  icon: [{ url }],
  shortcut: [{ url }],
  apple: [{ url }],
});

/** `<link rel="icon">` descriptors for one generated theme set. */
const generatedIconsFor = (theme: FaviconTheme, media?: string): IconDescriptor[] =>
  FAVICON_SIZES.filter(({ base }) => base !== APPLE_BASE).map(({ base, size }) => ({
    url: faviconPublicUrl(base, theme),
    sizes: `${size}x${size}`,
    type: "image/png",
    ...(media ? { media } : {}),
  }));

const generatedAppleIcon = (theme: FaviconTheme): IconDescriptor => ({
  url: faviconPublicUrl(APPLE_BASE, theme),
  sizes: "180x180",
  type: "image/png",
});

/**
 * Metadata for the generated icon sets. Apple touch icons ignore media
 * queries, so the light set (or whichever single set exists) is used there.
 */
const buildGeneratedIconMetadata = (light: boolean, dark: boolean): FaviconIconMetadata => {
  const primary: FaviconTheme = light ? "light" : "dark";

  const icon =
    light && dark
      ? [
          ...generatedIconsFor("light", "(prefers-color-scheme: light)"),
          ...generatedIconsFor("dark", "(prefers-color-scheme: dark)"),
        ]
      : generatedIconsFor(primary);

  return {
    icon,
    shortcut: [{ url: faviconPublicUrl(SHORTCUT_BASE, primary), sizes: "32x32", type: "image/png" }],
    apple: [generatedAppleIcon(primary)],
  };
};

/** Legacy path: advertise the raw source uploads when no generated set exists. */
const buildSourceIconMetadata = (lightUrl: string | undefined, darkUrl: string | undefined): FaviconIconMetadata => {
  const fallbackUrl = lightUrl ?? darkUrl;
  if (!fallbackUrl) return FALLBACK_ICON_METADATA;

  const themedIcons =
    lightUrl && darkUrl
      ? [
          { url: lightUrl, media: "(prefers-color-scheme: light)" },
          { url: darkUrl, media: "(prefers-color-scheme: dark)" },
        ]
      : [];

  return {
    icon: [...themedIcons, { url: fallbackUrl }],
    shortcut: [{ url: fallbackUrl }],
    apple: [{ url: fallbackUrl }],
  };
};

/**
 * Build Next.js icon metadata, preferring site-specific favicons, then the
 * icon set generated from platform branding, then the raw branding uploads,
 * then the static fallback app icons.
 */
export const buildFaviconIcons = ({
  branding,
  site,
  generatedIconsExist = defaultGeneratedIconsExist,
}: {
  branding: Branding;
  site: Site | null;
  generatedIconsExist?: GeneratedIconsExist;
}): FaviconIconMetadata => {
  const siteFaviconUrl = resolveMediaUrl(site?.branding?.favicon);
  if (siteFaviconUrl) return buildSingleIconMetadata(siteFaviconUrl);

  const light = hasMedia(branding.faviconSourceLight) && generatedIconsExist("light");
  const dark = hasMedia(branding.faviconSourceDark) && generatedIconsExist("dark");
  if (light || dark) return buildGeneratedIconMetadata(light, dark);

  return buildSourceIconMetadata(
    resolveMediaUrl(branding.faviconSourceLight),
    resolveMediaUrl(branding.faviconSourceDark)
  );
};
