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
  setSelectedEvent: (eventId: string | null) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
}

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        ui: {
          isFilterDrawerOpen: true,
          mapBounds: null,
          selectedEvent: null,
          theme: "system",
        },

        // UI actions
        setFilterDrawerOpen: (isOpen) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                isFilterDrawerOpen: isOpen,
              },
            }),
            false,
            "setFilterDrawerOpen",
          ),

        toggleFilterDrawer: () =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                isFilterDrawerOpen: !state.ui.isFilterDrawerOpen,
              },
            }),
            false,
            "toggleFilterDrawer",
          ),

        setMapBounds: (bounds) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                mapBounds: bounds,
              },
            }),
            false,
            "setMapBounds",
          ),

        setSelectedEvent: (eventId) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                selectedEvent: eventId,
              },
            }),
            false,
            "setSelectedEvent",
          ),

        setTheme: (theme) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                theme,
              },
            }),
            false,
            "setTheme",
          ),
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
      },
    ),
  ),
);

// Export FilterState type for nuqs usage
export interface FilterState {
  catalog: string | null;
  datasets: string[];
  startDate: string | null;
  endDate: string | null;
}

// Helper functions for filter operations (to be used with nuqs)
export const getActiveFilterCount = (filters: FilterState): number => {
  let count = 0;
  if (filters.catalog !== null && filters.catalog !== "") count++;
  if (filters.datasets.length > 0) count += filters.datasets.length;
  if (
    (filters.startDate !== null && filters.startDate !== "") ||
    (filters.endDate !== null && filters.endDate !== "")
  )
    count++; // Date range counts as one filter
  return count;
};

export const hasActiveFilters = (filters: FilterState): boolean => {
  return !!(
    (filters.catalog !== null && filters.catalog !== "") ||
    filters.datasets.length > 0 ||
    (filters.startDate !== null && filters.startDate !== "") ||
    (filters.endDate !== null && filters.endDate !== "")
  );
};

// Helper function to remove a specific filter
export const removeFilter = (
  filters: FilterState,
  filterType: keyof FilterState,
  value?: string,
): FilterState => {
  const newFilters = { ...filters };

  switch (filterType) {
    case "catalog":
      newFilters.catalog = null;
      // Also clear datasets when catalog is removed
      newFilters.datasets = [];
      break;
    case "datasets":
      if (value !== null && value !== undefined && value !== "") {
        newFilters.datasets = newFilters.datasets.filter((id) => id !== value);
      } else {
        newFilters.datasets = [];
      }
      break;
    case "startDate":
      newFilters.startDate = null;
      break;
    case "endDate":
      newFilters.endDate = null;
      break;
  }

  return newFilters;
};

// Helper function to clear all filters
export const clearAllFilters = (): FilterState => ({
  catalog: null,
  datasets: [],
  startDate: null,
  endDate: null,
});
