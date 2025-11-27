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

import { useCallback } from "react";

import { useFilters } from "@/lib/filters";
import { useDataSourceStatsQuery } from "@/lib/hooks/use-data-source-stats";

import { DataSourceSelector } from "./data-source-selector";
import { FilterSection } from "./filter-section";
import { TimeRangeSlider } from "./time-range-slider";

export const EventFilters = () => {
  const { filters, setStartDate, setEndDate } = useFilters();

  // Fetch event counts for catalogs and datasets
  const { data: statsData } = useDataSourceStatsQuery();

  const handleClearDateFilters = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
  }, [setStartDate, setEndDate]);

  // Calculate active filter counts per section
  const dataSourcesActiveCount = (filters.catalog != null ? 1 : 0) + filters.datasets.length;
  const timeRangeActiveCount = filters.startDate != null || filters.endDate != null ? 1 : 0;

  return (
    <div>
      {/* Data Sources Section */}
      <FilterSection title="Data Sources" defaultOpen activeCount={dataSourcesActiveCount}>
        <DataSourceSelector
          eventCountsByCatalog={statsData?.catalogCounts}
          eventCountsByDataset={statsData?.datasetCounts}
        />
      </FilterSection>

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
