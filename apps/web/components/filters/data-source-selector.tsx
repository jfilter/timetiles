/**
 * Dataset-centric data source selector with compact checkbox tree.
 *
 * Datasets are grouped by catalog. Each catalog is a collapsible section
 * with a tri-state checkbox that toggles all its datasets. Multiple
 * catalogs can be active simultaneously. Single-dataset catalogs render
 * as flat rows without group nesting. An info icon on each row opens a
 * popover with full metadata.
 *
 * @module
 * @category Components
 */
"use client";

import { Checkbox } from "@timetiles/ui/components/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@timetiles/ui/components/popover";
import { cn } from "@timetiles/ui/lib/utils";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { getDatasetColors } from "@/lib/constants/dataset-colors";
import { useView } from "@/lib/context/view-context";
import { useAuthState } from "@/lib/hooks/use-auth-queries";
import { useDataSourcesQuery } from "@/lib/hooks/use-data-sources-query";
import { useFilters } from "@/lib/hooks/use-filters";
import type { DataSourceCatalog, DataSourceDataset } from "@/lib/types/data-sources";

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

/** Map ISO 639-3 language codes to display names */
const getLanguageName = (code: string): string => {
  // ISO 639-3 to 639-1 for Intl.DisplayNames
  const map: Record<string, string> = { eng: "en", deu: "de", fra: "fr", spa: "es", ita: "it", nld: "nl", por: "pt" };
  const shortCode = map[code] ?? code;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(shortCode) ?? code;
  } catch {
    return code;
  }
};

/** Info popover showing dataset metadata */
const DatasetInfoPopover = ({
  dataset,
  eventCount,
  catalogName,
}: {
  dataset: DataSourceDataset;
  eventCount?: number;
  catalogName?: string;
}) => {
  const t = useTranslations("Filters");
  const hasDetails = dataset.description || dataset.language || eventCount != null || catalogName;
  if (!hasDetails) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5 transition-colors"
          aria-label={t("datasetInfo", { name: dataset.name })}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-64">
        <div className="space-y-2">
          <p className="text-sm font-medium">{dataset.name}</p>
          {dataset.description && (
            <p className="text-muted-foreground text-xs leading-relaxed">{dataset.description}</p>
          )}
          <dl className="text-xs">
            {dataset.language && (
              <div className="flex justify-between py-0.5">
                <dt className="text-muted-foreground">{t("language")}</dt>
                <dd>{getLanguageName(dataset.language)}</dd>
              </div>
            )}
            {eventCount != null && (
              <div className="flex justify-between py-0.5">
                <dt className="text-muted-foreground">{t("events")}</dt>
                <dd>{eventCount.toLocaleString()}</dd>
              </div>
            )}
            {catalogName && (
              <div className="flex justify-between py-0.5">
                <dt className="text-muted-foreground">{t("catalog")}</dt>
                <dd>{catalogName}</dd>
              </div>
            )}
          </dl>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** Info popover showing catalog metadata */
const CatalogInfoPopover = ({
  catalog,
  eventCount,
  datasetCount,
}: {
  catalog: DataSourceCatalog;
  eventCount: number;
  datasetCount: number;
}) => {
  const t = useTranslations("Filters");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5 transition-colors"
          aria-label={t("datasetInfo", { name: catalog.name })}
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-64">
        <div className="space-y-2">
          <p className="text-sm font-medium">{catalog.name}</p>
          {catalog.description && (
            <p className="text-muted-foreground text-xs leading-relaxed">{catalog.description}</p>
          )}
          <dl className="text-xs">
            <div className="flex justify-between py-0.5">
              <dt className="text-muted-foreground">{t("datasets")}</dt>
              <dd>{datasetCount}</dd>
            </div>
            <div className="flex justify-between py-0.5">
              <dt className="text-muted-foreground">{t("events")}</dt>
              <dd>{eventCount.toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** Catalog group header — visually consistent with dataset rows */
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
    <div className="flex items-start gap-2 py-1">
      <Checkbox
        checked={checkState === "all" ? true : checkState === "some" ? "indeterminate" : false}
        onCheckedChange={onToggleCheck}
        aria-label={t(checkState === "none" ? "selectAllInCatalog" : "deselectAllInCatalog", {
          name: group.catalog.name,
        })}
        className="mt-0.5 h-4 w-4 shrink-0"
      />

      <button type="button" onClick={onToggleExpand} className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="text-foreground line-clamp-2 min-w-0 text-left text-sm font-medium">{group.catalog.name}</span>
        <span className="text-muted-foreground ml-auto shrink-0 font-mono text-xs">
          {formatCount(group.totalEvents)}
        </span>
        {isExpanded ? (
          <ChevronDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        )}
      </button>
      <div className="mt-0.5 shrink-0">
        <CatalogInfoPopover
          catalog={group.catalog}
          eventCount={group.totalEvents}
          datasetCount={group.datasets.length}
        />
      </div>
    </div>
  );
};

/** Individual dataset row with checkbox, color accent, and info icon */
const DatasetRow = ({
  dataset,
  isSelected,
  eventCount,
  onToggle,
  indent = false,
  catalogName,
}: {
  dataset: DataSourceDataset;
  isSelected: boolean;
  eventCount?: number;
  onToggle: () => void;
  /** Whether to indent (nested under a catalog group) */
  indent?: boolean;
  /** Catalog name shown as subtitle (for single-dataset catalogs) */
  catalogName?: string;
}) => {
  const colors = getDatasetColors(dataset.id);

  return (
    <div className={cn("flex items-start gap-2 py-1", indent && "pl-6")}>
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggle}
          className={cn("mt-0.5 h-4 w-4 shrink-0", colors.border, colors.checkedBg, "data-[state=checked]:text-white")}
        />
        <span className="min-w-0 flex-1">
          <span className="text-foreground line-clamp-2 block text-sm font-medium">{dataset.name}</span>
          {catalogName && (
            <span className="text-muted-foreground block truncate text-[11px] leading-tight">{catalogName}</span>
          )}
        </span>
      </label>
      {eventCount != null && (
        <span className="text-muted-foreground mt-0.5 shrink-0 font-mono text-xs">{formatCount(eventCount)}</span>
      )}
      <div className="mt-0.5 shrink-0">
        <DatasetInfoPopover dataset={dataset} eventCount={eventCount} catalogName={catalogName} />
      </div>
    </div>
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
              indent
            />
          ))}

          {useCollapse && !showAll && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-ring hover:text-ring/80 py-0.5 pl-6 font-mono text-xs transition-colors"
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
  <div className="text-muted-foreground mt-3 mb-1.5 font-mono text-xs tracking-wider uppercase first:mt-0">
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

  const renderGroup = (group: CatalogGroup) => {
    // Single-dataset catalogs render as a flat row without group nesting
    if (group.datasets.length === 1) {
      const dataset = group.datasets[0]!;
      return (
        <DatasetRow
          key={dataset.id}
          dataset={dataset}
          isSelected={filters.datasets.includes(String(dataset.id))}
          eventCount={eventCountsByDataset?.[String(dataset.id)]}
          onToggle={() => toggleDataset(String(dataset.id))}
          indent={false}
          catalogName={group.catalog.name}
        />
      );
    }

    return (
      <CatalogGroupSection
        key={group.catalog.id}
        group={group}
        selectedDatasets={filters.datasets}
        eventCountsByDataset={eventCountsByDataset}
        onToggleCatalog={toggleCatalogDatasets}
        onToggleDataset={toggleDataset}
      />
    );
  };

  if (catalogGroups.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("noDatasets")}</p>;
  }

  return (
    <div className="space-y-1">
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
