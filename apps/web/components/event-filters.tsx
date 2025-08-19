/**
 * Filter controls for event exploration.
 *
 * Provides UI controls for filtering events by date range, catalog,
 * dataset, and other criteria. Manages filter state and communicates
 * changes via URL parameters for shareable filter states.
 *
 * @module
 * @category Components
 */
"use client";

import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { type ChangeEvent, useCallback } from "react";

import { useFilters } from "../lib/filters";
import type { Catalog, Dataset } from "../payload-types";

interface DatasetCheckboxProps {
  dataset: Dataset;
  checked: boolean;
  onToggle: (datasetId: string) => void;
}

const DatasetCheckbox = ({ dataset, checked, onToggle }: DatasetCheckboxProps) => {
  const handleChange = useCallback(() => {
    onToggle(String(dataset.id));
  }, [dataset.id, onToggle]);

  return (
    <label key={dataset.id} className="hover:bg-accent/50 flex cursor-pointer items-center space-x-2 rounded p-2">
      <input type="checkbox" checked={checked} onChange={handleChange} className="rounded border-gray-300" />
      <span className="text-sm">{dataset.name}</span>
    </label>
  );
};

interface EventFiltersProps {
  catalogs: Catalog[];
  datasets: Dataset[];
}

export const EventFilters = ({ catalogs, datasets }: Readonly<EventFiltersProps>) => {
  const { filters, setCatalog, setDatasets, setStartDate, setEndDate } = useFilters();

  const handleStartDateChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setStartDate(e.target.value || null);
    },
    [setStartDate]
  );

  const handleEndDateChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setEndDate(e.target.value || null);
    },
    [setEndDate]
  );

  const handleClearDateFilters = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
  }, [setStartDate, setEndDate]);

  const filteredDatasets =
    filters.catalog != null
      ? datasets.filter(
          (d) => typeof d.catalog === "object" && d.catalog != null && String(d.catalog.id) === filters.catalog
        )
      : datasets;

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

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="catalog-select">Catalog</Label>
        <Select value={filters.catalog ?? "all"} onValueChange={setCatalog}>
          <SelectTrigger id="catalog-select" className="mt-2">
            <SelectValue placeholder="Select a catalog" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Catalogs</SelectItem>
            {catalogs.map((catalog) => (
              <SelectItem key={catalog.id} value={String(catalog.id)}>
                {catalog.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Datasets</Label>
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {filteredDatasets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No datasets available</p>
          ) : (
            filteredDatasets.map((dataset) => (
              <DatasetCheckbox
                key={dataset.id}
                dataset={dataset}
                checked={filters.datasets.includes(String(dataset.id))}
                onToggle={handleDatasetToggle}
              />
            ))
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="start-date">Start Date</Label>
          <input
            type="date"
            id="start-date"
            value={filters.startDate ?? ""}
            onChange={handleStartDateChange}
            className="border-input placeholder:text-muted-foreground focus-visible:ring-ring mt-2 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div>
          <Label htmlFor="end-date">End Date</Label>
          <input
            type="date"
            id="end-date"
            value={filters.endDate ?? ""}
            onChange={handleEndDateChange}
            className="border-input placeholder:text-muted-foreground focus-visible:ring-ring mt-2 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {(filters.startDate != null || filters.endDate != null) && (
          <button
            type="button"
            onClick={handleClearDateFilters}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Clear date filters
          </button>
        )}
      </div>
    </div>
  );
};
