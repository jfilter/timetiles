"use client";

import { X } from "lucide-react";

import type { FilterState } from "../lib/store";

interface FilterLabels {
  catalog?: string;
  datasets: Array<{ id: string; name: string }>;
  dateRange?: string;
}

interface ActiveFiltersProps {
  labels: FilterLabels;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  actions: {
    removeFilter: (filterType: keyof FilterState, value?: string) => void;
    clearAllFilters: () => void;
  };
}

export const ActiveFilters = ({
  labels,
  hasActiveFilters,
  activeFilterCount,
  actions,
}: Readonly<ActiveFiltersProps>) => {
  if (!hasActiveFilters) {
    return null;
  }

  return (
    <div className="bg-muted/30 mb-4 rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-foreground text-sm font-medium">Active Filters ({activeFilterCount})</h3>
        <button
          onClick={actions.clearAllFilters}
          className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          aria-label="Clear all filters"
        >
          Clear all
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Catalog Filter */}
        {labels.catalog != null && (
          <FilterPill label="Catalog" value={labels.catalog} onRemove={() => actions.removeFilter("catalog")} />
        )}

        {/* Dataset Filters */}
        {labels.datasets.map((dataset) => (
          <FilterPill
            key={dataset.id}
            label="Dataset"
            value={dataset.name}
            onRemove={() => actions.removeFilter("datasets", dataset.id)}
          />
        ))}

        {/* Date Range Filter */}
        {labels.dateRange != null && (
          <FilterPill
            label="Date Range"
            value={labels.dateRange}
            onRemove={() => {
              // Remove both start and end dates when removing date range
              actions.removeFilter("startDate");
              actions.removeFilter("endDate");
            }}
          />
        )}
      </div>
    </div>
  );
};

interface FilterPillProps {
  label: string;
  value: string;
  onRemove: () => void;
}

const FilterPill = ({ label, value, onRemove }: Readonly<FilterPillProps>) => (
  <div className="bg-background inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm shadow-sm">
    <span className="text-muted-foreground">{label}:</span>
    <span className="font-medium">{value}</span>
    <button
      onClick={onRemove}
      className="hover:bg-muted ml-1 rounded p-0.5 transition-colors"
      aria-label={`Remove ${label}: ${value}`}
    >
      <X className="h-3 w-3" />
    </button>
  </div>
);
