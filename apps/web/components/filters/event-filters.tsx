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
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

import { EMPTY_ARRAY } from "@/lib/constants/empty";
import { useDataSourceStatsQuery } from "@/lib/hooks/use-data-source-stats";
import { useDataSourcesQuery } from "@/lib/hooks/use-data-sources-query";
import { useDatasetEnumFieldsQuery } from "@/lib/hooks/use-dataset-enum-fields";
import { useFilters } from "@/lib/hooks/use-filters";
import { useUIStore } from "@/lib/store";
import { hasVisibleTemporalData } from "@/lib/utils/temporal-data";

import { CategoricalFilters } from "./categorical-filters";
import { DataSourceSelector } from "./data-source-selector";
import { FilterSection } from "./filter-section";
import { TimeRangeSlider } from "./time-range-slider";

export const EventFilters = () => {
  const t = useTranslations("Filters");
  const tExplore = useTranslations("Explore");
  const { filters, setStartDate, setEndDate, clearDateRange, clearAllFilters, hasActiveFilters, activeFilterCount } =
    useFilters();
  const mapBounds = useUIStore((state) => state.ui.mapBounds);

  // Fetch event counts for catalogs and datasets
  const { data: statsData, isError: isStatsError } = useDataSourceStatsQuery();
  const { data: dataSources } = useDataSourcesQuery();

  // Determine whether to show temporal filters based on visible datasets
  const showTemporalFilters = useMemo(
    () => hasVisibleTemporalData(dataSources?.datasets, filters),
    [dataSources?.datasets, filters]
  );

  // Clear date filters when temporal UI becomes hidden (e.g. user switches to non-temporal dataset)
  useEffect(() => {
    if (!showTemporalFilters && (filters.startDate != null || filters.endDate != null)) {
      clearDateRange();
    }
  }, [showTemporalFilters]); // eslint-disable-line react-hooks/exhaustive-deps -- only react to visibility change

  // Fetch enum fields for categorical filters (only when single dataset selected)
  const singleDatasetId = filters.datasets.length === 1 ? (filters.datasets[0] ?? null) : null;
  const { data: enumFields, isLoading: isEnumFieldsLoading } = useDatasetEnumFieldsQuery(singleDatasetId);
  const hasEnumFields = enumFields != null && enumFields.length > 0;

  // Calculate active filter counts per section
  const dataSourcesActiveCount = filters.datasets.length;
  const timeRangeActiveCount = filters.startDate != null || filters.endDate != null ? 1 : 0;

  return (
    <div>
      {/* Clear Filters Button - shown when filters are active */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAllFilters}
          className="hover:bg-muted mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm transition-colors hover:border-solid"
          aria-label={tExplore("clearFilters")}
        >
          <X className="h-4 w-4" />
          <span>{tExplore("clearFilters")}</span>
          <span className="bg-muted rounded-full px-1.5 py-0.5 text-xs font-medium">{activeFilterCount}</span>
        </button>
      )}

      {/* Datasets Section */}
      <FilterSection title={t("datasets")} defaultOpen activeCount={dataSourcesActiveCount}>
        {isStatsError && <p className="text-secondary mb-2 text-xs">{t("failedToLoadCounts")}</p>}
        <DataSourceSelector
          eventCountsByCatalog={statsData?.catalogCounts}
          eventCountsByDataset={statsData?.datasetCounts}
        />
      </FilterSection>

      {/* Categorical Filters Section - only shown when single dataset selected and has enum fields */}
      {filters.datasets.length === 1 && (hasEnumFields || isEnumFieldsLoading) && (
        <FilterSection
          title={t("categories")}
          defaultOpen
          activeCount={Object.values(filters.fieldFilters ?? {}).reduce((sum, vals) => sum + vals.length, 0)}
        >
          <CategoricalFilters enumFields={enumFields ?? EMPTY_ARRAY} isLoading={isEnumFieldsLoading} />
        </FilterSection>
      )}

      {/* Time Range Section — hidden when no visible datasets have temporal data */}
      {showTemporalFilters && (
        <FilterSection title={t("timeRange")} defaultOpen activeCount={timeRangeActiveCount}>
          <TimeRangeSlider
            filters={filters}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            bounds={mapBounds}
          />

          {(filters.startDate != null || filters.endDate != null) && (
            <button
              type="button"
              onClick={clearDateRange}
              className="text-muted-foreground hover:text-secondary dark:text-foreground/50 dark:hover:text-secondary mt-1 w-full text-center font-mono text-xs transition-colors"
            >
              {tExplore("clearDateFilters")}
            </button>
          )}
        </FilterSection>
      )}
    </div>
  );
};
