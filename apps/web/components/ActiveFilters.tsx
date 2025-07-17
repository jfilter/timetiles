"use client";

import { X } from "lucide-react";
import type { FilterLabels, FilterActions } from "../hooks/useFilterManager";

interface ActiveFiltersProps {
  labels: FilterLabels;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  actions: FilterActions;
}

export function ActiveFilters({
  labels,
  hasActiveFilters,
  activeFilterCount,
  actions,
}: ActiveFiltersProps) {
  if (!hasActiveFilters) {
    return null;
  }

  return (
    <div className="mb-4 rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Active Filters ({activeFilterCount})
        </h3>
        <button
          onClick={actions.clearAllFilters}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear all filters"
        >
          Clear all
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Catalog Filter */}
        {labels.catalog && (
          <FilterPill
            label="Catalog"
            value={labels.catalog}
            onRemove={() => actions.removeFilter("catalog")}
          />
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
        {labels.dateRange && (
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
}

interface FilterPillProps {
  label: string;
  value: string;
  onRemove: () => void;
}

function FilterPill({ label, value, onRemove }: FilterPillProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-sm shadow-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
      <button
        onClick={onRemove}
        className="ml-1 rounded p-0.5 hover:bg-muted transition-colors"
        aria-label={`Remove ${label}: ${value}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}