/**
 * Injects site-specific CSS custom properties for branding.
 *
 * Reads the active site's branding colors, typography, and style settings
 * and emits them as a CSS rule scoped to the layout's `data-site` body
 * attribute, making them available to the whole page. Also injects
 * sanitized custom CSS if configured.
 *
 * @module
 * @category Components
 */
"use client";

import { useMemo } from "react";

import type { SiteBrandingColors } from "@/lib/context/site-context";
import { useSite } from "@/lib/context/site-context";
import { sanitizeCSS } from "@/lib/security/css-sanitizer";

/** Map semantic color keys to CSS custom property names. */
const COLOR_TOKEN_MAP: Record<keyof SiteBrandingColors, string> = {
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  border: "--border",
  ring: "--ring",
};

const BORDER_RADIUS_MAP: Record<string, string> = { sharp: "0rem", rounded: "0.25rem", pill: "1rem" };

/**
 * Client component that injects site branding CSS custom properties.
 * Renders nothing visible — only emits `<style>` tags.
 *
 * The variables MUST go through a stylesheet rule on the `data-site` body
 * attribute (set by the layouts): this component renders as a SIBLING of the
 * page content, so inline style on its own childless div cascades to nothing
 * — exactly the bug that made every branding setting a silent no-op.
 */
export const SiteBranding = () => {
  const siteContext = useSite();
  const { colors, typography, style: brandingStyle } = siteContext.branding;
  const customCode = siteContext.customCode;
  const siteSlug = siteContext.site?.slug;

  const brandingCSS = useMemo((): string | null => {
    const declarations: string[] = [];

    // Inject semantic color tokens
    if (colors) {
      for (const [key, cssVar] of Object.entries(COLOR_TOKEN_MAP)) {
        const value = colors[key as keyof SiteBrandingColors];
        if (value) {
          declarations.push(`${cssVar}: ${value};`);
        }
      }
    }

    // Inject border radius
    if (brandingStyle?.borderRadius) {
      const radius = BORDER_RADIUS_MAP[brandingStyle.borderRadius];
      if (radius) {
        declarations.push(`--radius: ${radius};`);
      }
    }

    // Inject font pairing
    if (typography?.fontPairing) {
      declarations.push(`--site-font-pairing: ${typography.fontPairing};`);
    }

    // Inject density
    if (brandingStyle?.density) {
      declarations.push(`--site-density: ${brandingStyle.density};`);
    }

    if (declarations.length === 0) return null;

    // Values are admin-entered — run them through the same sanitizer as
    // customCSS before they reach a style tag.
    const sanitized = sanitizeCSS(declarations.join(" "));
    if (!sanitized) return null;

    const scope = siteSlug ? `[data-site="${siteSlug}"]` : ":root";
    return `${scope} { ${sanitized} }`;
  }, [colors, typography, brandingStyle, siteSlug]);

  const sanitizedCSS = useMemo(() => {
    if (!customCode?.customCSS) return null;
    return siteSlug
      ? `[data-site="${siteSlug}"] { ${sanitizeCSS(customCode.customCSS)} }`
      : sanitizeCSS(customCode.customCSS);
  }, [customCode?.customCSS, siteSlug]);

  const combinedCSS = [brandingCSS, sanitizedCSS].filter(Boolean).join("\n");

  if (!combinedCSS) {
    return null;
  }

  // eslint-disable-next-line react/no-danger -- sanitized via sanitizeCSS above
  return <style dangerouslySetInnerHTML={{ __html: combinedCSS }} />;
};
