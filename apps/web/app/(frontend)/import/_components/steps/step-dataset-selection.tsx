/**
 * Dataset selection step for the import wizard.
 *
 * Allows users to select a catalog and choose target datasets
 * for each detected sheet. Shows schema similarity suggestions.
 *
 * @module
 * @category Components
 */
"use client";

import { Card, CardContent, Input, Label } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { DatabaseIcon, FileSpreadsheetIcon, FolderIcon, Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useWizard } from "../wizard-context";

export interface StepDatasetSelectionProps {
  className?: string;
}

interface Catalog {
  id: number;
  name: string;
  datasets: Array<{ id: number; name: string }>;
}

interface DatasetSelectProps {
  sheetIndex: number;
  value: number | "new";
  datasets: Array<{ id: number; name: string }>;
  onDatasetChange: (sheetIndex: number, value: string) => void;
}

const DatasetSelect = ({ sheetIndex, value, datasets, onDatasetChange }: Readonly<DatasetSelectProps>) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onDatasetChange(sheetIndex, e.target.value);
    },
    [sheetIndex, onDatasetChange]
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={`dataset-${sheetIndex}`}>Target dataset</Label>
      <select
        id={`dataset-${sheetIndex}`}
        value={value === "new" ? "new" : value}
        onChange={handleChange}
        className="border-input bg-background flex h-11 w-full rounded-sm border px-4 py-2 text-sm"
      >
        {datasets.map((dataset) => (
          <option key={dataset.id} value={dataset.id}>
            {dataset.name}
          </option>
        ))}
        <option value="new">+ Create new dataset</option>
      </select>
    </div>
  );
};

interface DatasetNameInputProps {
  sheetIndex: number;
  value: string;
  onNameChange: (sheetIndex: number, name: string) => void;
}

const DatasetNameInput = ({ sheetIndex, value, onNameChange }: Readonly<DatasetNameInputProps>) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onNameChange(sheetIndex, e.target.value);
    },
    [sheetIndex, onNameChange]
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={`dataset-name-${sheetIndex}`}>Dataset name</Label>
      <Input
        id={`dataset-name-${sheetIndex}`}
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Enter dataset name"
      />
    </div>
  );
};

