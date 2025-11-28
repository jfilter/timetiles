/**
 * Filter controls for event exploration.
 *
 * Provides UI controls for filtering events by date range, catalog,
 * dataset, and other criteria. Organizes filters into collapsible
 * sections for better organization. Manages filter state via URL
 * parameters for shareable filter states.
 *
 * @module
 * @category Components
 */
"use client";

import { X } from "lucide-react";
import { useCallback } from "react";

import { useFilters } from "@/lib/filters";
import { useDatasetEnumFieldsQuery } from "@/lib/hooks/use-dataset-enum-fields";
import { useDataSourceStatsQuery } from "@/lib/hooks/use-data-source-stats";

import { CategoricalFilters } from "./categorical-filters";
import { DataSourceSelector } from "./data-source-selector";
import { FilterSection } from "./filter-section";
import { TimeRangeSlider } from "./time-range-slider";

export const EventFilters = () => {
  const { filters, setStartDate, setEndDate, clearAllFilters, hasActiveFilters, activeFilterCount } = useFilters();

  // Fetch event counts for catalogs and datasets
  const { data: statsData } = useDataSourceStatsQuery();

  // Fetch enum fields for categorical filters (only when single dataset selected)
  const singleDatasetId = filters.datasets.length === 1 ? (filters.datasets[0] ?? null) : null;
  const { data: enumFields } = useDatasetEnumFieldsQuery(singleDatasetId);
  const hasEnumFields = enumFields != null && enumFields.length > 0;

  const handleClearDateFilters = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
  }, [setStartDate, setEndDate]);

  // Calculate active filter counts per section
  const dataSourcesActiveCount = (filters.catalog != null ? 1 : 0) + filters.datasets.length;
  const timeRangeActiveCount = filters.startDate != null || filters.endDate != null ? 1 : 0;

  return (
    <div>
      {/* Clear Filters Button - shown when filters are active */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAllFilters}
          className="hover:bg-muted mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm transition-colors hover:border-solid"
          aria-label="Clear all filters"
        >
          <X className="h-4 w-4" />
          <span>Clear Filters</span>
          <span className="bg-muted rounded-full px-1.5 py-0.5 text-xs font-medium">{activeFilterCount}</span>
        </button>
      )}

      {/* Data Sources Section */}
      <FilterSection title="Data Sources" defaultOpen activeCount={dataSourcesActiveCount}>
        <DataSourceSelector
          eventCountsByCatalog={statsData?.catalogCounts}
          eventCountsByDataset={statsData?.datasetCounts}
        />
      </FilterSection>

      {/* Categorical Filters Section - only shown when single dataset selected and has enum fields */}
      {filters.datasets.length === 1 && hasEnumFields && (
        <FilterSection
          title="Categories"
          defaultOpen
          activeCount={Object.values(filters.fieldFilters ?? {}).reduce((sum, vals) => sum + vals.length, 0)}
        >
          <CategoricalFilters />
        </FilterSection>
      )}

      {/* Time Range Section */}
      <FilterSection title="Time Range" defaultOpen activeCount={timeRangeActiveCount}>
        <TimeRangeSlider
          startDate={filters.startDate}
          endDate={filters.endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />

        {(filters.startDate != null || filters.endDate != null) && (
          <button
            type="button"
            onClick={handleClearDateFilters}
            className="text-cartographic-navy/50 hover:text-cartographic-terracotta dark:text-cartographic-charcoal/50 dark:hover:text-cartographic-terracotta mt-1 w-full text-center font-mono text-xs transition-colors"
          >
            ✕ Clear date filters
          </button>
        )}
      </FilterSection>
    </div>
  );
};
