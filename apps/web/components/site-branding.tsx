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

import { useSiteOptional } from "@/lib/context/site-context";

/**
 * Client component that injects site branding CSS custom properties.
 * Renders nothing visible — only sets CSS variables via inline style.
 */
export const SiteBranding = () => {
  const siteContext = useSiteOptional();

  if (!siteContext?.branding.colors) {
    return null;
  }

  const { primary, secondary, background } = siteContext.branding.colors;

  // Only render if at least one color is set
  if (!primary && !secondary && !background) {
    return null;
  }

  const style: React.CSSProperties & Record<string, string> = {};
  if (primary) style["--site-color-primary"] = primary;
  if (secondary) style["--site-color-secondary"] = secondary;
  if (background) style["--site-color-background"] = background;

  return <div data-site-branding="" style={style} className="contents" />;
};
