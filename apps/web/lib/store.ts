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

/** Clustering algorithm. */
export type ClusterAlgorithm = "h3" | "grid-k" | "dbscan";

/** How clusters are rendered on the map. */
export type ClusterDisplay = "circles" | "hexagons";

/** Cluster density preset or expert mode. */
export type ClusterDensityMode = "fine" | "normal" | "coarse" | "expert";

/** Preset values for cluster resolution (target number of clusters). */
export const CLUSTER_DENSITY_PRESETS: Record<Exclude<ClusterDensityMode, "expert">, ClusterDensitySettings> = {
  fine: { targetClusters: 50 },
  normal: { targetClusters: 25 },
  coarse: { targetClusters: 10 },
};

/** Default clustering algorithm (H3). */
const DEFAULT_CLUSTER_ALGORITHM: ClusterAlgorithm = "h3";

/**
 * Initial cluster density settings used on store construction and whenever
 * the density mode is reset. Single source of truth — `clusterAlgorithm` and
 * `mergeOverlapping` only live inside `clusterDensity` (they are part of the
 * `ClusterDensitySettings` contract sent to the clusters API).
 */
const INITIAL_CLUSTER_DENSITY: ClusterDensitySettings = {
  ...CLUSTER_DENSITY_PRESETS.normal,
  clusterAlgorithm: DEFAULT_CLUSTER_ALGORITHM,
  mergeOverlapping: false,
  useHexCenter: true,
};

/** Cluster currently selected in focus mode. */
export interface FocusedCluster {
  clusterId: string;
  center: [number, number];
  count: number;
  sourceCells: string[] | null;
  h3Resolution: number;
}

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
  /**
   * Cluster density settings sent to the clusters API. Owns `clusterAlgorithm`
   * and `mergeOverlapping` — do not mirror them as top-level fields.
   */
  clusterDensity: ClusterDensitySettings;
  showHexBoundaries: boolean;
  clusterDisplay: ClusterDisplay;
  /** H3 cells used to filter all queries to a specific cluster's events. */
  clusterFilterCells: string[] | null;
  /** Cluster currently selected in focus mode — transient, not persisted to URL. */
  focusedCluster: FocusedCluster | null;
}

// Define the shape of our UI-only store
interface UIStore {
  ui: UIState;

  // UI actions
  setFilterDrawerOpen: (isOpen: boolean) => void;
  toggleFilterDrawer: () => void;
  setMapBounds: (bounds: UIState["mapBounds"]) => void;
  setMapStats: (stats: UIState["mapStats"]) => void;
  setShowHexBoundaries: (show: boolean) => void;
  setClusterDisplay: (display: ClusterDisplay) => void;
  setClusterAlgorithm: (algorithm: ClusterAlgorithm) => void;
  setClusterDensityMode: (mode: ClusterDensityMode) => void;
  setClusterDensity: (density: ClusterDensitySettings) => void;
  setFocusedCluster: (cluster: UIState["focusedCluster"]) => void;
  clearFocusedCluster: () => void;
  setClusterFilterCells: (cells: string[] | null) => void;
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
      showHexBoundaries: false,
      clusterDisplay: "circles",
      clusterFilterCells: null,
      focusedCluster: null,
      clusterDensityMode: "normal",
      clusterDensity: INITIAL_CLUSTER_DENSITY,
    },

    // UI actions
    setFilterDrawerOpen: createUIStateSetter(set, "isFilterDrawerOpen"),

    toggleFilterDrawer: () =>
      set((state) => ({ ...state, ui: { ...state.ui, isFilterDrawerOpen: !state.ui.isFilterDrawerOpen } })),

    setMapBounds: createUIStateSetter(set, "mapBounds"),
    setMapStats: createUIStateSetter(set, "mapStats"),

    setShowHexBoundaries: createUIStateSetter(set, "showHexBoundaries"),
    setClusterDisplay: (display: ClusterDisplay) =>
      set((state) => ({
        ...state,
        ui: {
          ...state.ui,
          clusterDisplay: display,
          // Hexagon view requires no merge — clear flag inside cluster density settings
          ...(display === "hexagons"
            ? { clusterDensity: { ...state.ui.clusterDensity, mergeOverlapping: false } }
            : {}),
        },
      })),
    setClusterAlgorithm: (algorithm: ClusterAlgorithm) =>
      set((state) => ({
        ...state,
        ui: { ...state.ui, clusterDensity: { ...state.ui.clusterDensity, clusterAlgorithm: algorithm } },
      })),
    setClusterDensityMode: (mode: ClusterDensityMode) =>
      set((state) => ({
        ...state,
        ui: {
          ...state.ui,
          clusterDensityMode: mode,
          ...(mode !== "expert"
            ? {
                clusterDensity: {
                  ...CLUSTER_DENSITY_PRESETS[mode],
                  clusterAlgorithm: state.ui.clusterDensity.clusterAlgorithm ?? DEFAULT_CLUSTER_ALGORITHM,
                },
              }
            : {}),
        },
      })),
    setClusterDensity: createUIStateSetter(set, "clusterDensity"),
    setFocusedCluster: createUIStateSetter(set, "focusedCluster"),
    clearFocusedCluster: () => set((state) => ({ ...state, ui: { ...state.ui, focusedCluster: null } })),
    setClusterFilterCells: createUIStateSetter(set, "clusterFilterCells"),
  }))
);
