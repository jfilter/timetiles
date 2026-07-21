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

  it("points at the generated icon set, not the raw uploaded source image", () => {
    const icons = buildFaviconIcons({
      branding: branding({ faviconSourceLight: media("/media/light.png") }),
      site: null,
      generatedIconsExist: (theme) => theme === "light",
    });

    const urls = [...icons.icon, ...icons.shortcut, ...icons.apple].map((entry) => entry.url);
    expect(urls).not.toContain("/media/light.png");
    expect(icons).toEqual({
      icon: [
        { url: "/icon-32-light.png", sizes: "32x32", type: "image/png" },
        { url: "/icon-192-light.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512-light.png", sizes: "512x512", type: "image/png" },
      ],
      shortcut: [{ url: "/icon-32-light.png", sizes: "32x32", type: "image/png" }],
      apple: [{ url: "/apple-touch-icon-light.png", sizes: "180x180", type: "image/png" }],
    });
  });

  it("serves both generated theme sets behind prefers-color-scheme", () => {
    const icons = buildFaviconIcons({
      branding: branding({
        faviconSourceLight: media("/media/light.png"),
        faviconSourceDark: media("/media/dark.png"),
      }),
      site: null,
      generatedIconsExist: () => true,
    });

    expect(icons.icon.filter((entry) => entry.media === "(prefers-color-scheme: light)").map((e) => e.url)).toEqual([
      "/icon-32-light.png",
      "/icon-192-light.png",
      "/icon-512-light.png",
    ]);
    expect(icons.icon.filter((entry) => entry.media === "(prefers-color-scheme: dark)").map((e) => e.url)).toEqual([
      "/icon-32-dark.png",
      "/icon-192-dark.png",
      "/icon-512-dark.png",
    ]);
    expect(icons.apple).toEqual([{ url: "/apple-touch-icon-light.png", sizes: "180x180", type: "image/png" }]);
  });

  it("uses the dark generated set when only the dark source produced files", () => {
    const icons = buildFaviconIcons({
      branding: branding({
        faviconSourceLight: media("/media/light.png"),
        faviconSourceDark: media("/media/dark.png"),
      }),
      site: null,
      generatedIconsExist: (theme) => theme === "dark",
    });

    expect(icons.icon.map((entry) => entry.url)).toEqual([
      "/icon-32-dark.png",
      "/icon-192-dark.png",
      "/icon-512-dark.png",
    ]);
    expect(icons.icon.every((entry) => entry.media === undefined)).toBe(true);
  });

  it("falls back to the uploaded source image when generation has not run", () => {
    const icons = buildFaviconIcons({
      branding: branding({
        faviconSourceLight: media("/media/light.png"),
        faviconSourceDark: media("/media/dark.png"),
      }),
      site: null,
      generatedIconsExist: () => false,
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

  it("uses the generated set even when the media relation is an unresolved ID", () => {
    const icons = buildFaviconIcons({
      branding: branding({ faviconSourceLight: 7 }),
      site: null,
      generatedIconsExist: (theme) => theme === "light",
    });

    expect(icons.icon.map((entry) => entry.url)).toContain("/icon-192-light.png");
  });

  it("falls back to static app icons without duplicating the file-based favicon", () => {
    const icons = buildFaviconIcons({ branding: branding(), site: null, generatedIconsExist: () => false });

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
