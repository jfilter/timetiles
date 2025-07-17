"use client";

import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import type { Catalog, Dataset } from "../payload-types";

export interface FilterState {
  catalog?: string | null;
  datasets: string[];
  startDate?: string | null;
  endDate?: string | null;
}

export interface FilterLabels {
  catalog?: string;
  datasets: Array<{ id: string; name: string }>;
  dateRange?: string;
}

export interface FilterActions {
  setCatalog: (value: string | null) => void;
  setDatasets: (value: string[]) => void;
  setStartDate: (value: string | null) => void;
  setEndDate: (value: string | null) => void;
  removeFilter: (filterType: keyof FilterState, value?: string) => void;
  clearAllFilters: () => void;
}

export function useFilterManager(catalogs: Catalog[], datasets: Dataset[]) {
  const [filters, setFilters] = useQueryStates({
    catalog: parseAsString,
    datasets: parseAsArrayOf(parseAsString).withDefault([]),
    startDate: parseAsString,
    endDate: parseAsString,
  });

  // Helper function to get catalog name by ID
  const getCatalogName = (catalogId: string): string => {
    const catalog = catalogs.find((c) => String(c.id) === catalogId);
    return catalog?.name || "Unknown Catalog";
  };

  // Helper function to get dataset name by ID
  const getDatasetName = (datasetId: string): string => {
    const dataset = datasets.find((d) => String(d.id) === datasetId);
    return dataset?.name || "Unknown Dataset";
  };

  // Get human-readable filter labels
  const getFilterLabels = (): FilterLabels => {
    const labels: FilterLabels = {
      datasets: [],
    };

    if (filters.catalog) {
      labels.catalog = getCatalogName(filters.catalog);
    }

    if (filters.datasets.length > 0) {
      labels.datasets = filters.datasets.map((id) => ({
        id,
        name: getDatasetName(id),
      }));
    }

    if (filters.startDate || filters.endDate) {
      const start = filters.startDate ? new Date(filters.startDate).toLocaleDateString() : "Start";
      const end = filters.endDate ? new Date(filters.endDate).toLocaleDateString() : "End";
      
      if (filters.startDate && filters.endDate) {
        labels.dateRange = `${start} - ${end}`;
      } else if (filters.startDate) {
        labels.dateRange = `From ${start}`;
      } else if (filters.endDate) {
        labels.dateRange = `Until ${end}`;
      }
    }

    return labels;
  };

  // Check if any filters are active
  const hasActiveFilters = (): boolean => {
    return !!(
      filters.catalog ||
      filters.datasets.length > 0 ||
      filters.startDate ||
      filters.endDate
    );
  };

  // Get count of active filters
  const getActiveFilterCount = (): number => {
    let count = 0;
    if (filters.catalog) count++;
    if (filters.datasets.length > 0) count += filters.datasets.length;
    if (filters.startDate || filters.endDate) count++; // Date range counts as one filter
    return count;
  };

  // Remove a specific filter
  const removeFilter = (filterType: keyof FilterState, value?: string) => {
    switch (filterType) {
      case "catalog":
        setFilters({ catalog: null, datasets: [] }); // Clear datasets when catalog is removed
        break;
      case "datasets":
        if (value) {
          const newDatasets = filters.datasets.filter((id) => id !== value);
          setFilters({ datasets: newDatasets });
        } else {
          setFilters({ datasets: [] });
        }
        break;
      case "startDate":
        setFilters({ startDate: null });
        break;
      case "endDate":
        setFilters({ endDate: null });
        break;
    }
  };

  // Clear all filters
  const clearAllFilters = () => {
    setFilters({
      catalog: null,
      datasets: [],
      startDate: null,
      endDate: null,
    });
  };

  // Individual setter functions for compatibility with existing EventFilters
  const setCatalog = (value: string | null) => {
    if (value === "all" || !value) {
      setFilters({ catalog: null, datasets: [] });
    } else {
      setFilters({ catalog: value, datasets: [] });
    }
  };

  const setDatasets = (value: string[]) => {
    setFilters({ datasets: value });
  };

  const setStartDate = (value: string | null) => {
    setFilters({ startDate: value });
  };

  const setEndDate = (value: string | null) => {
    setFilters({ endDate: value });
  };

  const actions: FilterActions = {
    setCatalog,
    setDatasets,
    setStartDate,
    setEndDate,
    removeFilter,
    clearAllFilters,
  };

  return {
    filters,
    labels: getFilterLabels(),
    hasActiveFilters: hasActiveFilters(),
    activeFilterCount: getActiveFilterCount(),
    actions,
  };
}