export const StepDatasetSelection = ({ className }: Readonly<StepDatasetSelectionProps>) => {
  const { state, setCatalog, setSheetMapping, nextStep, setNavigationConfig } = useWizard();
  const { sheets, selectedCatalogId, newCatalogName, sheetMappings } = state;

  // Configure navigation for this step
  useEffect(() => {
    setNavigationConfig({
      onNext: () => nextStep(),
    });
    return () => setNavigationConfig({});
  }, [setNavigationConfig, nextStep]);

  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derive a clean catalog name from the uploaded file name
  const suggestedCatalogName = useMemo(() => {
    if (!state.file?.name) return "";
    // Remove file extension and clean up the name
    return state.file.name
      .replace(/\.[^/.]+$/, "") // Remove extension
      .replace(/[-_]+/g, " ") // Replace dashes/underscores with spaces
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim();
  }, [state.file?.name]);

  // Fetch user's catalogs on mount
  useEffect(() => {
    const fetchCatalogs = async () => {
      try {
        const response = await fetch("/api/wizard/catalogs", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch catalogs");
        }

        const data = await response.json();
        setCatalogs(data.catalogs);

        // Auto-select "new catalog" if user has no existing catalogs
        // and pre-fill the name from the uploaded file
        if (data.catalogs.length === 0 && selectedCatalogId === null) {
          setCatalog("new", suggestedCatalogName);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load catalogs");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchCatalogs();
  }, [selectedCatalogId, setCatalog, suggestedCatalogName]);

  const handleCatalogChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value === "new") {
        setCatalog("new");
      } else if (value) {
        setCatalog(Number(value));
      } else {
        setCatalog(null);
      }
    },
    [setCatalog]
  );

  const handleNewCatalogNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCatalog("new", e.target.value);
    },
    [setCatalog]
  );

  const handleDatasetChange = useCallback(
    (sheetIndex: number, value: string) => {
      if (value === "new") {
        setSheetMapping(sheetIndex, { datasetId: "new" });
      } else {
        setSheetMapping(sheetIndex, { datasetId: Number(value) });
      }
    },
    [setSheetMapping]
  );

  const handleNewDatasetNameChange = useCallback(
    (sheetIndex: number, name: string) => {
      setSheetMapping(sheetIndex, { newDatasetName: name });
    },
    [setSheetMapping]
  );

  // Callback for single sheet case (index 0) to avoid inline function in JSX
  const handleSingleSheetNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleNewDatasetNameChange(0, e.target.value);
    },
    [handleNewDatasetNameChange]
  );

  const selectedCatalog = catalogs.find((c) => c.id === selectedCatalogId);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Loader2Icon className="text-primary h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="text-center">
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">Select destination</h2>
        <p className="text-cartographic-navy/70 mt-2">Choose where to import your data.</p>
      </div>

      {error && <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{error}</div>}

      {/* Catalog selection */}
      <Card className="overflow-hidden">
        <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-cartographic-terracotta/10 flex h-10 w-10 items-center justify-center rounded-sm">
              <FolderIcon className="text-cartographic-terracotta h-5 w-5" />
            </div>
            <div>
              <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">Catalog</h3>
              <p className="text-cartographic-navy/70 text-sm">
                {catalogs.length === 0 ? "Create a catalog to organize your data" : "Select or create a catalog"}
              </p>
            </div>
          </div>
        </div>
        <CardContent className="space-y-4 p-6">
          {/* Show dropdown only if user has existing catalogs */}
          {catalogs.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="catalog-select" className="text-cartographic-charcoal">
                Select catalog
              </Label>
              <select
                id="catalog-select"
                value={selectedCatalogId === "new" ? "new" : (selectedCatalogId ?? "")}
                onChange={handleCatalogChange}
                className="border-cartographic-navy/20 text-cartographic-charcoal focus:border-cartographic-blue focus:ring-cartographic-blue/20 flex h-11 w-full rounded-sm border bg-white px-4 py-2 text-sm transition-colors focus:ring-2 focus:outline-none"
              >
                <option value="">Choose a catalog...</option>
                {catalogs.map((catalog) => (
                  <option key={catalog.id} value={catalog.id}>
                    {catalog.name}
                  </option>
                ))}
                <option value="new">+ Create new catalog</option>
              </select>
            </div>
          )}

          {selectedCatalogId === "new" && (
            <div className="space-y-2">
              <Label htmlFor="new-catalog-name" className="text-cartographic-charcoal">
                Catalog name
              </Label>
              <Input
                id="new-catalog-name"
                type="text"
                value={newCatalogName}
                onChange={handleNewCatalogNameChange}
                placeholder="Enter catalog name"
                className="border-cartographic-navy/20 focus:border-cartographic-blue focus:ring-cartographic-blue/20"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dataset selection */}
      {selectedCatalogId !== null && sheets.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-cartographic-navy/10 bg-cartographic-cream/30 border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="bg-cartographic-blue/10 flex h-10 w-10 items-center justify-center rounded-sm">
                <DatabaseIcon className="text-cartographic-blue h-5 w-5" />
              </div>
              <div>
                <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">Dataset</h3>
                <p className="text-cartographic-navy/70 text-sm">
                  {sheets.length === 1 ? "Name your dataset" : "Map sheets to datasets"}
                </p>
              </div>
            </div>
          </div>
          <CardContent className="p-6">
            {sheets.length === 1 ? (
              // Simplified single-sheet view
              <div className="space-y-2">
                <Label htmlFor="dataset-name-0" className="text-cartographic-charcoal">
                  Dataset name
                </Label>
                <Input
                  id="dataset-name-0"
                  type="text"
                  value={sheetMappings[0]?.newDatasetName ?? ""}
                  onChange={handleSingleSheetNameChange}
                  placeholder="Enter dataset name"
                  className="border-cartographic-navy/20 focus:border-cartographic-blue focus:ring-cartographic-blue/20"
                />
                <p className="text-cartographic-navy/50 font-mono text-xs">
                  {sheets[0]?.rowCount.toLocaleString()} rows will be imported
                </p>
              </div>
            ) : (
              // Multi-sheet view
              <div className="space-y-4">
                {sheets.map((sheet) => {
                  const mapping = sheetMappings.find((m) => m.sheetIndex === sheet.index);
                  const datasets = selectedCatalogId === "new" ? [] : (selectedCatalog?.datasets ?? []);

                  return (
                    <div
                      key={sheet.index}
                      className="border-cartographic-navy/10 bg-cartographic-cream/20 rounded-sm border p-4"
                    >
                      {/* Sheet info header */}
                      <div className="mb-3 flex items-center gap-3">
                        <FileSpreadsheetIcon className="text-cartographic-navy/50 h-4 w-4" />
                        <span className="text-cartographic-charcoal font-medium">{sheet.name}</span>
                        <span className="text-cartographic-navy/50 font-mono text-xs">
                          {sheet.rowCount.toLocaleString()} rows
                        </span>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <DatasetSelect
                          sheetIndex={sheet.index}
                          value={mapping?.datasetId === "new" ? "new" : (mapping?.datasetId ?? "new")}
                          datasets={datasets}
                          onDatasetChange={handleDatasetChange}
                        />

                        {mapping?.datasetId === "new" && (
                          <DatasetNameInput
                            sheetIndex={sheet.index}
                            value={mapping.newDatasetName}
                            onNameChange={handleNewDatasetNameChange}
                          />
                        )}
                      </div>

                      {/* Schema similarity indicator */}
                      {mapping?.similarityScore !== null && mapping?.similarityScore !== undefined && (
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          <span className="bg-cartographic-forest/10 text-cartographic-forest rounded px-2 py-0.5 font-mono text-xs">
                            {Math.round(mapping.similarityScore * 100)}% match
                          </span>
                          <span className="text-cartographic-navy/50">Schema similarity</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
