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
import { useDatasetNumericFieldsQuery } from "@/lib/hooks/use-dataset-numeric-fields";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useFilters } from "@/lib/hooks/use-filters";
import { useUIStore } from "@/lib/store";
import { hasVisibleTemporalData } from "@/lib/utils/temporal-data";

import { CategoricalFilters } from "./categorical-filters";
import { DataSourceSelector } from "./data-source-selector";
import { FilterSection } from "./filter-section";
import { NumericRangeFilters } from "./numeric-range-filters";
import { TimeRangeSlider } from "./time-range-slider";

interface SimpleBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Categorical + numeric range filter sections for a single selected dataset.
 *
 * Both are dataset-specific (enum values / number formats), so this whole block
 * only renders when exactly one dataset is selected. Extracted from
 * {@link EventFilters} to keep that component within the complexity budget and to
 * co-locate the two per-dataset SQL-aggregation fetches.
 */
const DatasetFieldFilters = ({
  singleDatasetId,
  bounds,
}: {
  singleDatasetId: string | null;
  bounds: SimpleBounds | null;
}) => {
  const t = useTranslations("Filters");
  const { filters } = useFilters();

  // Pass current filters + bounds so values/bounds reflect the visible subset.
  const { data: enumFields, isLoading: isEnumFieldsLoading } = useDatasetEnumFieldsQuery(
    singleDatasetId,
    filters,
    bounds
  );
  const { data: numericFields, isLoading: isNumericFieldsLoading } = useDatasetNumericFieldsQuery(
    singleDatasetId,
    filters,
    bounds
  );

  const hasEnumFields = enumFields != null && enumFields.length > 0;
  const hasNumericFields = numericFields != null && numericFields.length > 0;

  const categoricalActiveCount = Object.values(filters.fieldFilters ?? {}).reduce((sum, vals) => sum + vals.length, 0);
  const numericRangeActiveCount = Object.values(filters.rangeFilters ?? {}).filter(
    (r) => r.min != null || r.max != null
  ).length;

  return (
    <>
      {(hasEnumFields || isEnumFieldsLoading) && (
        <FilterSection title={t("categories")} defaultOpen activeCount={categoricalActiveCount}>
          <CategoricalFilters enumFields={enumFields ?? EMPTY_ARRAY} isLoading={isEnumFieldsLoading} />
        </FilterSection>
      )}

      {(hasNumericFields || isNumericFieldsLoading) && (
        <FilterSection title={t("numericRanges")} defaultOpen activeCount={numericRangeActiveCount}>
          <NumericRangeFilters numericFields={numericFields ?? EMPTY_ARRAY} isLoading={isNumericFieldsLoading} />
        </FilterSection>
      )}
    </>
  );
};

export const EventFilters = () => {
  const t = useTranslations("Filters");
  const tExplore = useTranslations("Explore");
  const { filters, setStartDate, setEndDate, clearDateRange, clearAllFilters, hasActiveFilters, activeFilterCount } =
    useFilters();
  const mapBounds = useUIStore((state) => state.ui.mapBounds);
  // Debounce bounds before using them as a query key — /enum-stats is a SQL
  // aggregation endpoint, so refetching on every pan tick is wasteful.
  // 300ms matches `use-explorer-viewport.ts`.
  const debouncedMapBounds = useDebounce(mapBounds, 300);

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

  // Categorical + numeric range filters are dataset-specific (enum values /
  // number formats), so they only render when exactly one dataset is selected.
  const singleDatasetId = filters.datasets.length === 1 ? (filters.datasets[0] ?? null) : null;

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

      {/* Categorical + numeric range sections — only when a single dataset is selected */}
      {singleDatasetId != null && <DatasetFieldFilters singleDatasetId={singleDatasetId} bounds={debouncedMapBounds} />}

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
