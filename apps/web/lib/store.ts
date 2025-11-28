/**
 * This file defines the application's global state management using Zustand.
 *
 * It sets up a store for UI state that is not managed via URL query parameters, such as
 * the state of drawers, map bounds, and the currently selected theme. The store is configured
 * with middleware for developer tools (`devtools`) and local storage persistence (`persist`)
 * to improve the development experience and remember user preferences across sessions.
 *
 * Additionally, it includes helper functions for managing the filter state that *is*
 * stored in the URL, providing a centralized place for filter-related logic.
 *
 * @module
 */
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

// Define the shape of our UI state (non-URL state)
interface UIState {
  isFilterDrawerOpen: boolean;
  mapBounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null;
  mapStats: {
    visibleEvents: number;
    totalEvents: number;
  } | null;
  selectedEvent: string | null;
  theme: "light" | "dark" | "system";
}

// Define the shape of our UI-only store
interface UIStore {
  ui: UIState;

  // UI actions
  setFilterDrawerOpen: (isOpen: boolean) => void;
  toggleFilterDrawer: () => void;
  setMapBounds: (bounds: UIState["mapBounds"]) => void;
  setMapStats: (stats: UIState["mapStats"]) => void;
  setSelectedEvent: (eventId: string | null) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
}

// Helper function to create UI state setters
const createUIStateSetter =
  <T>(set: (fn: (state: UIStore) => UIStore) => void, key: keyof UIState) =>
  (value: T) =>
    set((state: UIStore) => ({
      ...state,
      ui: {
        ...state.ui,
        [key]: value,
      },
    }));

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        ui: {
          isFilterDrawerOpen: true,
          mapBounds: null,
          mapStats: null,
          selectedEvent: null,
          theme: "system",
        },

        // UI actions
        setFilterDrawerOpen: createUIStateSetter(set, "isFilterDrawerOpen"),

        toggleFilterDrawer: () =>
          set((state) => ({
            ...state,
            ui: {
              ...state.ui,
              isFilterDrawerOpen: !state.ui.isFilterDrawerOpen,
            },
          })),

        setMapBounds: createUIStateSetter(set, "mapBounds"),
        setMapStats: createUIStateSetter(set, "mapStats"),
        setSelectedEvent: createUIStateSetter(set, "selectedEvent"),
        setTheme: createUIStateSetter(set, "theme"),
      }),
      {
        name: "timetiles-ui-store",
        // Only persist UI state
        partialize: (state) => ({
          ui: {
            isFilterDrawerOpen: state.ui.isFilterDrawerOpen,
            theme: state.ui.theme,
          },
        }),
      }
    )
  )
);

// Export FilterState type for nuqs usage
export interface FilterState {
  catalog: string | null;
  datasets: string[];
  startDate: string | null;
  endDate: string | null;
  fieldFilters: Record<string, string[]>;
}

// Helper functions for filter operations (to be used with nuqs)
export const getActiveFilterCount = (filters: FilterState): number => {
  let count = 0;
  if (filters.catalog != null && filters.catalog !== "") count++;
  if (filters.datasets.length > 0) count += filters.datasets.length;
  if ((filters.startDate != null && filters.startDate !== "") || (filters.endDate != null && filters.endDate !== ""))
    count++; // Date range counts as one filter
  // Count total selected field filter values
  if (filters.fieldFilters) {
    count += Object.values(filters.fieldFilters).reduce((sum, vals) => sum + vals.length, 0);
  }
  return count;
};

export const hasActiveFilters = (filters: FilterState): boolean => {
  const hasFieldFilters = filters.fieldFilters && Object.values(filters.fieldFilters).some((vals) => vals.length > 0);
  return !!(
    (filters.catalog != null && filters.catalog !== "") ||
    filters.datasets.length > 0 ||
    (filters.startDate != null && filters.startDate !== "") ||
    (filters.endDate != null && filters.endDate !== "") ||
    hasFieldFilters
  );
};

// Helper function to remove a specific filter
/* eslint-disable sonarjs/cognitive-complexity -- Switch-case with nested conditions for each filter type */
export const removeFilter = (filters: FilterState, filterType: keyof FilterState, value?: string): FilterState => {
  const newFilters = { ...filters, fieldFilters: { ...filters.fieldFilters } };

  switch (filterType) {
    case "catalog":
      newFilters.catalog = null;
      // Also clear datasets and field filters when catalog is removed
      newFilters.datasets = [];
      newFilters.fieldFilters = {};
      break;
    case "datasets":
      if (value != null && value !== "") {
        newFilters.datasets = newFilters.datasets.filter((id) => id !== value);
      } else {
        newFilters.datasets = [];
      }
      // Clear field filters when datasets change
      newFilters.fieldFilters = {};
      break;
    case "startDate":
      newFilters.startDate = null;
      break;
    case "endDate":
      newFilters.endDate = null;
      break;
    case "fieldFilters":
      // value format: "fieldPath:filterValue" or just "fieldPath" to clear all values for that field
      if (value != null && value !== "") {
        if (value.includes(":")) {
          const [fieldPath, filterValue] = value.split(":");
          if (fieldPath && newFilters.fieldFilters[fieldPath]) {
            newFilters.fieldFilters[fieldPath] = newFilters.fieldFilters[fieldPath].filter((v) => v !== filterValue);
            if (newFilters.fieldFilters[fieldPath].length === 0) {
              delete newFilters.fieldFilters[fieldPath];
            }
          }
        } else {
          delete newFilters.fieldFilters[value];
        }
      } else {
        newFilters.fieldFilters = {};
      }
      break;
  }

  return newFilters;
};
/* eslint-enable sonarjs/cognitive-complexity */

// Helper function to clear all filters
export const clearAllFilters = (): FilterState => ({
  catalog: null,
  datasets: [],
  startDate: null,
  endDate: null,
  fieldFilters: {},
});
