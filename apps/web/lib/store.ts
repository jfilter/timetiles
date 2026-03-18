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

// Define the shape of our UI state (non-URL state)
interface UIState {
  isFilterDrawerOpen: boolean;
  mapBounds: MapBounds | null;
  /**
   * Derived event counts pushed from `useExplorerState` so the header can display them.
   *
   * This lives in Zustand because the explore header (`app/_components/explore-header.tsx`)
   * is rendered in the root layout, while the explorer components that compute these stats
   * live in the explore page. They share no common ancestor in the component tree, so
   * Zustand bridges the layout boundary. See `use-explorer-state.ts` for the producer.
   */
  mapStats: { visibleEvents: number; totalEvents: number } | null;
}

// Define the shape of our UI-only store
interface UIStore {
  ui: UIState;

  // UI actions
  setFilterDrawerOpen: (isOpen: boolean) => void;
  toggleFilterDrawer: () => void;
  setMapBounds: (bounds: UIState["mapBounds"]) => void;
  setMapStats: (stats: UIState["mapStats"]) => void;
}

// Helper function to create UI state setters
const createUIStateSetter =
  <T>(set: (fn: (state: UIStore) => UIStore) => void, key: keyof UIState) =>
  (value: T) =>
    set((state: UIStore) => ({ ...state, ui: { ...state.ui, [key]: value } }));

export const useUIStore = create<UIStore>()(
  devtools((set) => ({
    // Initial state
    ui: { isFilterDrawerOpen: true, mapBounds: null, mapStats: null },

    // UI actions
    setFilterDrawerOpen: createUIStateSetter(set, "isFilterDrawerOpen"),

    toggleFilterDrawer: () =>
      set((state) => ({ ...state, ui: { ...state.ui, isFilterDrawerOpen: !state.ui.isFilterDrawerOpen } })),

    setMapBounds: createUIStateSetter(set, "mapBounds"),
    setMapStats: createUIStateSetter(set, "mapStats"),
  }))
);
