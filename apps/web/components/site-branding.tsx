/**
 * Injects site-specific CSS custom properties for branding.
 *
 * Reads the active site's branding colors, typography, and style settings
 * and sets CSS variables on a wrapper div, making them available to all
 * descendant components. Also injects sanitized custom CSS if configured.
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
 * Renders nothing visible — only sets CSS variables via inline style.
 */
export const SiteBranding = () => {
  const siteContext = useSite();
  const { colors, typography, style: brandingStyle } = siteContext.branding;
  const customCode = siteContext.customCode;
  const siteSlug = siteContext.site?.slug;

  const inlineStyle = useMemo((): (React.CSSProperties & Record<string, string>) | undefined => {
    const s: React.CSSProperties & Record<string, string> = {};
    let hasValue = false;

    // Inject semantic color tokens
    if (colors) {
      for (const [key, cssVar] of Object.entries(COLOR_TOKEN_MAP)) {
        const value = colors[key as keyof SiteBrandingColors];
        if (value) {
          s[cssVar] = value;
          hasValue = true;
        }
      }
    }

    // Inject border radius
    if (brandingStyle?.borderRadius) {
      const radius = BORDER_RADIUS_MAP[brandingStyle.borderRadius];
      if (radius) {
        s["--radius"] = radius;
        hasValue = true;
      }
    }

    // Inject font pairing
    if (typography?.fontPairing) {
      s["--site-font-pairing"] = typography.fontPairing;
      hasValue = true;
    }

    // Inject density
    if (brandingStyle?.density) {
      s["--site-density"] = brandingStyle.density;
      hasValue = true;
    }

    return hasValue ? s : undefined;
  }, [colors, typography, brandingStyle]);

  const sanitizedCSS = useMemo(() => {
    if (!customCode?.customCSS) return null;
    return siteSlug
      ? `[data-site="${siteSlug}"] { ${sanitizeCSS(customCode.customCSS)} }`
      : sanitizeCSS(customCode.customCSS);
  }, [customCode?.customCSS, siteSlug]);

  const cssContent = sanitizedCSS ? { __html: sanitizedCSS } : undefined;

  if (!inlineStyle && !cssContent) {
    return null;
  }

  return (
    <>
      {inlineStyle && <div data-site-branding="" style={inlineStyle} className="contents" />}
      {cssContent && <style dangerouslySetInnerHTML={cssContent} />}
    </>
  );
};
