/**
 * Tests for favicon metadata helpers.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { buildFaviconIcons, resolveMediaUrl } from "@/lib/metadata/favicon-icons";
import type { Branding, Media, Site } from "@/payload-types";

const media = (url: string): Media => ({ id: 1, url, alt: "Icon", updatedAt: "", createdAt: "" });

const branding = (overrides: Partial<Branding> = {}): Branding => ({
  id: 1,
  siteName: "TimeTiles",
  siteDescription: "Description",
  ...overrides,
});

const site = (favicon: Media | number | null): Site => ({
  id: 1,
  name: "Default",
  branding: { favicon },
  updatedAt: "",
  createdAt: "",
});

describe("favicon icon metadata", () => {
  it("extracts URLs only from populated media relations", () => {
    expect(resolveMediaUrl(media("/media/favicon.png"))).toBe("/media/favicon.png");
    expect(resolveMediaUrl(1)).toBeUndefined();
    expect(resolveMediaUrl(null)).toBeUndefined();
  });

  it("prefers site-specific favicon media over platform branding", () => {
    const icons = buildFaviconIcons({
      branding: branding({ faviconSourceLight: media("/media/platform.png") }),
      site: site(media("/media/site.png")),
    });

    expect(icons).toEqual({
      icon: [{ url: "/media/site.png" }],
      shortcut: [{ url: "/media/site.png" }],
      apple: [{ url: "/media/site.png" }],
    });
  });

  it("uses theme-aware platform favicons when configured", () => {
    const icons = buildFaviconIcons({
      branding: branding({
        faviconSourceLight: media("/media/light.png"),
        faviconSourceDark: media("/media/dark.png"),
      }),
      site: null,
    });

    expect(icons).toEqual({
      icon: [
        { url: "/media/light.png", media: "(prefers-color-scheme: light)" },
        { url: "/media/dark.png", media: "(prefers-color-scheme: dark)" },
        { url: "/media/light.png" },
      ],
      shortcut: [{ url: "/media/light.png" }],
      apple: [{ url: "/media/light.png" }],
    });
  });

  it("falls back to static app icons without duplicating the file-based favicon", () => {
    const icons = buildFaviconIcons({ branding: branding(), site: null });

    expect(icons).toEqual({
      icon: [
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      shortcut: [],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    });
  });
});
