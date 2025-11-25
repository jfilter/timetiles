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
import { useCallback, useMemo, useState } from "react";

import { useFilters } from "@/lib/filters";
import type { Catalog, Dataset } from "@/payload-types";

interface DataSourceSelectorProps {
  catalogs: Catalog[];
  datasets: Dataset[];
  /** Event counts by catalog ID - shows total events per catalog */
  eventCountsByCatalog?: Record<string, number>;
  /** Event counts by dataset ID - shows total events per dataset */
  eventCountsByDataset?: Record<string, number>;
}

/** Number of datasets to show before collapsing */
const DATASET_COLLAPSE_THRESHOLD = 10;

/**
 * Format large numbers compactly (e.g., 12450 -> "12.4k")
 */
const formatCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
};

/**
 * Catalog card component showing catalog name, dataset count, and event count.
 */
interface CatalogCardProps {
  catalog: Catalog;
  isSelected: boolean;
  datasetCount: number;
  eventCount?: number;
  onSelect: (catalogId: string) => void;
}

const CatalogCard = ({ catalog, isSelected, datasetCount, eventCount, onSelect }: CatalogCardProps) => {
  const handleClick = useCallback(() => {
    onSelect(String(catalog.id));
  }, [catalog.id, onSelect]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "relative w-full break-inside-avoid rounded-sm border p-2 text-left transition-all",
        "hover:bg-cartographic-cream/50 dark:hover:bg-white/10",
        isSelected
          ? "border-cartographic-terracotta bg-cartographic-cream/30 dark:bg-white/15"
          : "border-cartographic-navy/20 bg-transparent dark:border-white/30"
      )}
    >
      {/* Checkmark for selected state */}
      {isSelected && (
        <div className="bg-cartographic-terracotta absolute right-1 top-1 rounded-full p-0.5">
          <Check className="h-2.5 w-2.5 text-white" />
        </div>
      )}

      {/* Catalog name - allow 2 lines with truncation */}
      <div
        className={cn(
          "line-clamp-2 pr-5 font-serif text-xs font-medium leading-tight",
          isSelected ? "text-cartographic-charcoal dark:text-white" : "text-cartographic-navy/70 dark:text-white/80"
        )}
      >
        {catalog.name}
      </div>

      {/* Stats - stacked vertically */}
      <div className="text-cartographic-navy/50 mt-1 space-y-0.5 font-mono text-[10px] dark:text-white/60">
        <div>
          {datasetCount} {datasetCount === 1 ? "dataset" : "datasets"}
        </div>
        {eventCount != null && <div>{formatCount(eventCount)} events</div>}
      </div>
    </button>
  );
};

/**
 * Dataset chip component for toggling individual datasets.
 */
interface DatasetChipProps {
  dataset: Dataset;
  isActive: boolean;
  eventCount?: number;
  onToggle: (datasetId: string) => void;
}

const DatasetChip = ({ dataset, isActive, eventCount, onToggle }: DatasetChipProps) => {
  const handleClick = useCallback(() => {
    onToggle(String(dataset.id));
  }, [dataset.id, onToggle]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "rounded-sm border px-2 py-1 text-left transition-all",
        "hover:border-cartographic-blue/50",
        isActive
          ? "border-cartographic-blue/30 bg-cartographic-blue/10 text-cartographic-charcoal"
          : "border-cartographic-navy/20 text-cartographic-navy/50 decoration-cartographic-navy/30 line-through"
      )}
    >
      <span className="text-xs">{dataset.name}</span>
      {eventCount != null && (
        <span className="text-cartographic-navy/40 ml-1 font-mono text-[10px]">{formatCount(eventCount)}</span>
      )}
    </button>
  );
};

