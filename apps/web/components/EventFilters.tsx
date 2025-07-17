"use client";

import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import type { Catalog, Dataset } from "../payload-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Label } from "@workspace/ui/components/label";

interface EventFiltersProps {
  catalogs: Catalog[];
  datasets: Dataset[];
}

export function EventFilters({ catalogs, datasets }: EventFiltersProps) {
  const [selectedCatalog, setSelectedCatalog] = useQueryState(
    "catalog",
    parseAsString,
  );
  const [selectedDatasets, setSelectedDatasets] = useQueryState(
    "datasets",
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [startDate, setStartDate] = useQueryState("startDate", parseAsString);
  const [endDate, setEndDate] = useQueryState("endDate", parseAsString);

  const filteredDatasets = selectedCatalog
    ? datasets.filter(
        (d) =>
          typeof d.catalog === "object" &&
          String(d.catalog.id) === selectedCatalog,
      )
    : datasets;

  const handleCatalogChange = (value: string) => {
    if (value === "all") {
      setSelectedCatalog(null);
      setSelectedDatasets([]);
    } else {
      setSelectedCatalog(value);
      setSelectedDatasets([]);
    }
  };

  const handleDatasetToggle = (datasetId: string) => {
    setSelectedDatasets((current) =>
      current.includes(datasetId)
        ? current.filter((id) => id !== datasetId)
        : [...current, datasetId],
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="catalog-select">Catalog</Label>
        <Select
          value={selectedCatalog || "all"}
          onValueChange={handleCatalogChange}
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
                  checked={selectedDatasets.includes(String(dataset.id))}
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
            value={startDate || ""}
            onChange={(e) => setStartDate(e.target.value || null)}
            className="border-input placeholder:text-muted-foreground focus-visible:ring-ring mt-2 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div>
          <Label htmlFor="end-date">End Date</Label>
          <input
            type="date"
            id="end-date"
            value={endDate || ""}
            onChange={(e) => setEndDate(e.target.value || null)}
            className="border-input placeholder:text-muted-foreground focus-visible:ring-ring mt-2 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {(startDate || endDate) && (
          <button
            onClick={() => {
              setStartDate(null);
              setEndDate(null);
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
