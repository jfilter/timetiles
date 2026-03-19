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

import { Button, Card, CardContent, Input, Label } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { ArrowRight, DatabaseIcon, FileSpreadsheetIcon, FolderIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { useCatalogsQuery } from "@/lib/hooks/use-catalogs-query";
import { humanizeFileName } from "@/lib/import/humanize-file-name";

import { useWizard } from "../wizard-context";

export interface StepDatasetSelectionProps {
  className?: string;
}

/** Stable empty array to avoid creating a new reference on each render. */
const EMPTY_DATASETS: Array<{ id: number; name: string }> = [];

interface DatasetSelectProps {
  sheetIndex: number;
  value: number | "new";
  datasets: Array<{ id: number; name: string }>;
  onDatasetChange: (sheetIndex: number, value: string) => void;
}

const DatasetSelect = ({ sheetIndex, value, datasets, onDatasetChange }: Readonly<DatasetSelectProps>) => {
  const t = useTranslations("Import");

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onDatasetChange(sheetIndex, e.target.value);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`dataset-${sheetIndex}`}>{t("targetDataset")}</Label>
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
        <option value="new">{t("createNewDataset")}</option>
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
  const t = useTranslations("Import");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onNameChange(sheetIndex, e.target.value);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`dataset-name-${sheetIndex}`}>{t("datasetName")}</Label>
      <Input
        id={`dataset-name-${sheetIndex}`}
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={t("enterDatasetName")}
      />
    </div>
  );
};

// oxlint-disable-next-line eslint(complexity) -- wizard step with many conditional UI branches
export const StepDatasetSelection = ({ className }: Readonly<StepDatasetSelectionProps>) => {
  const t = useTranslations("Import");
  const { state, nextStep, canProceed, setCatalog, setSheetMapping } = useWizard();
  const { sheets, selectedCatalogId, newCatalogName, sheetMappings } = state;

  const { data: catalogsData, isLoading, error: queryError } = useCatalogsQuery();
  const catalogs = catalogsData?.catalogs ?? [];
  const errorMessage = queryError instanceof Error ? queryError.message : t("failedToLoadCatalogs");
  const error = queryError ? errorMessage : null;

  // Derive a clean catalog name from the uploaded file name
  const suggestedCatalogName = state.file?.name ? humanizeFileName(state.file.name) : "";

  // Auto-select "new catalog" if user has no existing catalogs
  useEffect(() => {
    if (catalogs.length === 0 && selectedCatalogId === null && !isLoading) {
      setCatalog("new", suggestedCatalogName);
    }
  }, [catalogs.length, selectedCatalogId, isLoading, setCatalog, suggestedCatalogName]);

  const handleCatalogChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "new") {
      setCatalog("new");
    } else {
      setCatalog(value ? Number(value) : null);
    }
  };

  const handleNewCatalogNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCatalog("new", e.target.value);
  };

  const handleDatasetChange = (sheetIndex: number, value: string) => {
    setSheetMapping(sheetIndex, { datasetId: value === "new" ? "new" : Number(value) });
  };

  const handleNewDatasetNameChange = (sheetIndex: number, name: string) => {
    setSheetMapping(sheetIndex, { newDatasetName: name });
  };

  // Callback for single sheet case (index 0) to avoid inline function in JSX
  const handleSingleSheetNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleNewDatasetNameChange(0, e.target.value);
  };

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
        <h2 className="text-cartographic-charcoal font-serif text-3xl font-bold">{t("selectDestination")}</h2>
        <p className="text-cartographic-navy/70 mt-2">{t("selectDestinationDescription")}</p>
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
              <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">{t("catalog")}</h3>
              <p className="text-cartographic-navy/70 text-sm">
                {catalogs.length === 0 ? t("createCatalogPrompt") : t("selectOrCreateCatalog")}
              </p>
            </div>
          </div>
        </div>
        <CardContent className="space-y-4 p-6">
          {/* Show dropdown only if user has existing catalogs */}
          {catalogs.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="catalog-select" className="text-cartographic-charcoal">
                {t("selectCatalog")}
              </Label>
              <select
                id="catalog-select"
                value={selectedCatalogId === "new" ? "new" : (selectedCatalogId ?? "")}
                onChange={handleCatalogChange}
                className="border-cartographic-navy/20 text-cartographic-charcoal focus:border-cartographic-blue focus:ring-cartographic-blue/20 flex h-11 w-full rounded-sm border bg-white px-4 py-2 text-sm transition-colors focus:ring-2 focus:outline-none"
              >
                <option value="">{t("chooseCatalog")}</option>
                {catalogs.map((catalog) => (
                  <option key={catalog.id} value={catalog.id}>
                    {catalog.name}
                  </option>
                ))}
                <option value="new">{t("createNewCatalog")}</option>
              </select>
            </div>
          )}

          {selectedCatalogId === "new" && (
            <div className="space-y-2">
              <Label htmlFor="new-catalog-name" className="text-cartographic-charcoal">
                {t("catalogName")}
              </Label>
              <Input
                id="new-catalog-name"
                type="text"
                value={newCatalogName}
                onChange={handleNewCatalogNameChange}
                placeholder={t("enterCatalogName")}
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
                <h3 className="text-cartographic-charcoal font-serif text-lg font-semibold">{t("dataset")}</h3>
                <p className="text-cartographic-navy/70 text-sm">
                  {sheets.length === 1 ? t("nameYourDataset") : t("mapSheetsToDatasets")}
                </p>
              </div>
            </div>
          </div>
          <CardContent className="p-6">
            {sheets.length === 1 ? (
              // Simplified single-sheet view
              <div className="space-y-2">
                <Label htmlFor="dataset-name-0" className="text-cartographic-charcoal">
                  {t("datasetName")}
                </Label>
                <Input
                  id="dataset-name-0"
                  type="text"
                  value={sheetMappings[0]?.newDatasetName ?? ""}
                  onChange={handleSingleSheetNameChange}
                  placeholder={t("enterDatasetName")}
                  className="border-cartographic-navy/20 focus:border-cartographic-blue focus:ring-cartographic-blue/20"
                />
                <p className="text-cartographic-navy/50 font-mono text-xs">
                  {t("rowsWillBeImported", { count: sheets[0]?.rowCount.toLocaleString() ?? "0" })}
                </p>
              </div>
            ) : (
              // Multi-sheet view
              <div className="space-y-4">
                {sheets.map((sheet) => {
                  const mapping = sheetMappings.find((m) => m.sheetIndex === sheet.index);
                  const datasets =
                    selectedCatalogId === "new" ? EMPTY_DATASETS : (selectedCatalog?.datasets ?? EMPTY_DATASETS);

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
                          {t("rowCount", { count: sheet.rowCount.toLocaleString() })}
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
                            {t("percentMatch", { percent: Math.round(mapping.similarityScore * 100) })}
                          </span>
                          <span className="text-cartographic-navy/50">{t("schemaSimilarity")}</span>
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

      {/* Continue button */}
      {canProceed && (
        <div className="flex justify-end pt-4">
          <Button size="lg" onClick={nextStep} className="gap-2">
            {t("continue")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
