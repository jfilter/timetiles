/**
 * Data source selector component for catalog and dataset filtering.
 *
 * Provides a visual interface for selecting catalogs and datasets with
 * prominent catalog cards and toggleable dataset chips. Selecting a catalog
 * automatically activates all its datasets, with opt-out capability.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { getDatasetColors } from "@/lib/constants/dataset-colors";
import { useView } from "@/lib/context/view-context";
import { useAuthState } from "@/lib/hooks/use-auth-queries";
import {
  type DataSourceCatalog,
  type DataSourceDataset,
  useDataSourcesQuery,
} from "@/lib/hooks/use-data-sources-query";
import { useFilters } from "@/lib/hooks/use-filters";

import {
  CATALOG_COLLAPSE_THRESHOLD,
  CATALOG_VISIBLE_WHEN_COLLAPSED,
  countDatasetsByCatalog,
  DATASET_COLLAPSE_THRESHOLD,
  filterAndSortDatasets,
  formatCount,
  groupCatalogs,
} from "./data-source-selector-helpers";

interface DataSourceSelectorProps {
  /** Event counts by catalog ID - shows total events per catalog */
  eventCountsByCatalog?: Record<string, number>;
  /** Event counts by dataset ID - shows total events per dataset */
  eventCountsByDataset?: Record<string, number>;
}

/**
 * Catalog card component showing catalog name, dataset count, and event count.
 */
interface CatalogCardProps {
  catalog: DataSourceCatalog;
  isSelected: boolean;
  datasetCount: number;
  eventCount?: number;
  onSelect: (catalogId: string) => void;
}

const CatalogCard = ({ catalog, isSelected, datasetCount, eventCount, onSelect }: CatalogCardProps) => {
  const t = useTranslations("Filters");
  const handleClick = () => {
    onSelect(String(catalog.id));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={t(isSelected ? "deselectCatalog" : "selectCatalog", { name: catalog.name })}
      className={cn(
        "relative w-full break-inside-avoid rounded-sm border p-2 text-left transition-all",
        "hover:bg-card/50 dark:hover:bg-white/10",
        isSelected
          ? "border-secondary bg-card/30 dark:bg-white/15"
          : "border-primary/20 bg-transparent dark:border-white/30"
      )}
    >
      {/* Checkmark for selected state */}
      {isSelected && (
        <div className="bg-secondary absolute top-1 right-1 rounded-full p-0.5">
          <Check className="h-2.5 w-2.5 text-white" />
        </div>
      )}

      {/* Catalog name - allow 2 lines with truncation */}
      <div
        className={cn(
          "line-clamp-2 pr-5 font-serif text-xs leading-tight font-medium",
          isSelected ? "text-foreground dark:text-white" : "text-muted-foreground"
        )}
      >
        {catalog.name}
      </div>

      {/* Stats - stacked vertically */}
      <div className="text-muted-foreground mt-1 space-y-0.5 font-mono text-[10px]">
        <div>{t("datasetCount", { count: datasetCount })}</div>
        {eventCount != null && <div>{t("eventCount", { count: formatCount(eventCount) })}</div>}
      </div>
    </button>
  );
};

/**
 * Dataset chip component for toggling individual datasets.
 */
interface DatasetChipProps {
  dataset: DataSourceDataset;
  isActive: boolean;
  eventCount?: number;
  onToggle: (datasetId: string) => void;
}

const DatasetChip = ({ dataset, isActive, eventCount, onToggle }: DatasetChipProps) => {
  const t = useTranslations("Filters");
  const handleClick = () => {
    onToggle(String(dataset.id));
  };

  const colors = getDatasetColors(dataset.id);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={t(isActive ? "disableDataset" : "enableDataset", { name: dataset.name })}
      className={cn(
        "rounded-sm border px-2 py-1 text-left transition-all",
        isActive
          ? cn(colors.border, colors.bg, "text-foreground dark:text-foreground")
          : "border-primary/20 text-muted-foreground decoration-primary/30 line-through"
      )}
    >
      <span className="text-xs">{dataset.name}</span>
      {eventCount != null && (
        <span className="text-primary/40 ml-1 font-mono text-[10px]">{formatCount(eventCount)}</span>
      )}
    </button>
  );
};

