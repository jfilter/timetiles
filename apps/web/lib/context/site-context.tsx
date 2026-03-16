/**
 * Site context for providing active Site configuration to components.
 *
 * The Site is resolved server-side and passed to this provider.
 * Components can use useSite() to access site branding when a
 * custom site is active.
 *
 * @module
 * @category Context
 */
"use client";

import { createContext, useContext, useMemo } from "react";

import type { Site } from "@/payload-types";

/**
 * Extracts the URL from a media object or ID.
 */
const getMediaUrl = (media: unknown): string | undefined => {
  if (!media) return undefined;
  if (typeof media === "number") return undefined;
  if (typeof media === "object" && media != null && "url" in media) {
    return (media as { url?: string | null }).url ?? undefined;
  }
  return undefined;
};

/** Semantic color token overrides from site branding. */
export interface SiteBrandingColors {
  primary?: string;
  primaryForeground?: string;
  secondary?: string;
  secondaryForeground?: string;
  background?: string;
  foreground?: string;
  card?: string;
  cardForeground?: string;
  muted?: string;
  mutedForeground?: string;
  accent?: string;
  accentForeground?: string;
  destructive?: string;
  border?: string;
  ring?: string;
}

/** Custom code injection fields. */
export interface SiteCustomCode {
  headHtml?: string;
  customCSS?: string;
  bodyStartHtml?: string;
  bodyEndHtml?: string;
}

/** Typography settings from site branding. */
export interface SiteTypography {
  fontPairing?: "editorial" | "modern" | "monospace";
}

/** Visual style settings from site branding. */
export interface SiteStyle {
  borderRadius?: "sharp" | "rounded" | "pill";
  density?: "compact" | "default" | "comfortable";
}

/**
 * Context value containing the active site and branding.
 */
interface SiteContextValue {
  /** The active site configuration, or null if no site is active */
  site: Site | null;

  /** Whether a site is active */
  hasSite: boolean;

  /** Branding derived from site configuration */
  branding: {
    title?: string;
    logoUrl?: string;
    logoDarkUrl?: string;
    faviconUrl?: string;
    colors?: SiteBrandingColors;
    typography?: SiteTypography;
    style?: SiteStyle;
  };

  /** Custom code injection */
  customCode?: SiteCustomCode;
}

const SiteContext = createContext<SiteContextValue | null>(null);

/**
 * Props for the SiteProvider component.
 */
interface SiteProviderProps {
  /** The resolved site from server-side */
  site: Site | null;
  /** Child components */
  children: React.ReactNode;
}

/**
 * Provider component for Site context.
 * Should be placed in the frontend layout.
 */
export const SiteProvider = ({ site, children }: SiteProviderProps): React.ReactElement => {
  const value = useMemo((): SiteContextValue => {
    const colors = site?.branding?.colors;
    const hasColors = colors && Object.values(colors).some((v) => v != null && v !== "");

    return {
      site,
      hasSite: site != null,
      branding: {
        title: site?.branding?.title ?? undefined,
        logoUrl: getMediaUrl(site?.branding?.logo),
        logoDarkUrl: getMediaUrl(site?.branding?.logoDark),
        faviconUrl: getMediaUrl(site?.branding?.favicon),
        colors: hasColors
          ? {
              primary: colors.primary ?? undefined,
              primaryForeground: colors.primaryForeground ?? undefined,
              secondary: colors.secondary ?? undefined,
              secondaryForeground: colors.secondaryForeground ?? undefined,
              background: colors.background ?? undefined,
              foreground: colors.foreground ?? undefined,
              card: colors.card ?? undefined,
              cardForeground: colors.cardForeground ?? undefined,
              muted: colors.muted ?? undefined,
              mutedForeground: colors.mutedForeground ?? undefined,
              accent: colors.accent ?? undefined,
              accentForeground: colors.accentForeground ?? undefined,
              destructive: colors.destructive ?? undefined,
              border: colors.border ?? undefined,
              ring: colors.ring ?? undefined,
            }
          : undefined,
        typography: site?.branding?.typography?.fontPairing
          ? { fontPairing: site.branding.typography.fontPairing as SiteTypography["fontPairing"] }
          : undefined,
        style: {
          borderRadius: (site?.branding?.style?.borderRadius as SiteStyle["borderRadius"]) ?? undefined,
          density: (site?.branding?.style?.density as SiteStyle["density"]) ?? undefined,
        },
      },
      customCode: site?.customCode
        ? {
            headHtml: site.customCode.headHtml ?? undefined,
            customCSS: site.customCode.customCSS ?? undefined,
            bodyStartHtml: site.customCode.bodyStartHtml ?? undefined,
            bodyEndHtml: site.customCode.bodyEndHtml ?? undefined,
          }
        : undefined,
    };
  }, [site]);

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
};

/**
 * Hook to access the current site context.
 * Must be used within a SiteProvider.
 *
 * @throws Error if used outside of SiteProvider
 */
export const useSite = (): SiteContextValue => {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error("useSite must be used within a SiteProvider");
  }
  return context;
};
