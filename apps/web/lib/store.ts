/**
 * Global UI state management using Zustand.
 *
 * Manages non-URL state such as drawer visibility and transient map bounds.
 * For filter state (URL-synced via nuqs), see `lib/types/filter-state.ts`.
 *
 * @module
 */
import { create } from "zustand";
import { devtools } from "zustand/middleware";

import type { MapBounds } from "@/lib/geospatial/types";
import type { ClusterDensitySettings } from "@/lib/hooks/use-events-queries";

/** Cluster density preset or expert mode. */
export type ClusterDensityMode = "fine" | "normal" | "coarse" | "expert";

/** Preset values for cluster density. */
export const CLUSTER_DENSITY_PRESETS: Record<Exclude<ClusterDensityMode, "expert">, ClusterDensitySettings> = {
  fine: { clusterRadius: 20, clusterZoomFactor: 1.2 },
  normal: { clusterRadius: 30, clusterZoomFactor: 1.4 },
  coarse: { clusterRadius: 60, clusterZoomFactor: 1.6 },
};

// Define the shape of our UI state (non-URL state)
interface UIState {
  isFilterDrawerOpen: boolean;
  mapBounds: MapBounds | null;
  /**
   * Visible event count pushed from `useExplorerState` so the header can display it.
   *
   * Only `visibleEvents` is stored here (viewport-dependent). The header reads
   * `totalEvents` directly from React Query via `useEventsTotalQuery`.
   */
  mapStats: { visibleEvents: number } | null;
  clusterDensityMode: ClusterDensityMode;
  clusterDensity: ClusterDensitySettings;
}

// Define the shape of our UI-only store
interface UIStore {
  ui: UIState;

  // UI actions
  setFilterDrawerOpen: (isOpen: boolean) => void;
  toggleFilterDrawer: () => void;
  setMapBounds: (bounds: UIState["mapBounds"]) => void;
  setMapStats: (stats: UIState["mapStats"]) => void;
  setClusterDensityMode: (mode: ClusterDensityMode) => void;
  setClusterDensity: (density: ClusterDensitySettings) => void;
}

// Helper function to create UI state setters
const createUIStateSetter =
  <T>(set: (fn: (state: UIStore) => UIStore) => void, key: keyof UIState) =>
  (value: T) =>
    set((state: UIStore) => ({ ...state, ui: { ...state.ui, [key]: value } }));

export const useUIStore = create<UIStore>()(
  devtools((set) => ({
    // Initial state
    ui: {
      isFilterDrawerOpen: true,
      mapBounds: null,
      mapStats: null,
      clusterDensityMode: "normal",
      clusterDensity: CLUSTER_DENSITY_PRESETS.normal,
    },

    // UI actions
    setFilterDrawerOpen: createUIStateSetter(set, "isFilterDrawerOpen"),

    toggleFilterDrawer: () =>
      set((state) => ({ ...state, ui: { ...state.ui, isFilterDrawerOpen: !state.ui.isFilterDrawerOpen } })),

    setMapBounds: createUIStateSetter(set, "mapBounds"),
    setMapStats: createUIStateSetter(set, "mapStats"),

    setClusterDensityMode: (mode: ClusterDensityMode) =>
      set((state) => ({
        ...state,
        ui: {
          ...state.ui,
          clusterDensityMode: mode,
          ...(mode !== "expert" ? { clusterDensity: CLUSTER_DENSITY_PRESETS[mode] } : {}),
        },
      })),
    setClusterDensity: createUIStateSetter(set, "clusterDensity"),
  }))
);
