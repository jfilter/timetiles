/**
 * View context for providing active View configuration to components.
 *
 * The View is resolved server-side and passed to this provider.
 * Components can use useView() to access view settings for:
 * - Data scope (catalogs/datasets to show)
 * - Filter configuration
 * - Map settings (bounds, zoom, style)
 *
 * Branding is on the Site, not the View. See site-context.tsx.
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
  dataScope: { mode: "all" | "catalogs" | "datasets"; catalogIds?: number[]; datasetIds?: number[] };

  /** Filter configuration from view */
  filterConfig: {
    mode: "auto" | "manual" | "disabled";
    maxFilters: number;
    fields?: NonNullable<View["filterConfig"]>["fields"];
    defaultFilters?: Record<string, string[]>;
  };

  /** Map settings from view */
  mapSettings: {
    defaultBounds?: { north: number; south: number; east: number; west: number };
    defaultZoom?: number;
    defaultCenter?: { latitude: number; longitude: number };
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
 * Provider component for View context.
 * Should wrap explorer pages where views are active.
 */
export const ViewProvider = ({ view, children }: ViewProviderProps): React.ReactElement => {
  // oxlint-disable-next-line complexity
  const value = useMemo((): ViewContextValue => {
    // Extract catalog/dataset IDs from relationships
    const catalogIds = view?.dataScope?.catalogs?.map((c) => (typeof c === "number" ? c : c.id));
    const datasetIds = view?.dataScope?.datasets?.map((d) => (typeof d === "number" ? d : d.id));

    const defaultFilters = view?.filterConfig?.defaultFilters
      ? (view.filterConfig.defaultFilters as Record<string, string[]>)
      : undefined;

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

      mapSettings: {
        defaultBounds: hasCompleteBounds
          ? { north: bounds.north!, south: bounds.south!, east: bounds.east!, west: bounds.west! }
          : undefined,
        defaultZoom: view?.mapSettings?.defaultZoom ?? undefined,
        defaultCenter: hasCompleteCenter ? { latitude: center.latitude!, longitude: center.longitude! } : undefined,
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
 */
export const useView = (): ViewContextValue => {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error("useView must be used within a ViewProvider");
  }
  return context;
};