export const DataSourceSelector = ({
  catalogs,
  datasets,
  eventCountsByCatalog,
  eventCountsByDataset,
}: DataSourceSelectorProps) => {
  const { filters, setCatalog, setDatasets } = useFilters();
  const [datasetsExpanded, setDatasetsExpanded] = useState(false);

  // Sort catalogs by event count (descending), then by name
  const sortedCatalogs = useMemo(() => {
    return [...catalogs].sort((a, b) => {
      const countA = eventCountsByCatalog?.[String(a.id)] ?? 0;
      const countB = eventCountsByCatalog?.[String(b.id)] ?? 0;
      if (countB !== countA) return countB - countA;
      return a.name.localeCompare(b.name);
    });
  }, [catalogs, eventCountsByCatalog]);

  // Get datasets for selected catalog, sorted by event count
  const filteredDatasets = useMemo(() => {
    const catalogDatasets =
      filters.catalog != null
        ? datasets.filter(
            (d) => typeof d.catalog === "object" && d.catalog != null && String(d.catalog.id) === filters.catalog
          )
        : datasets;

    return [...catalogDatasets].sort((a, b) => {
      const countA = eventCountsByDataset?.[String(a.id)] ?? 0;
      const countB = eventCountsByDataset?.[String(b.id)] ?? 0;
      if (countB !== countA) return countB - countA;
      return a.name.localeCompare(b.name);
    });
  }, [datasets, filters.catalog, eventCountsByDataset]);

  // Count datasets per catalog
  const datasetCountByCatalog = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const dataset of datasets) {
      if (typeof dataset.catalog === "object" && dataset.catalog != null) {
        const catalogId = String(dataset.catalog.id);
        counts[catalogId] = (counts[catalogId] ?? 0) + 1;
      }
    }
    return counts;
  }, [datasets]);

  // Handle catalog selection - auto-select all datasets in that catalog
  const handleCatalogSelect = useCallback(
    (catalogId: string) => {
      if (catalogId === filters.catalog) {
        // Toggle off: show all data
        setCatalog(null);
        void setDatasets([]);
      } else {
        // Select catalog and auto-select all its datasets
        setCatalog(catalogId);
        const catalogDatasets = datasets
          .filter((d) => typeof d.catalog === "object" && d.catalog != null && String(d.catalog.id) === catalogId)
          .map((d) => String(d.id));
        void setDatasets(catalogDatasets);
      }
    },
    [datasets, filters.catalog, setCatalog, setDatasets]
  );

  // Handle dataset toggle
  const handleDatasetToggle = useCallback(
    (datasetId: string) => {
      const current = filters.datasets;
      const newDatasets = current.includes(datasetId)
        ? current.filter((id) => id !== datasetId)
        : [...current, datasetId];
      void setDatasets(newDatasets);
    },
    [filters.datasets, setDatasets]
  );

  // Dataset expand/collapse handler
  const handleToggleExpanded = useCallback(() => {
    setDatasetsExpanded((prev) => !prev);
  }, []);

  // Dataset visibility
  const useCollapse = filteredDatasets.length > DATASET_COLLAPSE_THRESHOLD;
  const visibleDatasets = useCollapse && !datasetsExpanded ? filteredDatasets.slice(0, 4) : filteredDatasets;
  const hiddenCount = filteredDatasets.length - 4;

  // Calculate active dataset count
  const activeDatasetCount = filters.datasets.filter((id) => filteredDatasets.some((d) => String(d.id) === id)).length;

  return (
    <div className="space-y-4">
      {/* Catalog Selection */}
      <div>
        <div className="text-cartographic-navy/60 mb-2 font-mono text-xs uppercase tracking-wider">Catalogs</div>

        {/* Masonry layout for catalogs */}
        <div className="columns-2 gap-2 space-y-2">
          {sortedCatalogs.map((catalog) => (
            <CatalogCard
              key={catalog.id}
              catalog={catalog}
              isSelected={filters.catalog === String(catalog.id)}
              datasetCount={datasetCountByCatalog[String(catalog.id)] ?? 0}
              eventCount={eventCountsByCatalog?.[String(catalog.id)]}
              onSelect={handleCatalogSelect}
            />
          ))}
        </div>
      </div>

      {/* Dataset Selection - only show when a catalog is selected */}
      {filters.catalog != null && (
        <div className="border-cartographic-navy/10 border-t pt-4">
          <div className="text-cartographic-navy/60 mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-wider">
            <span>
              Datasets
              {activeDatasetCount < filteredDatasets.length && (
                <span className="text-cartographic-terracotta ml-1">
                  ({activeDatasetCount}/{filteredDatasets.length} active)
                </span>
              )}
            </span>
          </div>

          {filteredDatasets.length === 0 ? (
            <p className="text-cartographic-navy/50 text-sm">No datasets available</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {visibleDatasets.map((dataset) => (
                  <DatasetChip
                    key={dataset.id}
                    dataset={dataset}
                    isActive={filters.datasets.includes(String(dataset.id))}
                    eventCount={eventCountsByDataset?.[String(dataset.id)]}
                    onToggle={handleDatasetToggle}
                  />
                ))}

                {/* Show "+X more" indicator when collapsed */}
                {useCollapse && !datasetsExpanded && hiddenCount > 0 && (
                  <span className="text-cartographic-navy/40 self-center font-mono text-xs">+{hiddenCount} more</span>
                )}
              </div>

              {/* Expand/collapse button for many datasets */}
              {useCollapse && (
                <button
                  type="button"
                  onClick={handleToggleExpanded}
                  className="text-cartographic-blue hover:text-cartographic-blue/80 mt-2 flex items-center gap-1 font-mono text-xs transition-colors"
                >
                  {datasetsExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Show all datasets
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
