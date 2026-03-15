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
    colors?: { primary?: string; secondary?: string; background?: string };
    headerHtml?: string;
  };
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
    return {
      site,
      hasSite: site != null,
      branding: {
        title: site?.branding?.title ?? undefined,
        logoUrl: getMediaUrl(site?.branding?.logo),
        logoDarkUrl: getMediaUrl(site?.branding?.logoDark),
        faviconUrl: getMediaUrl(site?.branding?.favicon),
        colors: site?.branding?.colors
          ? {
              primary: site.branding.colors.primary ?? undefined,
              secondary: site.branding.colors.secondary ?? undefined,
              background: site.branding.colors.background ?? undefined,
            }
          : undefined,
        headerHtml: site?.branding?.headerHtml ?? undefined,
      },
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
