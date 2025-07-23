"use client";

import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";

import { useFilters } from "../lib/filters";
import type { Catalog, Dataset } from "../payload-types";

interface EventFiltersProps {
  catalogs: Catalog[];
  datasets: Dataset[];
}

export function EventFilters({ catalogs, datasets }: EventFiltersProps) {
  const { filters, setCatalog, setDatasets, setStartDate, setEndDate } =
    useFilters();

  const filteredDatasets =
    filters.catalog !== null
      ? datasets.filter(
          (d) =>
            typeof d.catalog === "object" &&
            d.catalog !== null &&
            String(d.catalog.id) === filters.catalog,
        )
      : datasets;

  const handleDatasetToggle = (datasetId: string) => {
    const current = filters.datasets;
    const newDatasets = current.includes(datasetId)
      ? current.filter((id) => id !== datasetId)
      : [...current, datasetId];
    void setDatasets(newDatasets);
  };

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="catalog-select">Catalog</Label>
        <Select
          value={filters.catalog ?? "all"}
          onValueChange={(value) => void setCatalog(value)}
        >
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
            <p className="text-muted-foreground text-sm">
              No datasets available
            </p>
          ) : (
            filteredDatasets.map((dataset) => (
              <label
                key={dataset.id}
                className="hover:bg-accent/50 flex cursor-pointer items-center space-x-2 rounded p-2"
              >
                <input
                  type="checkbox"
                  checked={filters.datasets.includes(String(dataset.id))}
                  onChange={() => handleDatasetToggle(String(dataset.id))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">{dataset.name}</span>
              </label>
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
            onChange={(e) => void setStartDate(e.target.value || null)}
            className="border-input placeholder:text-muted-foreground focus-visible:ring-ring mt-2 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div>
          <Label htmlFor="end-date">End Date</Label>
          <input
            type="date"
            id="end-date"
            value={filters.endDate ?? ""}
            onChange={(e) => void setEndDate(e.target.value || null)}
            className="border-input placeholder:text-muted-foreground focus-visible:ring-ring mt-2 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {(filters.startDate !== null || filters.endDate !== null) && (
          <button
            onClick={() => {
              void setStartDate(null);
              void setEndDate(null);
            }}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Clear date filters
          </button>
        )}
      </div>
    </div>
  );
}