/** Reusable expand/collapse toggle button */
const ExpandCollapseButton = ({
  isExpanded,
  collapsedLabel,
  onToggle,
}: {
  isExpanded: boolean;
  collapsedLabel: string;
  onToggle: () => void;
}) => {
  const tCommon = useTranslations("Common");

  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-ring hover:text-ring/80 mt-2 flex items-center gap-1 font-mono text-xs transition-colors"
    >
      {isExpanded ? (
        <>
          <ChevronUp className="h-3 w-3" />
          {tCommon("showLess")}
        </>
      ) : (
        <>
          <ChevronDown className="h-3 w-3" />
          {collapsedLabel}
        </>
      )}
    </button>
  );
};

/** Renders a grid of catalog cards */
const CatalogGrid = ({
  catalogs,
  selectedCatalogId,
  datasetCountByCatalog,
  eventCountsByCatalog,
  onSelect,
}: {
  catalogs: DataSourceCatalog[];
  selectedCatalogId: string | null;
  datasetCountByCatalog: Record<string, number>;
  eventCountsByCatalog?: Record<string, number>;
  onSelect: (catalogId: string) => void;
}) => (
  <div className="grid grid-cols-2 gap-2">
    {catalogs.map((catalog) => (
      <CatalogCard
        key={catalog.id}
        catalog={catalog}
        isSelected={selectedCatalogId === String(catalog.id)}
        datasetCount={datasetCountByCatalog[String(catalog.id)] ?? 0}
        eventCount={eventCountsByCatalog?.[String(catalog.id)]}
        onSelect={onSelect}
      />
    ))}
  </div>
);

