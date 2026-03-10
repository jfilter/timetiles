/**
 * View context for providing active View configuration to components.
 *
 * The View is resolved server-side and passed to this provider.
 * Components can use useView() to access view settings for:
 * - Data scope (catalogs/datasets to show)
 * - Filter configuration
 * - Branding (logo, colors, title)
 * - Map settings (bounds, zoom, style)
 *
 * @module
 * @category Context
 */
"use client";

import { createContext, useContext, useMemo } from "react";

import type { View } from "@/payload-types";

/**
 * Context value containing the active view and helper functions.
 */
interface ViewContextValue {
  /** The active view configuration, or null if no view is active */
  view: View | null;

  /** Whether a view is active */
  hasView: boolean;

  /** Data scope filter derived from view configuration */
  dataScope: {
    mode: "all" | "catalogs" | "datasets";
    catalogIds?: number[];
    datasetIds?: number[];
  };

  /** Filter configuration from view */
  filterConfig: {
    mode: "auto" | "manual" | "disabled";
    maxFilters: number;
    fields?: NonNullable<View["filterConfig"]>["fields"];
    defaultFilters?: Record<string, string[]>;
  };

  /** Branding configuration from view */
  branding: {
    domain?: string;
    title?: string;
    logoUrl?: string;
    faviconUrl?: string;
    colors?: {
      primary?: string;
      secondary?: string;
      background?: string;
    };
    headerHtml?: string;
  };

  /** Map settings from view */
  mapSettings: {
    defaultBounds?: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
    defaultZoom?: number;
    defaultCenter?: {
      latitude: number;
      longitude: number;
    };
    baseMapStyle: "default" | "light" | "dark" | "satellite";
    customStyleUrl?: string;
  };
}

const ViewContext = createContext<ViewContextValue | null>(null);

/**
 * Props for the ViewProvider component.
 */
interface ViewProviderProps {
  /** The resolved view from server-side */
  view: View | null;
  /** Child components */
  children: React.ReactNode;
}

/**
 * Extracts the URL from a media object or ID.
 */
const getMediaUrl = (media: NonNullable<View["branding"]>["logo"]): string | undefined => {
  if (!media) return undefined;
  if (typeof media === "number") return undefined;
  return media.url ?? undefined;
};

/**
 * Provider component for View context.
 * Should be placed high in the component tree, typically in the root layout.
 *
 * @example
 * ```tsx
 * // In app/layout.tsx or a layout component
 * const view = await resolveView(payload, { host, pathname });
 *
 * return (
 *   <ViewProvider view={view}>
 *     {children}
 *   </ViewProvider>
 * );
 * ```
 */
export const ViewProvider = ({ view, children }: ViewProviderProps): React.ReactElement => {
  const value = useMemo((): ViewContextValue => {
    // Extract catalog/dataset IDs from relationships
    const catalogIds = view?.dataScope?.catalogs?.map((c) => (typeof c === "number" ? c : c.id));
    const datasetIds = view?.dataScope?.datasets?.map((d) => (typeof d === "number" ? d : d.id));

    // Parse defaultFilters from JSON
    let defaultFilters: Record<string, string[]> | undefined;
    if (view?.filterConfig?.defaultFilters) {
      try {
        defaultFilters = view.filterConfig.defaultFilters as Record<string, string[]>;
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Check if bounds are complete
    const bounds = view?.mapSettings?.defaultBounds;
    const hasCompleteBounds =
      bounds?.north != null && bounds?.south != null && bounds?.east != null && bounds?.west != null;

    // Check if center is complete
    const center = view?.mapSettings?.defaultCenter;
    const hasCompleteCenter = center?.latitude != null && center?.longitude != null;

    return {
      view,
      hasView: view != null,

      dataScope: {
        mode: view?.dataScope?.mode ?? "all",
        catalogIds: catalogIds?.length ? catalogIds : undefined,
        datasetIds: datasetIds?.length ? datasetIds : undefined,
      },

      filterConfig: {
        mode: view?.filterConfig?.mode ?? "auto",
        maxFilters: view?.filterConfig?.maxFilters ?? 5,
        fields: view?.filterConfig?.fields ?? undefined,
        defaultFilters,
      },

      branding: {
        domain: view?.branding?.domain ?? undefined,
        title: view?.branding?.title ?? undefined,
        logoUrl: getMediaUrl(view?.branding?.logo),
        faviconUrl: getMediaUrl(view?.branding?.favicon),
        colors: view?.branding?.colors
          ? {
              primary: view.branding.colors.primary ?? undefined,
              secondary: view.branding.colors.secondary ?? undefined,
              background: view.branding.colors.background ?? undefined,
            }
          : undefined,
        headerHtml: view?.branding?.headerHtml ?? undefined,
      },

      mapSettings: {
        defaultBounds: hasCompleteBounds
          ? {
              north: bounds.north!,
              south: bounds.south!,
              east: bounds.east!,
              west: bounds.west!,
            }
          : undefined,
        defaultZoom: view?.mapSettings?.defaultZoom ?? undefined,
        defaultCenter: hasCompleteCenter
          ? {
              latitude: center.latitude!,
              longitude: center.longitude!,
            }
          : undefined,
        baseMapStyle: view?.mapSettings?.baseMapStyle ?? "default",
        customStyleUrl: view?.mapSettings?.customStyleUrl ?? undefined,
      },
    };
  }, [view]);

  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
};

/**
 * Hook to access the current view context.
 * Must be used within a ViewProvider.
 *
 * @returns The view context value
 * @throws Error if used outside of ViewProvider
 *
 * @example
 * ```tsx
 * const { view, branding, mapSettings } = useView();
 *
 * // Apply branding
 * document.title = branding.title ?? 'TimeTiles';
 *
 * // Use map settings
 * map.setZoom(mapSettings.defaultZoom ?? 10);
 * ```
 */
export const useView = (): ViewContextValue => {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error("useView must be used within a ViewProvider");
  }
  return context;
};

/**
 * Hook to optionally access the current view context.
 * Returns null if used outside of ViewProvider.
 *
 * @returns The view context value or null
 *
 * @example
 * ```tsx
 * const viewContext = useViewOptional();
 *
 * // Safe to use without provider
 * const title = viewContext?.branding.title ?? 'TimeTiles';
 * ```
 */
export const useViewOptional = (): ViewContextValue | null => {
  return useContext(ViewContext);
};
