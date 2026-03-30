/**
 * Dataset-centric data source selector with compact checkbox tree.
 *
 * Datasets are grouped by catalog. Each catalog is a collapsible section
 * with a tri-state checkbox that toggles all its datasets. Multiple
 * catalogs can be active simultaneously.
 *
 * @module
 * @category Components
 */
"use client";

import { Checkbox } from "@timetiles/ui/components/checkbox";
import { cn } from "@timetiles/ui/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { getDatasetColors } from "@/lib/constants/dataset-colors";
import { useView } from "@/lib/context/view-context";
import { useAuthState } from "@/lib/hooks/use-auth-queries";
import { useDataSourcesQuery } from "@/lib/hooks/use-data-sources-query";
import { useFilters } from "@/lib/hooks/use-filters";

import {
  type CatalogGroup,
  DATASET_COLLAPSE_THRESHOLD,
  formatCount,
  getCatalogCheckState,
  groupCatalogs,
  groupDatasetsByCatalog,
} from "./data-source-selector-helpers";

interface DataSourceSelectorProps {
  eventCountsByCatalog?: Record<string, number>;
  eventCountsByDataset?: Record<string, number>;
}

/** Catalog group header with tri-state checkbox and expand/collapse chevron */
const CatalogGroupHeader = ({
  group,
  checkState,
  isExpanded,
  onToggleCheck,
  onToggleExpand,
}: {
  group: CatalogGroup;
  checkState: "all" | "some" | "none";
  isExpanded: boolean;
  onToggleCheck: () => void;
  onToggleExpand: () => void;
}) => {
  const t = useTranslations("Filters");

  return (
    <div className="flex items-center gap-1.5 py-1">
      <Checkbox
        checked={checkState === "all" ? true : checkState === "some" ? "indeterminate" : false}
        onCheckedChange={onToggleCheck}
        aria-label={t(checkState === "none" ? "selectAllInCatalog" : "deselectAllInCatalog", {
          name: group.catalog.name,
        })}
        className="h-3.5 w-3.5"
      />

      <button type="button" onClick={onToggleExpand} className="flex min-w-0 flex-1 items-center gap-1">
        <span className="text-foreground truncate text-xs font-medium">{group.catalog.name}</span>
        <span className="text-muted-foreground shrink-0 font-mono text-[10px]">{formatCount(group.totalEvents)}</span>
        {isExpanded ? (
          <ChevronDown className="text-muted-foreground ml-auto h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground ml-auto h-3 w-3 shrink-0" />
        )}
      </button>
    </div>
  );
};

/** Individual dataset row with checkbox and color accent */
const DatasetRow = ({
  dataset,
  isSelected,
  eventCount,
  onToggle,
}: {
  dataset: { id: number; name: string };
  isSelected: boolean;
  eventCount?: number;
  onToggle: () => void;
}) => {
  const colors = getDatasetColors(dataset.id);

  return (
    <label className="flex cursor-pointer items-center gap-1.5 py-0.5 pl-5">
      <Checkbox checked={isSelected} onCheckedChange={onToggle} className="h-3 w-3" />
      <span className={cn("mr-0.5 inline-block h-2 w-2 shrink-0 rounded-full", colors.bg, colors.border, "border")} />
      <span className="text-foreground/80 min-w-0 truncate text-xs">{dataset.name}</span>
      {eventCount != null && (
        <span className="text-muted-foreground shrink-0 font-mono text-[10px]">{formatCount(eventCount)}</span>
      )}
    </label>
  );
};

