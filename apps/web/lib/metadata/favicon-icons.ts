/**
 * Builds favicon metadata from site and platform branding.
 *
 * @module
 * @category Utils
 */
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

const FALLBACK_ICON_METADATA: FaviconIconMetadata = {
  icon: [
    { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
  shortcut: [],
  apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
};

/**
 * Extract a usable URL from a populated Payload media relation.
 */
export const resolveMediaUrl = (media: MediaField): string | undefined => {
  if (!media || typeof media === "number") return undefined;
  return media.url ?? undefined;
};

const buildSingleIconMetadata = (url: string): FaviconIconMetadata => ({
  icon: [{ url }],
  shortcut: [{ url }],
  apple: [{ url }],
});

const buildThemedIconMetadata = (lightUrl: string | undefined, darkUrl: string | undefined): FaviconIconMetadata => {
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
 * Build Next.js icon metadata, preferring site-specific favicons over
 * platform-wide branding and static fallback app icons.
 */
export const buildFaviconIcons = ({
  branding,
  site,
}: {
  branding: Branding;
  site: Site | null;
}): FaviconIconMetadata => {
  const siteFaviconUrl = resolveMediaUrl(site?.branding?.favicon);
  if (siteFaviconUrl) return buildSingleIconMetadata(siteFaviconUrl);

  return buildThemedIconMetadata(
    resolveMediaUrl(branding.faviconSourceLight),
    resolveMediaUrl(branding.faviconSourceDark)
  );
};