/* oxlint-disable-next-line eslint(complexity) -- Inline handlers after React Compiler migration increase reported complexity */
export const DataSourceSelector = ({ eventCountsByCatalog, eventCountsByDataset }: DataSourceSelectorProps) => {
  const t = useTranslations("Filters");
  const tCommon = useTranslations("Common");
  const { filters, toggleCatalog, toggleDataset } = useFilters();
  const [catalogsExpanded, setCatalogsExpanded] = useState(false);
  const [datasetsExpanded, setDatasetsExpanded] = useState(false);

  // View scope for filtering displayed catalogs/datasets
  const viewContext = useView();
  const scopeCatalogIds = viewContext?.dataScope.catalogIds;
  const scopeDatasetIds = viewContext?.dataScope.datasetIds;

  // Auth state for ownership grouping
  const { isAuthenticated } = useAuthState();

  // Fetch lightweight catalog/dataset data
  const { data: dataSources } = useDataSourcesQuery();

  // Group catalogs by ownership (owned vs public), each sorted by event count
  const { owned: ownedCatalogs, public: publicCatalogs } = groupCatalogs(
    dataSources?.catalogs ?? [],
    scopeCatalogIds,
    eventCountsByCatalog
  );
  const allSortedCatalogs = [...ownedCatalogs, ...publicCatalogs];
  const showGrouping = isAuthenticated && ownedCatalogs.length > 0;

  // Get datasets for selected catalog, sorted by event count
  // Filter by view scope if active
  const filteredDatasets = filterAndSortDatasets(
    dataSources?.datasets ?? [],
    filters.catalog,
    scopeDatasetIds,
    eventCountsByDataset
  );

  // Count datasets per catalog
  const datasetCountByCatalog = countDatasetsByCatalog(dataSources?.datasets ?? []);

  // Handle catalog selection - auto-select all datasets in that catalog
  const handleCatalogSelect = (catalogId: string) => {
    const datasets = dataSources?.datasets ?? [];
    const catalogDatasets = datasets
      .filter((d) => d.catalogId != null && String(d.catalogId) === catalogId)
      .map((d) => String(d.id));
    toggleCatalog(catalogId, catalogDatasets);
  };

  // Catalog expand/collapse handler
  const handleToggleCatalogsExpanded = () => {
    setCatalogsExpanded((prev) => !prev);
  };

  // Dataset expand/collapse handler
  const handleToggleDatasetsExpanded = () => {
    setDatasetsExpanded((prev) => !prev);
  };

  // Catalog visibility - use CSS overflow instead of slicing to maintain stable positions
  const useCatalogCollapse = allSortedCatalogs.length > CATALOG_COLLAPSE_THRESHOLD;
  const hiddenCatalogCount = allSortedCatalogs.length - CATALOG_VISIBLE_WHEN_COLLAPSED;

  // Dataset visibility
  const useDatasetCollapse = filteredDatasets.length > DATASET_COLLAPSE_THRESHOLD;
  const visibleDatasets = useDatasetCollapse && !datasetsExpanded ? filteredDatasets.slice(0, 4) : filteredDatasets;
  const hiddenDatasetCount = filteredDatasets.length - 4;

  // Calculate active dataset count
  const activeDatasetCount = filters.datasets.filter((id) => filteredDatasets.some((d) => String(d.id) === id)).length;

  // Shared props for catalog grids
  const gridProps = {
    selectedCatalogId: filters.catalog,
    datasetCountByCatalog,
    eventCountsByCatalog,
    onSelect: handleCatalogSelect,
  };

  return (
    <div className="space-y-4">
      {/* Catalog Selection */}
      <div>
        <div className="text-muted-foreground mb-2 font-mono text-xs tracking-wider uppercase">{t("catalogs")}</div>

        {/* Collapsible container wraps all catalog groups */}
        <div
          className={cn(
            "space-y-3 transition-[max-height] duration-200 motion-reduce:transition-none",
            useCatalogCollapse && !catalogsExpanded && "max-h-[180px] overflow-hidden"
          )}
        >
          {showGrouping ? (
            <>
              {/* My Catalogs group */}
              <div>
                <div className="text-muted-foreground mb-1 font-mono text-[10px] tracking-wider uppercase">
                  {t("myCatalogs")}
                </div>
                <CatalogGrid catalogs={ownedCatalogs} {...gridProps} />
              </div>

              {/* Public Catalogs group */}
              {publicCatalogs.length > 0 && (
                <div>
                  <div className="text-muted-foreground mb-1 font-mono text-[10px] tracking-wider uppercase">
                    {t("publicCatalogs")}
                  </div>
                  <CatalogGrid catalogs={publicCatalogs} {...gridProps} />
                </div>
              )}
            </>
          ) : (
            /* Flat ungrouped grid (anonymous or no owned catalogs) */
            <CatalogGrid catalogs={allSortedCatalogs} {...gridProps} />
          )}
        </div>

        {/* Expand/collapse button for many catalogs */}
        {useCatalogCollapse && (
          <ExpandCollapseButton
            isExpanded={catalogsExpanded}
            collapsedLabel={tCommon("showAll", { count: hiddenCatalogCount })}
            onToggle={handleToggleCatalogsExpanded}
          />
        )}
      </div>

      {/* Dataset Selection - only show when a catalog is selected */}
      {filters.catalog != null && (
        <div className="border-primary/10 border-t pt-4">
          <div className="text-muted-foreground mb-2 flex items-center justify-between font-mono text-xs tracking-wider uppercase">
            <span>
              {t("datasets")}
              {activeDatasetCount < filteredDatasets.length && (
                <span className="text-secondary ml-1">
                  {t("active", { active: activeDatasetCount, total: filteredDatasets.length })}
                </span>
              )}
            </span>
          </div>

          {filteredDatasets.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noDatasets")}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {visibleDatasets.map((dataset) => (
                  <DatasetChip
                    key={dataset.id}
                    dataset={dataset}
                    isActive={filters.datasets.includes(String(dataset.id))}
                    eventCount={eventCountsByDataset?.[String(dataset.id)]}
                    onToggle={toggleDataset}
                  />
                ))}

                {/* Show "+X more" indicator when collapsed */}
                {useDatasetCollapse && !datasetsExpanded && hiddenDatasetCount > 0 && (
                  <span className="text-primary/40 self-center font-mono text-xs">
                    {t("more", { count: hiddenDatasetCount })}
                  </span>
                )}
              </div>

              {/* Expand/collapse button for many datasets */}
              {useDatasetCollapse && (
                <ExpandCollapseButton
                  isExpanded={datasetsExpanded}
                  collapsedLabel={tCommon("showAllDatasets")}
                  onToggle={handleToggleDatasetsExpanded}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