/** A single catalog group: header + expandable dataset list */
const CatalogGroupSection = ({
  group,
  selectedDatasets,
  eventCountsByDataset,
  onToggleCatalog,
  onToggleDataset,
}: {
  group: CatalogGroup;
  selectedDatasets: string[];
  eventCountsByDataset?: Record<string, number>;
  onToggleCatalog: (datasetIds: string[]) => void;
  onToggleDataset: (datasetId: string) => void;
}) => {
  const catalogDatasetIds = group.datasets.map((d) => String(d.id));
  const checkState = getCatalogCheckState(catalogDatasetIds, selectedDatasets);

  // Expanded by default; auto-expand when any child is selected
  const hasSelectedChild = checkState !== "none";
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const isExpanded = manualExpanded ?? (hasSelectedChild || selectedDatasets.length === 0);

  const handleToggleCheck = () => {
    onToggleCatalog(catalogDatasetIds);
  };

  const handleToggleExpand = () => {
    setManualExpanded(isExpanded ? false : true);
  };

  // Collapse threshold for datasets within a group
  const useCollapse = group.datasets.length > DATASET_COLLAPSE_THRESHOLD;
  const [showAll, setShowAll] = useState(false);
  const visibleDatasets =
    useCollapse && !showAll ? group.datasets.slice(0, DATASET_COLLAPSE_THRESHOLD) : group.datasets;
  const hiddenCount = group.datasets.length - DATASET_COLLAPSE_THRESHOLD;

  return (
    <div>
      <CatalogGroupHeader
        group={group}
        checkState={checkState}
        isExpanded={isExpanded}
        onToggleCheck={handleToggleCheck}
        onToggleExpand={handleToggleExpand}
      />

      {isExpanded && (
        <div>
          {visibleDatasets.map((dataset) => (
            <DatasetRow
              key={dataset.id}
              dataset={dataset}
              isSelected={selectedDatasets.includes(String(dataset.id))}
              eventCount={eventCountsByDataset?.[String(dataset.id)]}
              onToggle={() => onToggleDataset(String(dataset.id))}
            />
          ))}

          {useCollapse && !showAll && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-ring hover:text-ring/80 py-0.5 pl-5 font-mono text-[10px] transition-colors"
            >
              +{hiddenCount} more
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/** Section label for owned/public groupings */
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-muted-foreground mt-2 mb-1 font-mono text-[10px] tracking-wider uppercase first:mt-0">
    {children}
  </div>
);

export const DataSourceSelector = ({ eventCountsByCatalog, eventCountsByDataset }: DataSourceSelectorProps) => {
  const t = useTranslations("Filters");
  const { filters, toggleCatalogDatasets, toggleDataset } = useFilters();

  // View scope for filtering displayed catalogs/datasets
  const viewContext = useView();
  const scopeCatalogIds = viewContext?.dataScope.catalogIds;
  const scopeDatasetIds = viewContext?.dataScope.datasetIds;

  // Auth state for ownership grouping
  const { isAuthenticated } = useAuthState();

  // Fetch lightweight catalog/dataset data
  const { data: dataSources } = useDataSourcesQuery();

  // Group datasets by catalog
  const catalogGroups = groupDatasetsByCatalog(
    dataSources?.datasets ?? [],
    dataSources?.catalogs ?? [],
    scopeCatalogIds,
    scopeDatasetIds,
    eventCountsByCatalog,
    eventCountsByDataset
  );

  // Split into owned vs public
  const { owned, public: publicGroups } = groupCatalogs(catalogGroups);
  const showGrouping = isAuthenticated && owned.length > 0;

  const renderGroup = (group: CatalogGroup) => (
    <CatalogGroupSection
      key={group.catalog.id}
      group={group}
      selectedDatasets={filters.datasets}
      eventCountsByDataset={eventCountsByDataset}
      onToggleCatalog={toggleCatalogDatasets}
      onToggleDataset={toggleDataset}
    />
  );

  if (catalogGroups.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noDatasets")}</p>;
  }

  return (
    <div>
      {showGrouping ? (
        <>
          <SectionLabel>{t("myCatalogs")}</SectionLabel>
          {owned.map(renderGroup)}

          {publicGroups.length > 0 && (
            <>
              <SectionLabel>{t("publicCatalogs")}</SectionLabel>
              {publicGroups.map(renderGroup)}
            </>
          )}
        </>
      ) : (
        catalogGroups.map(renderGroup)
      )}
    </div>
  );
};
