/**
 * Injects site-specific CSS custom properties for branding.
 *
 * Reads the active site's branding colors and sets CSS variables
 * on a hidden div, making them available to descendant components.
 *
 * @module
 * @category Components
 */
"use client";

import { useMemo } from "react";

import { useSiteOptional } from "@/lib/context/site-context";

/**
 * Client component that injects site branding CSS custom properties.
 * Renders nothing visible — only sets CSS variables via inline style.
 */
export const SiteBranding = () => {
  const siteContext = useSiteOptional();
  const colors = siteContext?.branding.colors;

  const style = useMemo((): (React.CSSProperties & Record<string, string>) | undefined => {
    if (!colors) return undefined;
    const { primary, secondary, background } = colors;
    if (!primary && !secondary && !background) return undefined;
    const s: React.CSSProperties & Record<string, string> = {};
    if (primary) s["--site-color-primary"] = primary;
    if (secondary) s["--site-color-secondary"] = secondary;
    if (background) s["--site-color-background"] = background;
    return s;
  }, [colors]);

  if (!style) {
    return null;
  }

  return <div data-site-branding="" style={style} className="contents" />;
};
