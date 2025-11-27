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

import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { FolderIcon, Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useWizard } from "../wizard-context";
import { WizardNavigation } from "../wizard-navigation";

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
  const { state, setCatalog, setSheetMapping, nextStep } = useWizard();
  const { sheets, selectedCatalogId, newCatalogName, sheetMappings } = state;

  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load catalogs");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchCatalogs();
  }, []);

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

  const handleNext = useCallback(() => {
    nextStep();
  }, [nextStep]);

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
        <h2 className="text-2xl font-semibold">Select destination</h2>
        <p className="text-muted-foreground mt-2">Choose where to import your data.</p>
      </div>

      {error && <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{error}</div>}

      {/* Catalog selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderIcon className="h-5 w-5" />
            Catalog
          </CardTitle>
          <CardDescription>Select an existing catalog or create a new one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="catalog-select">Select catalog</Label>
            <select
              id="catalog-select"
              value={selectedCatalogId === "new" ? "new" : (selectedCatalogId ?? "")}
              onChange={handleCatalogChange}
              className="border-input bg-background flex h-11 w-full rounded-sm border px-4 py-2 text-sm"
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

          {selectedCatalogId === "new" && (
            <div className="space-y-2">
              <Label htmlFor="new-catalog-name">New catalog name</Label>
              <Input
                id="new-catalog-name"
                type="text"
                value={newCatalogName}
                onChange={handleNewCatalogNameChange}
                placeholder="Enter catalog name"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dataset selection for each sheet */}
      {selectedCatalogId !== null && sheets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dataset mapping</CardTitle>
            <CardDescription>Choose which dataset each sheet should be imported into.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {sheets.map((sheet) => {
              const mapping = sheetMappings.find((m) => m.sheetIndex === sheet.index);
              const datasets = selectedCatalogId === "new" ? [] : (selectedCatalog?.datasets ?? []);

              return (
                <div key={sheet.index} className="space-y-3 border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{sheet.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {sheet.rowCount.toLocaleString()} rows, {sheet.headers.length} columns
                      </p>
                    </div>
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

                  {/* Schema similarity indicator - placeholder for Phase 4 */}
                  {mapping?.similarityScore !== null && mapping?.similarityScore !== undefined && (
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                      <span className="bg-primary/20 text-primary rounded px-2 py-0.5 text-xs font-medium">
                        {Math.round(mapping.similarityScore * 100)}% match
                      </span>
                      <span>Schema similarity with existing dataset</span>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <WizardNavigation onNext={handleNext} />
    </div>
  );
};
